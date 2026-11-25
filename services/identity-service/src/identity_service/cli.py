"""Operator commands for identity-service.

    python -m identity_service.cli create-client --client-id admin [--tenant tenant_demo]

Creates (or rotates) a client_credentials client and prints its new secret once, as JSON.
With no --scopes it gets every scope the platform defines (an administrator). Run it where
the service runs, e.g. ``fly ssh console -a finsight-identity-service -C "..."``.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import sys

from finsight_common.db import Database
from identity_service.config import get_settings
from identity_service.keys import SigningKey
from identity_service.service import IdentityService


async def _create_client(args: argparse.Namespace) -> dict:
    settings = get_settings()
    scopes = args.scopes.split() if args.scopes else settings.seed_scopes.split()
    secret = secrets.token_urlsafe(32)
    db = Database(settings.identity_db_dsn)
    service = IdentityService(
        settings, SigningKey(settings.jwt_private_key_pem, settings.jwt_key_id)
    )
    try:
        async with db.session() as session:
            await service.upsert_client(
                session,
                client_id=args.client_id,
                client_secret=secret,
                tenant_id=args.tenant,
                scopes=scopes,
                tenant_name=args.tenant_name,
            )
    finally:
        await db.dispose()
    return {
        "client_id": args.client_id,
        "client_secret": secret,
        "tenant_id": args.tenant,
        "scopes": sorted(set(scopes)),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="identity_service.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-client", help="create or rotate a client_credentials client")
    create.add_argument("--client-id", required=True)
    create.add_argument("--tenant", default="tenant_demo")
    create.add_argument("--tenant-name", default=None)
    create.add_argument("--scopes", default=None, help="space-separated; default: all scopes")
    args = parser.parse_args(argv)
    result = asyncio.run(_create_client(args))
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
