#!/bin/bash
set -euo pipefail
chown -R redpanda:redpanda /var/lib/redpanda/data
# setpriv keeps the environment: point HOME at the redpanda user's, or rpk reads /root.
export HOME=/var/lib/redpanda
exec setpriv --reuid=redpanda --regid=redpanda --init-groups /entrypoint.sh "$@"
