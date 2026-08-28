# 5. Monorepo with a uv workspace

Date: 2026-08-28

## Status
Accepted

## Context
Ten services plus a shared library that changes often (schemas, events, auth). We want atomic
cross-cutting changes, one set of tooling, and simple local dev.

## Decision
Single Git repo. `uv` workspace: `libs/*` + `services/*` members, one lockfile, one
`pyproject.toml` for ruff/mypy/pytest config. One parametrised `Dockerfile`
(`--build-arg SERVICE=`) and one generic Helm chart render all services. CI uses path filters
so only affected services build/test.

Alternatives: polyrepo (version-hell on `finsight-common`, no atomic changes); Pants/Bazel
(power we don't need yet); Poetry (no first-class workspace, slower).

## Consequences
+ Change a schema and all consumers in one PR/commit; one `uv sync`.
+ New service = a directory + a Helm `services:` key.
− Repo grows; CI must stay path-aware to remain fast.
− Coarse-grained access control (mitigated by CODEOWNERS).
