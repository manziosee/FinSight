"""The IPv6 listener must also accept IPv4 (Fly health checks arrive over IPv4)."""

from __future__ import annotations

import socket

import pytest

from finsight_common.serve import app_path, bind


def test_app_path() -> None:
    assert app_path("identity-service") == "identity_service.main:app"


def test_ipv4_host_is_left_to_uvicorn() -> None:
    assert bind("0.0.0.0", 0) is None


@pytest.mark.skipif(not socket.has_dualstack_ipv6(), reason="no dual-stack support")
def test_ipv6_any_accepts_ipv4_and_ipv6() -> None:
    server = bind("::", 0)
    assert server is not None
    try:
        server.listen()
        port = server.getsockname()[1]
        for family, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
            with socket.socket(family) as client:
                client.settimeout(2)
                client.connect((addr, port))
                conn, _ = server.accept()
                conn.close()
    finally:
        server.close()
