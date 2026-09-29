"""Shared status-aware multi-engine DDGS search for local and serverless APIs."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ddgs import DDGS
from ddgs.engines import ENGINES
from ddgs.engines.duckduckgo import Duckduckgo
from ddgs.exceptions import DDGSException
from dotenv import load_dotenv

ENGINE_NAMES = ("duckduckgo", "brave", "google", "mojeek", "startpage", "yahoo")
engine_pool = ThreadPoolExecutor(max_workers=6)
HOST_RE = re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\Z")
SITE_RE = re.compile(r"(?:^|\s)site:([a-z0-9.-]+)(/[a-z0-9._~/-]*)?(?=\s|$)", re.IGNORECASE)
RANK_STOP_WORDS = {"11st", "11번가", "coupang", "쿠팡", "ikea", "이케아", "amazon", "gmarket", "g마켓",
                   "auction", "옥션", "korea", "korean", "한국", "대한민국", "krw", "원", "가격", "배송", "배송비",
                   "price", "shipping", "cost", "sale", "buy", "cm", "mm", "inch", "inches"}
load_dotenv()


class SearchProviderError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def normalize_approved_hosts(hosts):
    if not isinstance(hosts, (list, tuple)) or len(hosts) > 20:
        raise SearchProviderError("INVALID_SOURCE_HOSTS")
    normalized = sorted({host.lower() for host in hosts if isinstance(host, str)})
    if len(normalized) != len(hosts) or any(not HOST_RE.fullmatch(host) for host in normalized):
        raise SearchProviderError("INVALID_SOURCE_HOSTS")
    return normalized


class StatusAwareDuckduckgo(Duckduckgo):
    def request(self, *args, **kwargs):
        response = self.http_client.request(*args, **kwargs)
        if response.status_code != 200:
            raise DDGSException(f"SEARCH_UPSTREAM_HTTP_{response.status_code}")
        return response.text


# DDGS 9.16.0 otherwise converts non-200 responses such as HTTP 202 into empty hits.
ENGINES["text"]["duckduckgo"] = StatusAwareDuckduckgo


def _search_engine(query, page, engine):
    try:
        rows = DDGS(timeout=8, verify=True).text(query, region="kr-kr", safesearch="moderate",
                                                 max_results=10, page=page, backend=engine)
        return engine, rows, None
    except DDGSException as exc:
        message = str(exc)
        if message == "No results found.":
            return engine, [], None
        return engine, [], "busy" if "429" in message else "unavailable"
    except Exception:
        return engine, [], "unavailable"


def _tavily_results(query, approved_hosts, api_key):
    domains = []
    path_filters = []
    matches = list(SITE_RE.finditer(query))
    if matches:
        for site in matches:
            requested_host, path = site.group(1).lower(), site.group(2) or ""
            if any(part in (".", "..") for part in path.split("/")):
                raise SearchProviderError("SEARCH_SCOPE_MISMATCH")
            approved = next((host for host in approved_hosts
                             if requested_host == host or requested_host == host.removeprefix("www.") or
                             host == "www." + requested_host), None)
            if approved is None:
                raise SearchProviderError("SEARCH_SCOPE_MISMATCH")
            domains.append(approved)
            if path:
                path_filters.append(f"site:{requested_host}{path}")
        query = SITE_RE.sub(" ", query).strip()
        if path_filters:
            query = " ".join([*path_filters, query]).strip()
    if not query:
        raise SearchProviderError("INVALID_QUERY")

    payload = {"query": query, "topic": "general", "search_depth": "basic", "max_results": 10,
               "include_answer": False, "include_raw_content": False}
    if domains:
        payload.update(include_domains=sorted(set(domains)), include_domains_mode="restrict")
    elif approved_hosts:
        payload.update(include_domains=approved_hosts, include_domains_mode="prefer")
    if any("\uac00" <= char <= "\ud7a3" for char in query):
        payload.update(country="south korea", language="ko")
    elif re.search(r"\b(?:KRW|Korea)\b", query, re.IGNORECASE):
        payload["country"] = "south korea"

    request = Request("https://api.tavily.com/search", data=json.dumps(payload).encode(),
                      headers={"Authorization": "Bearer " + api_key,
                               "Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=12) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise SearchProviderError("SEARCH_INVALID_RESPONSE")
        data = json.loads(raw)
        source_rows = data.get("results")
        if not isinstance(source_rows, list) or len(source_rows) > 20:
            raise SearchProviderError("SEARCH_INVALID_RESPONSE")
        rows = []
        for item in source_rows:
            if not isinstance(item, dict):
                continue
            href, title, body = item.get("url"), item.get("title"), item.get("content", "")
            if not isinstance(href, str) or not href or len(href) >= 4096 or not isinstance(title, str) or not title:
                continue
            rows.append({"href": href, "title": title[:300],
                         "body": body[:2000] if isinstance(body, str) else ""})
            if len(rows) == 10:
                break
        return {"provider": "tavily", "backend": "tavily", "partial": False,
                "failedEngines": [], "results": rows}
    except HTTPError as exc:
        raise SearchProviderError("SEARCH_BUSY" if exc.code == 429 else "SEARCH_PROVIDER_UNAVAILABLE") from None
    except (URLError, TimeoutError, json.JSONDecodeError):
        raise SearchProviderError("SEARCH_UNAVAILABLE") from None


def _relevance_score(query, row):
    searchable_query = SITE_RE.sub(" ", query)
    query_terms = {token.casefold() for token in re.findall(
        r"[\w]+", unicodedata.normalize("NFKC", searchable_query), re.UNICODE)
                   if len(token) > 1 and token.casefold() not in RANK_STOP_WORDS}
    if not query_terms:
        return 0
    page_text = unicodedata.normalize(
        "NFKC", f"{row.get('title', '')} {row.get('body', '')}").casefold()
    return sum(token in page_text for token in query_terms)


def search_results(query, page, approved_hosts=()):
    approved_hosts = normalize_approved_hosts(approved_hosts)
    tavily_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if tavily_key:
        return _tavily_results(query, approved_hosts, tavily_key)
    futures = [engine_pool.submit(_search_engine, query, page, engine) for engine in ENGINE_NAMES]
    responses = [future.result() for future in futures]
    failed = [engine for engine, _rows, error in responses if error]
    busy = any(error == "busy" for _engine, _rows, error in responses)

    rows, seen = [], set()
    for index in range(max((len(hits) for _engine, hits, _error in responses), default=0)):
        for _engine, hits, _error in responses:
            if index >= len(hits):
                continue
            hit = hits[index]
            href, title = hit.get("href"), hit.get("title")
            if not isinstance(href, str) or not href or len(href) >= 4096 or not isinstance(title, str) or not title:
                continue
            if href in seen:
                continue
            seen.add(href)
            rows.append({"href": href, "title": title[:300],
                         "body": hit.get("body", "")[:2000] if isinstance(hit.get("body", ""), str) else ""})
            if len(rows) == 10:
                break
        if len(rows) == 10:
            break

    if failed and not rows:
        raise SearchProviderError("SEARCH_BUSY" if busy else "SEARCH_UNAVAILABLE")
    rows.sort(key=lambda row: _relevance_score(query, row), reverse=True)
    return {"provider": "ddgs", "backend": "multi", "partial": bool(failed),
            "failedEngines": failed, "results": rows}
