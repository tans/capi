from __future__ import annotations

from datetime import datetime
import inspect
import json
import os
import time
from collections.abc import AsyncIterator, Iterator
from typing import Any
from urllib.parse import urlparse

import litellm
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="CAPI LiteLLM compatibility service", version=os.getenv("COMPAT_VERSION", "1.0.0"))
MAX_BODY_BYTES = int(os.getenv("COMPAT_MAX_BODY_BYTES", "1048576"))
SERVICE_TOKEN = os.getenv("CAPI_COMPAT_TOKEN", "")



class Deployment(BaseModel):
    id: str
    config_version: int = Field(ge=1)
    provider: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=300)
    api_base: str = Field(min_length=1, max_length=2000)


class Credentials(BaseModel):
    api_key: str = Field(min_length=1, max_length=4096)


class Execution(BaseModel):
    deadline_at: str
    connect_timeout_ms: int = Field(ge=1, le=300_000)
    idle_timeout_ms: int = Field(ge=1, le=3_600_000)


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=1, max_length=200)
    attempt_id: str = Field(min_length=1, max_length=200)
    protocol: str = Field(pattern="^(chat|responses)$")
    deployment: Deployment
    credentials: Credentials
    execution: Execution
    body: dict[str, Any]


def event(kind: str, data: Any) -> bytes:
    return f"event: {kind}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n".encode()


def response_dict(value: Any) -> Any:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump(exclude_none=False)
    if hasattr(value, "dict"):
        return value.dict()
    return value


def validate_base(url: str) -> None:
    parsed = urlparse(url)
    allowed_hosts = {h.strip().lower() for h in os.getenv("COMPAT_ALLOWED_HOSTS", "").split(",") if h.strip()}
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(400, "api_base must be an absolute HTTP(S) URL")
    if parsed.hostname.lower() not in allowed_hosts and parsed.scheme != "https":
        raise HTTPException(400, "non-HTTPS api_base requires an administrator allowlist")


def usage_of(value: Any) -> dict[str, Any]:
    raw = response_dict(value).get("usage") if isinstance(response_dict(value), dict) else None
    if not raw:
        return {"inputTokens": None, "outputTokens": None, "cacheReadTokens": None, "cacheWriteTokens": None, "reasoningTokens": None, "source": "unavailable"}
    raw = response_dict(raw)
    details = response_dict(raw.get("prompt_tokens_details") or {})
    completion = response_dict(raw.get("completion_tokens_details") or {})
    return {"inputTokens": raw.get("prompt_tokens"), "outputTokens": raw.get("completion_tokens"), "cacheReadTokens": details.get("cached_tokens"), "cacheWriteTokens": None, "reasoningTokens": completion.get("reasoning_tokens"), "source": "upstream"}


def kwargs_for(req: ExecuteRequest) -> dict[str, Any]:
    body = dict(req.body)
    body.pop("api_key", None)
    body.pop("api_base", None)
    body.pop("num_retries", None)
    body["model"] = req.deployment.model
    body["api_key"] = req.credentials.api_key
    body["api_base"] = req.deployment.api_base
    body["num_retries"] = 0
    remaining_ms = max(1, int((datetime.fromisoformat(req.execution.deadline_at.replace("Z", "+00:00")).timestamp() - time.time()) * 1000))
    body["timeout"] = min(req.execution.idle_timeout_ms, remaining_ms) / 1000
    return body


def run_call(req: ExecuteRequest) -> Any:
    kwargs = kwargs_for(req)
    if req.protocol == "responses":
        fn = getattr(litellm, "responses", None)
        if fn is None:
            raise HTTPException(422, "Responses protocol is unavailable in the pinned LiteLLM SDK")
    else:
        fn = litellm.completion
    return fn(**kwargs)


async def events(req: ExecuteRequest) -> AsyncIterator[bytes]:
    started = time.monotonic()
    yield event("start", {"request_id": req.request_id, "attempt_id": req.attempt_id, "deployment_id": req.deployment.id, "config_version": req.deployment.config_version})
    try:
        result = run_call(req)
        if inspect.isawaitable(result):
            result = await result
        if req.body.get("stream") is True:
            iterator = result
            if hasattr(iterator, "__aiter__"):
                async for chunk in iterator:
                    value = response_dict(chunk)
                    yield event("chunk", {"name": value.get("object", "chunk") if isinstance(value, dict) else "chunk", "data": value})
                    usage = usage_of(chunk)
                    if usage["source"] != "unavailable": yield event("usage", usage)
            else:
                for chunk in iterator:
                    value = response_dict(chunk)
                    yield event("chunk", {"name": value.get("object", "chunk") if isinstance(value, dict) else "chunk", "data": value})
            yield event("end", {"status": "success", "complete": True, "duration_ms": int((time.monotonic() - started) * 1000)})
        else:
            value = response_dict(result)
            yield event("response", value)
            yield event("usage", usage_of(result))
            yield event("end", {"status": "success", "complete": True, "duration_ms": int((time.monotonic() - started) * 1000)})
    except HTTPException:
        raise
    except Exception as exc:
        yield event("error", {"message": str(exc)[:500], "category": "upstream", "upstream_status": None})
        yield event("end", {"status": "error", "complete": False, "duration_ms": int((time.monotonic() - started) * 1000)})


@app.get("/health/live")
async def live() -> dict[str, bool]: return {"live": True}

@app.get("/health/ready")
async def ready() -> dict[str, Any]: return {"ready": True, "sdk": getattr(litellm, "__version__", "unknown")}

@app.get("/internal/v1/capabilities")
async def capabilities() -> dict[str, Any]: return {"version": app.version, "sdk": getattr(litellm, "__version__", "unknown"), "protocols": ["chat", "responses"] if hasattr(litellm, "responses") else ["chat"], "events": ["start", "response", "chunk", "usage", "error", "end"]}

@app.post("/internal/v1/execute")
async def execute(req: ExecuteRequest, request: Request, authorization: str | None = Header(default=None)) -> StreamingResponse:
    if SERVICE_TOKEN and authorization != f"Bearer {SERVICE_TOKEN}": raise HTTPException(401, "invalid service credentials")
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES: raise HTTPException(413, "request body too large")
    validate_base(req.deployment.api_base)
    return StreamingResponse(events(req), media_type="text/event-stream", headers={"cache-control": "no-cache", "x-request-id": req.request_id})
