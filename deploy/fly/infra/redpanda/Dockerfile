# Redpanda (Kafka API) for FinSight on Fly. The stock image runs as `redpanda`, but Fly
# volumes mount root-owned, so start as root, fix ownership, then drop privileges.
FROM redpandadata/redpanda:v24.2.4@sha256:9b91885f3add2d9033724fad39f9dda3b0adda8084edcb57aa08d21f2868b6b6
USER root
COPY entrypoint.sh /fly-entrypoint.sh
ENTRYPOINT ["/fly-entrypoint.sh"]
