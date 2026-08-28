"""RFC 9457 problem-details error model and FastAPI exception handlers."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from finsight_common.logging import get_logger

_log = get_logger(__name__)

PROBLEM_CONTENT_TYPE = "application/problem+json"


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    errors: list[dict[str, Any]] | None = Field(default=None)


class FinSightError(Exception):
    """Base class for domain errors that map to a problem response."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    title: str = "Bad Request"
    type: str = "https://docs.finsight.dev/errors/bad-request"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.title)
        self.detail = detail


class NotFoundError(FinSightError):
    status_code = status.HTTP_404_NOT_FOUND
    title = "Not Found"
    type = "https://docs.finsight.dev/errors/not-found"


class ConflictError(FinSightError):
    status_code = status.HTTP_409_CONFLICT
    title = "Conflict"
    type = "https://docs.finsight.dev/errors/conflict"


class AuthenticationError(FinSightError):
    status_code = status.HTTP_401_UNAUTHORIZED
    title = "Unauthorized"
    type = "https://docs.finsight.dev/errors/unauthorized"


class AuthorizationError(FinSightError):
    status_code = status.HTTP_403_FORBIDDEN
    title = "Forbidden"
    type = "https://docs.finsight.dev/errors/forbidden"


def _problem_response(problem: ProblemDetail) -> JSONResponse:
    return JSONResponse(
        status_code=problem.status,
        content=problem.model_dump(exclude_none=True),
        media_type=PROBLEM_CONTENT_TYPE,
    )


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(FinSightError)
    async def _handle_domain(request: Request, exc: FinSightError) -> JSONResponse:
        return _problem_response(
            ProblemDetail(
                type=exc.type,
                title=exc.title,
                status=exc.status_code,
                detail=exc.detail,
                instance=str(request.url.path),
            )
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _problem_response(
            ProblemDetail(
                type="https://docs.finsight.dev/errors/validation",
                title="Unprocessable Entity",
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Request validation failed.",
                instance=str(request.url.path),
                errors=[dict(e) for e in exc.errors()],
            )
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _problem_response(
            ProblemDetail(
                title=str(exc.detail),
                status=exc.status_code,
                instance=str(request.url.path),
            )
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        _log.error("unhandled_exception", path=request.url.path, error=str(exc))
        return _problem_response(
            ProblemDetail(
                type="https://docs.finsight.dev/errors/internal",
                title="Internal Server Error",
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                instance=str(request.url.path),
            )
        )
