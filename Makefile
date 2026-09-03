.DEFAULT_GOAL := help
.PHONY: help env up down restart logs ps health shell psql seed reset lint fmt clean

# Container engine. Podman is what this machine runs; override with
#   make CONTAINER=docker <target>
CONTAINER ?= podman
# Keep in sync with package.json and .github/workflows/lint.yml.
PRETTIER_VERSION ?= 3.9.6
COMPOSE ?= $(CONTAINER) compose
# Published port: from .env when it exists, otherwise the compose default.
PORT := $(shell sed -n 's/^WEB_PORT=//p' .env 2>/dev/null | tail -1)
PORT := $(if $(PORT),$(PORT),8081)
SERVICE ?= api

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "created .env - fill in the values")

up: env ## Build and start the lab
	$(COMPOSE) up -d --build
	@echo "http://localhost:$(PORT)"

down: ## Stop the lab, keep the volumes
	$(COMPOSE) down

restart: ## Restart the lab
	$(COMPOSE) restart

logs: ## Follow the logs
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

health: ## Ask the API
	@curl -fsS "http://localhost:$(PORT)/health" && echo

shell: ## Open a shell in a service (SERVICE=api)
	$(COMPOSE) exec $(SERVICE) sh

psql: ## Open psql on the database
	$(COMPOSE) exec db psql -U "$${POSTGRES_USER:-monkstore}" -d "$${POSTGRES_DB:-monkstore}"

seed: ## Apply migrations and seed the catalog by hand
	$(COMPOSE) run --rm api sh -c 'npx prisma migrate deploy && npm run seed'

reset: ## Wipe everything and rebuild from scratch
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build

lint: ## Run the linters
	npx eslint .

fmt: ## Format the sources
	npx --yes prettier@$(PRETTIER_VERSION) --write .

clean: ## Stop the lab and delete the volumes
	$(COMPOSE) down -v
