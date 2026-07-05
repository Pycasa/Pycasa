.PHONY: help dev build docker-image docker-run docker-push killall pre-dev check-formatting apply-formatting build-docs clean-docs docs-serve

ROOT_DIR    := $(shell pwd)
DOCKER_IMAGE ?= pycasa
DOCKER_TAG  ?= latest

help: ## Show available commands
	@echo "Pycasa"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

pre-dev: # check and setup dev env
	@command -v python3 >/dev/null 2>&1 || \
		{ echo "Error: Python 3 is not installed."; exit 1; }
	@command -v node >/dev/null 2>&1 || \
		{ echo "Error: Node.js is not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || \
		{ echo "Error: npm is not installed."; exit 1; }

	@echo "Setting up dev environment..."

	@if [ ! -d ".venv" ]; then \
		echo "Creating virtual environment..."; \
		python3 -m venv .venv; \
	fi

	@echo "Installing python dependencies..."
	@.venv/bin/pip install --upgrade pip
	@.venv/bin/pip install -r server/requirements.txt

	@command -v pre-commit >/dev/null 2>&1 || \
		{ echo "Error: pre-commit is not installed. Please install it first using 'pip install pre-commit' or 'brew install pre-commit'"; exit 1; }

	@pre-commit install
	@pre-commit autoupdate
	@pre-commit install --install-hooks

check-formatting:
	@echo "\033[0;34mChecking JS/JSX/CSS/HTML formatting (webapp)...\033[0m"
	@cd $(ROOT_DIR)/src/main/webapp && npm run format:check

	@echo "\033[0;34mChecking JS/JSX/CSS/HTML formatting (docs)...\033[0m"
	@cd $(ROOT_DIR)/docs && npm run format:check

apply-formatting:
	@echo "\033[0;32mFormatting JS/JSX/CSS/HTML files (webapp)...\033[0m"
	@cd $(ROOT_DIR)/src/main/webapp && npm run format

	@echo "\033[0;32mFormatting JS/JSX/CSS/HTML files (docs)...\033[0m"
	@cd $(ROOT_DIR)/docs && npm run format

killall:
	@lsof -ti :3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti :4173 | xargs kill -9 2>/dev/null || true

# ==============================
# Development (hot reload)
# ==============================
dev: pre-dev killall ## Hot-reload dev mode (FastAPI + Vite)
	@echo ""
	@echo "Starting Pycasa in dev mode..."
	@echo ""

	@cd $(ROOT_DIR)/src/main/webapp && [ -d node_modules ] || npm install

	@cd $(ROOT_DIR) && \
		PYCASA_ENV=development \
		exec src/main/webapp/node_modules/.bin/concurrently \
			--handle-input \
			--kill-others \
			--kill-others-on-fail \
			"cd src/main/webapp && npm run dev" \
			".venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 3000 --reload --reload-dir server"

# ==============================
# Build (production)
# ==============================
build: pre-dev ## Build production webapp assets
	@echo "Building production package..."

	@cd $(ROOT_DIR)/src/main/webapp && [ -d node_modules ] || npm install
	@cd $(ROOT_DIR)/src/main/webapp && npm run build

	@echo ""
	@echo "Production assets built in src/main/webapp/dist."
	@echo "To run the production server:"
	@echo "  .venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 3000"
	@echo ""

build-docs:
	@echo "Building docs artifacts..."
	@cd docs && [ -d node_modules ] || npm install
	@cd docs && npm run build

# ==============================
# Docker
# ==============================
docker-image: ## Build Docker image (DOCKER_IMAGE=pycasa DOCKER_TAG=latest)
	@echo "Building Docker image $(DOCKER_IMAGE):$(DOCKER_TAG)..."
	@docker build \
		-t $(DOCKER_IMAGE):$(DOCKER_TAG) \
		-t $(DOCKER_IMAGE):$$(date +%Y%m%d) \
		-f $(ROOT_DIR)/Dockerfile \
		$(ROOT_DIR)
	@echo ""
	@echo "Image built: $(DOCKER_IMAGE):$(DOCKER_TAG)"
	@echo "To run: make docker-run"
	@echo ""

docker-run: ## Run the Docker image locally (mounts ./data for persistence)
	@echo "Running $(DOCKER_IMAGE):$(DOCKER_TAG) on http://localhost:3000 ..."
	@docker run --rm -it \
		-p 3000:3000 \
		-v $(ROOT_DIR)/data:/app/data \
		--name pycasa \
		$(DOCKER_IMAGE):$(DOCKER_TAG)

docker-push: ## Push Docker image to registry (set DOCKER_IMAGE=registry/repo)
	@echo "Pushing $(DOCKER_IMAGE):$(DOCKER_TAG)..."
	@docker push $(DOCKER_IMAGE):$(DOCKER_TAG)
	@docker push $(DOCKER_IMAGE):$$(date +%Y%m%d)

clean-docs:
	@echo "Cleaning docs artifacts..."
	@rm -rf docs/dist

docs-serve: clean-docs
	@echo "Starting docs development server..."
	@cd docs && [ -d node_modules ] || npm install
	@cd docs && npm run dev