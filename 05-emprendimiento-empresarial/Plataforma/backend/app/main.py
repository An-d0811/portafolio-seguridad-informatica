import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.migrations import run_migrations

settings = get_settings()

_start_time = time.time()
_request_counts: dict[str, int] = {}


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)
    run_migrations()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.middleware("http")
    async def count_requests(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        path = request.url.path
        _request_counts[path] = _request_counts.get(path, 0) + 1
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
        return response

    @app.get("/health")
    def health():
        return {"status": "ok", "environment": settings.environment}

    @app.get("/metrics")
    def metrics():
        lines = ["# TYPE guardia_requests_total counter"]
        lines.extend(f"guardia_requests_total{{path=\"{path}\"}} {count}" for path, count in sorted(_request_counts.items()))
        lines.append(f"guardia_uptime_seconds {int(time.time() - _start_time)}")
        lines.append("guardia_db_backups_enabled 1")
        return "\n".join(lines) + "\n"

    return app


app = create_app()
