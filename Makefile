# Makefile for Pycasa

.PHONY: help dev build killall pre-dev

ROOT_DIR := $(shell pwd)
MVN      := mvn

help: ## Show available commands
	@echo "Pycasa"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

pre-dev: # check and setup dev env
	@command -v $(MVN) >/dev/null 2>&1 || \
		{ echo "Error: Maven (mvn) is not installed."; exit 1; }
	@command -v node >/dev/null 2>&1 || \
		{ echo "Error: Node.js is not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || \
		{ echo "Error: npm is not installed."; exit 1; }
	@echo "Setting up dev environment..."
	@command -v pre-commit >/dev/null 2>&1 || { echo "Error: pre-commit is not installed. Please install it first. using 'pip install pre-commit' or 'brew install pre-commit'"; exit 1; }
	@pre-commit install
	@pre-commit autoupdate
	@pre-commit install --install-hooks

check-formatting:
	@echo "\033[0;34mChecking Java formatting...\033[0m"
	@mvn spotless:check
	@echo "\033[0;34mChecking JS/JSX/CSS/HTML formatting (webapp)...\033[0m"
	@cd $(ROOT_DIR)/src/main/webapp && npm run format:check
	@echo "\033[0;34mChecking JS/JSX/CSS/HTML formatting (docs)...\033[0m"
	@cd $(ROOT_DIR)/docs && npm run format:check

apply-formatting:
	@echo "\033[0;32mFormatting Java files...\033[0m"
	@mvn spotless:apply
	@echo "\033[0;32mFormatting JS/JSX/CSS/HTML files (webapp)...\033[0m"
	@cd $(ROOT_DIR)/src/main/webapp && npm run format
	@echo "\033[0;32mFormatting JS/JSX/CSS/HTML files (docs)...\033[0m"
	@cd $(ROOT_DIR)/docs && npm run format

killall:
	@lsof -ti :3000 | xargs kill -9

# ==============================
# Development  (hot reload)
# ==============================
#
# Quinoa starts the Vite dev server internally and proxies it through Quarkus.
# Everything is on ONE port
#
#   UI changes  → instant HMR (Vite running behind the scenes)
#   Java changes → Quarkus hot reloads on next request
#
dev: pre-dev killall ## Hot-reload dev mode
	@echo ""
	@echo "Starting Pycasa in dev mode..."
	@echo ""
	@cd $(ROOT_DIR) && $(MVN) quarkus:dev

# ==============================
# Build  (production)
# ==============================
#
# Produces a single self-contained uber-jar with the UI bundled inside.
# Quinoa runs npm install + npm run build automatically during mvn package.
#
build: pre-dev ## Build production uber-jar with UI embedded
	@echo "Building production package..."
	@cd $(ROOT_DIR) && $(MVN) clean package
	@JAR_FILE=$$(cd $(ROOT_DIR) && $(MVN) help:evaluate -Dexpression=project.build.finalName -q -DforceStdout); \
	echo ""; \
	echo "Run with:"; \
	echo "  java -jar target/$$JAR_FILE-runner.jar"; \
	echo ""

build-docs:
	@echo "Building docs artifacts..."
	cd docs && [ -d node_modules ] || npm install
	cd docs && npm run build

clean-docs:
	@echo "Cleaning docs artifacts..."
	rm -rf docs/dist

docs-serve: clean-docs
	@echo "Starting docs development server..."
	cd docs && [ -d node_modules ] || npm install
	cd docs && npm run dev