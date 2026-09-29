"""Loopback-only search API with opt-in Tavily and multi-engine DDGS providers."""
import asyncio
import os
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from search_service.providers import SearchProviderError, normalize_approved_hosts, search_results

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
pool = ThreadPoolExecutor(max_workers=2)
cache = OrderedDict()
inflight = {}


def remember(key, result):
    ttl = 5 if result.get("partial") or not result["results"] else 60
    cache[key] = (time.monotonic() + ttl, result)
    while len(cache) > 256:
        cache.popitem(last=False)


class Query(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=600)
    page: int = Field(default=1, ge=1, le=10)
    approved_hosts: list[str] = Field(default_factory=list, alias="approvedHosts", max_length=20)


@app.middleware("http")
async def local_only(request: Request, call_next):
    if request.headers.get("origin") or request.headers.get("sec-fetch-site") == "cross-site":
        return JSONResponse({"error": "ORIGIN_NOT_ALLOWED"}, status_code=403)
    if request.method == "POST":
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse({"error": "INVALID_CONTENT_TYPE"}, status_code=415)
        size = 0
        chunks = []
        async for chunk in request.stream():
            size += len(chunk)
            chunks.append(chunk)
            if size > 8192:
                return JSONResponse({"error": "BODY_TOO_LARGE"}, status_code=413)
        request._body = b"".join(chunks)  # Starlette cached request forwards this to the parser.
    return await call_next(request)


@app.get("/health")
async def health():
    provider = "tavily" if os.environ.get("TAVILY_API_KEY") else "ddgs"
    return {"status": "ready", "provider": provider, "backend": provider if provider == "tavily" else "multi"}


async def lookup(key):
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(pool, partial(search_results, key[0], key[1], key[2]))
        remember(key, result)
        return result
    except SearchProviderError as exc:
        raise HTTPException(429 if exc.code == "SEARCH_BUSY" else 503, exc.code) from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "SEARCH_UNAVAILABLE") from None
    finally:
        inflight.pop(key, None)


@app.post("/search/text")
async def search(query: Query):
    try:
        approved_hosts = normalize_approved_hosts(query.approved_hosts)
    except SearchProviderError:
        raise HTTPException(422, "INVALID_SOURCE_HOSTS") from None
    key = (query.query.strip(), query.page, tuple(approved_hosts))
    if not key[0] or len(key[0].split()) > 75:
        raise HTTPException(422, "INVALID_QUERY")
    now = time.monotonic()
    for old in list(cache):
        if cache[old][0] <= now:
            del cache[old]
    if key in cache:
        return cache[key][1]
    task = inflight.get(key)
    if task is None:
        if len(inflight) >= 2:
            raise HTTPException(429, "SEARCH_BUSY")
        task = asyncio.create_task(lookup(key))
        inflight[key] = task
    return await asyncio.shield(task)
