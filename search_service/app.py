"""Loopback-only DDGS text-search API. No key, Brave, arbitrary URL extraction or query logs."""
import asyncio
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from ddgs import DDGS
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
pool = ThreadPoolExecutor(max_workers=2)
cache = OrderedDict()
inflight = {}


class Query(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=600)
    page: int = Field(default=1, ge=1, le=10)


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
    return {"status": "ready", "provider": "ddgs", "backend": "duckduckgo"}


async def lookup(key):
    try:
        fn = partial(DDGS(timeout=8, verify=True).text, key[0], region="kr-kr",
                     safesearch="moderate", max_results=10, page=key[1], backend="duckduckgo")
        rows = await asyncio.get_running_loop().run_in_executor(pool, fn)
        result = {"results": [{"title": r["title"][:300], "href": r["href"],
                               "body": r.get("body", "")[:2000]} for r in rows[:10]],
                  "provider": "ddgs", "backend": "duckduckgo"}
        cache[key] = (time.monotonic() + 60, result)
        while len(cache) > 256:
            cache.popitem(last=False)
        return result
    except Exception:
        raise HTTPException(503, "SEARCH_UNAVAILABLE") from None
    finally:
        inflight.pop(key, None)


@app.post("/search/text")
async def search(query: Query):
    key = (query.query.strip(), query.page)
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
