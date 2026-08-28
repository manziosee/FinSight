"""FinSight shared library: config, logging, telemetry, auth, errors, schemas, events, messaging."""

from finsight_common.errors import ProblemDetail, install_exception_handlers
from finsight_common.health import build_health_router

__all__ = ["ProblemDetail", "build_health_router", "install_exception_handlers"]

__version__ = "0.1.0"
