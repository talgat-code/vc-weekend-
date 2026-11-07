from __future__ import annotations

import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import Settings
from app.repositories import Repository


class RateLimiter:
    def __init__(self, limit: int, window: int):
        self.limit, self.window = limit, window
        self.buckets: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            bucket = self.buckets[key]
            while bucket and bucket[0] < now - self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    repository = Repository(settings.database_path, settings.session_ttl_hours)
    limiter = RateLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        repository.initialize()
        yield

    app = FastAPI(
        title="BCC VED Copilot API", version="1.0.0",
        description="Four-step contract, application, invoice, and payment review API. Demo data is synthetic.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.repository = repository
    app.add_middleware(
        CORSMiddleware, allow_origins=list(dict.fromkeys(["http://localhost:5173", settings.frontend_origin])), allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "X-Session-Token", "X-Request-ID"], expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def security(request: Request, call_next):
        request.state.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))[:64]
        key = request.headers.get("X-Session-Token") or (request.client.host if request.client else "unknown")
        if not limiter.allow(key):
            response = JSONResponse(
                content={"request_id": request.state.request_id, "errors": [{"code": "RATE_LIMITED", "message": "Слишком много запросов."}]},
                status_code=429, headers={"Retry-After": str(settings.rate_limit_window_seconds)},
            )
        else:
            response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "message": str(exc.detail)}
        return JSONResponse(content={"request_id": request.state.request_id, "errors": [detail]}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def request_error(request: Request, exc: RequestValidationError):
        errors = [{"code": "INVALID_REQUEST", "message": "Проверьте значение и формат этого поля.", "field": ".".join(map(str, item["loc"][1:])) or None} for item in exc.errors()]
        return JSONResponse(content={"request_id": request.state.request_id, "errors": errors}, status_code=422)

    @app.get("/health", tags=["system"])
    def health():
        return {"status": "ok", "service": "bcc-ved-copilot", "version": "1.0.0"}

    app.include_router(router)
    return app


app = create_app()
