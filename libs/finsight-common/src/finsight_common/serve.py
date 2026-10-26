"""Container entrypoint: ``python -m finsight_common.serve``.

Runs ``<FINSIGHT_SERVICE>.main:app`` (``identity-service`` -> ``identity_service``) with
uvicorn. Bind address comes from ``UVICORN_HOST`` / ``UVICORN_PORT``.

Why not ``uvicorn --host ::``: asyncio marks IPv6 server sockets IPV6_V6ONLY, so ``::`` would
accept no IPv4 at all — and on Fly the private network is IPv6 while health checks arrive
over IPv4. For an IPv6 host we therefore create one dual-stack socket ourselves and hand
uvicorn its file descriptor.
"""

from __future__ import annotations

import os
import socket

import uvicorn


def app_path(service: str) -> str:
    return f"{service.replace('-', '_')}.main:app"


def bind(host: str, port: int) -> socket.socket | None:
    """Dual-stack socket for IPv6 hosts; None means let uvicorn bind (IPv4/hostnames)."""
    if ":" not in host:
        return None
    return socket.create_server(
        (host, port), family=socket.AF_INET6, dualstack_ipv6=True, reuse_port=False
    )


def main() -> None:
    host = os.environ.get("UVICORN_HOST", "0.0.0.0")
    port = int(os.environ.get("UVICORN_PORT", "8000"))
    options = {
        "proxy_headers": True,  # trusted proxies: FORWARDED_ALLOW_IPS (read by uvicorn)
        "server_header": False,
        "workers": int(os.environ.get("WEB_CONCURRENCY", "1")),
    }
    app = app_path(os.environ["FINSIGHT_SERVICE"])
    sock = bind(host, port)
    if sock is not None:
        uvicorn.run(app, fd=sock.fileno(), **options)
    else:
        uvicorn.run(app, host=host, port=port, **options)


if __name__ == "__main__":
    main()
