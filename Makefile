.DEFAULT_GOAL := help
SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: bootstrap
bootstrap: ## Generate local secrets/keys and .env
	./scripts/bootstrap.sh

.PHONY: install
install: ## Install the Python workspace with uv
	uv sync --all-packages

.PHONY: up
up: ## Start the full local stack
	$(COMPOSE) up -d --build
	@echo "Gateway:      http://localhost:8088/docs"
	@echo "Swagger UI:    http://localhost:18081"
	@echo "Grafana:       http://localhost:13000 (admin/admin)"
	@echo "Jaeger:        http://localhost:16686"
	@echo "Redpanda UI:   http://localhost:18082"
	@echo "MinIO console: http://localhost:19001"

.PHONY: down
down: ## Stop the local stack
	$(COMPOSE) down

.PHONY: clean
clean: ## Stop the stack and delete all volumes
	$(COMPOSE) down -v

.PHONY: logs
logs: ## Tail logs (svc=<service> to filter)
	$(COMPOSE) logs -f $(svc)

.PHONY: ps
ps: ## Show stack status
	$(COMPOSE) ps

.PHONY: seed
seed: ## Load demo financial data through the API
	./scripts/seed-demo-data.sh

.PHONY: smoke
smoke: ## Run the end-to-end smoke test against the running stack
	./scripts/smoke-test.sh

.PHONY: lint
lint: ## Lint + format-check + type-check
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy libs services

.PHONY: fmt
fmt: ## Auto-format
	uv run ruff check --fix .
	uv run ruff format .

.PHONY: test
test: ## Run unit tests
	uv run pytest -m "not integration"

.PHONY: test-all
test-all: ## Run unit + integration tests (needs docker)
	uv run pytest

.PHONY: openapi
openapi: ## Regenerate the aggregated OpenAPI spec
	./scripts/gen-openapi.sh

.PHONY: migrate
migrate: ## Run alembic migrations for every service that owns a DB
	@for s in identity-service ingestion-service normalization-service reconciliation-service; do \
	  echo ">> $$s"; \
	  $(COMPOSE) run --rm $$s alembic upgrade head; \
	done

.PHONY: security
security: ## Run the local security scan bundle
	uv run bandit -q -r services libs -c pyproject.toml || true
	uv run pip-audit || true
	gitleaks detect --no-banner --redact || true

.PHONY: helm-lint
helm-lint: ## Render + validate k8s manifests
	helm template finsight deploy/helm/finsight | kubeconform -strict -summary -ignore-missing-schemas

.PHONY: tf-validate
tf-validate: ## Validate Terraform + run checkov
	cd deploy/terraform/envs/staging && terraform init -backend=false && terraform validate
	checkov -d deploy/terraform --quiet --compact
