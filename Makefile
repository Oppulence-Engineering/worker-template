# Convenient shortcuts for common workflows in the Graphile Worker template.

SHELL := /bin/bash

BUN ?= bun

.PHONY: help install dev dev-worker dev-api build clean start start-worker \
	start-api test test-unit test-integration test-e2e test-coverage \
	test-watch lint lint-fix format format-check typecheck check db-seed \
	docker-build docker-up docker-down docker-logs docs docs-typedoc \
	docs-helm

help: ## Show this help message
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(MAKEFILE_LIST) | sort | \
		awk -F':|##' '{printf "  %-20s %s\n", $$1, $$NF}'

install: ## Install dependencies with Bun
	$(BUN) install

dev: ## Start the main service in watch mode
	$(BUN) run dev

dev-worker: ## Start the worker entrypoint in watch mode
	$(BUN) run dev:worker

dev-api: ## Start the API server in watch mode
	$(BUN) run dev:api

build: ## Produce a production build
	$(BUN) run build

clean: ## Remove generated build artifacts
	$(BUN) run build:clean

start: ## Run the compiled service in production mode
	$(BUN) run start

start-worker: ## Run the compiled worker in production mode
	$(BUN) run start:worker

start-api: ## Run the compiled API server in production mode
	$(BUN) run start:api

test: ## Execute the full test suite
	$(BUN) run test

test-unit: ## Run unit tests only
	$(BUN) run test:unit

test-integration: ## Run integration tests only
	$(BUN) run test:integration

test-e2e: ## Run end-to-end tests only
	$(BUN) run test:e2e

test-coverage: ## Generate test coverage reports
	$(BUN) run test:coverage

test-watch: ## Watch tests for changes
	$(BUN) run test:watch

lint: ## Lint the TypeScript source files
	$(BUN) run lint

lint-fix: ## Lint and attempt to fix issues automatically
	$(BUN) run lint:fix

format: ## Format source and test files
	$(BUN) run format

format-check: ## Verify code formatting without making changes
	$(BUN) run format:check

typecheck: ## Run TypeScript type checking
	$(BUN) run typecheck

check: lint format-check typecheck test ## Run linting, formatting check, typecheck, and tests

db-seed: ## Seed the database using the seed script
	$(BUN) run db:seed

docker-build: ## Build the production Docker image
	$(BUN) run docker:build

docker-up: ## Start the local Docker development stack
	$(BUN) run docker:dev

docker-down: ## Stop and remove the Docker development stack
	$(BUN) run docker:down

docker-logs: ## Tail logs from the Docker development stack
	$(BUN) run docker:logs

docs: docs-typedoc docs-helm ## Generate API docs and Helm chart documentation

docs-typedoc: ## Generate API documentation with TypeDoc
	$(BUN) run docs:generate

docs-helm: ## Generate Helm chart documentation with helm-docs
	@command -v helm-docs >/dev/null 2>&1 || \
	 (echo "helm-docs not installed. Install from https://github.com/norwoodj/helm-docs" >&2 && exit 1)
	helm-docs
