# Makefile for Pycasa

.PHONY: help dev build check killall

ROOT_DIR := $(shell pwd)
MVN      := mvn

help: ## Show available commands
	@echo "Pycasa"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

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
dev: check killall ## Hot-reload dev mode
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
build: check ## Build production uber-jar with UI embedded
	@echo "Building production package..."
	@cd $(ROOT_DIR) && $(MVN) clean package
	@JAR_FILE=$$(cd $(ROOT_DIR) && $(MVN) help:evaluate -Dexpression=project.build.finalName -q -DforceStdout); \
	echo ""; \
	echo "Run with:"; \
	echo "  java -jar target/$$JAR_FILE-runner.jar"; \
	echo ""

# ==============================
# Environment check
# ==============================

check: ## Verify required tools are installed
	@command -v $(MVN) >/dev/null 2>&1 || \
		{ echo "Error: Maven (mvn) is not installed."; exit 1; }
	@command -v node >/dev/null 2>&1 || \
		{ echo "Error: Node.js is not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || \
		{ echo "Error: npm is not installed."; exit 1; }
