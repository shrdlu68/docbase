.PHONY: setup dev test build clean use-ollama use-openai

# Install dependencies and initialize the local database
setup:
	npm install
	cp -n .env.example .env || true
	npx supabase start || true
	npx supabase db reset || true

# Start all services in development mode
dev:
	set -a && . ./.env && set +a && npx turbo run dev

# Run all tests (unit + integration + E2E)
test:
	npx supabase db reset || true
	set -a && . ./.env && set +a && npx turbo run test
	cd apps/api && set -a && . ../../.env && set +a && npx jest --config test/jest-e2e.json --forceExit
	cd apps/web && npx playwright test

# Build all apps
build:
	npx turbo run build
	docker compose build

# Stop local Supabase
stop:
	npx supabase stop || true

# Clean build artifacts
clean:
	npx turbo run clean --continue || true
	find . -name ".next" -type d -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
	find . -name "dist" -type d -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true

# ── Provider switching ────────────────────────────────────────────────────────
#
# The embedding column is declared as `vector` (no fixed dimension), so no DB
# migration is needed when switching providers. Only the env vars change.
#
# After switching, restart the API and re-index your documents — embeddings from
# different models are semantically incompatible and must be regenerated:
#   - make dev          (restarts API in dev mode)
#   - In the UI: open each document and save to trigger re-indexing
#
# Ollama setup (Docker):
#   docker compose --profile ollama up -d ollama
#   docker compose --profile ollama run --rm ollama-pull   # pulls models (~5 min, first time only)
#   # Then run: make use-ollama
#   # When using Docker Compose set AI_BASE_URL=http://ollama:11434/v1 in .env

use-ollama:
	@echo "→ Saving current API key to .openai_key.bak ..."
	@grep '^AI_API_KEY=' .env | cut -d= -f2- > .openai_key.bak
	@echo "→ Patching .env for Ollama (llama3.2 / nomic-embed-text) ..."
	@sed -i "s|^AI_BASE_URL=.*|AI_BASE_URL=http://localhost:11434/v1|" .env
	@sed -i "s|^AI_API_KEY=.*|AI_API_KEY=ollama|" .env
	@sed -i "s|^AI_MODEL=.*|AI_MODEL=llama3.2|" .env
	@sed -i "s|^EMBEDDING_MODEL=.*|EMBEDDING_MODEL=nomic-embed-text|" .env
	@echo ""
	@echo "✓ Switched to Ollama. No DB migration needed (dimensionless vector column)."
	@echo "  Next: kill the API process, run 'make dev', then re-index your documents."
	@echo ""

use-openai:
	@echo "→ Patching .env for OpenAI (gpt-4o-mini / text-embedding-ada-002) ..."
	@sed -i "s|^AI_BASE_URL=.*|AI_BASE_URL=https://api.openai.com/v1|" .env
	@if [ -f .openai_key.bak ]; then \
	  SAVED=$$(cat .openai_key.bak); \
	  sed -i "s|^AI_API_KEY=.*|AI_API_KEY=$$SAVED|" .env; \
	  echo "→ Restored OpenAI API key from .openai_key.bak"; \
	else \
	  echo "→ NOTE: update AI_API_KEY in .env with your OpenAI key"; \
	fi
	@sed -i "s|^AI_MODEL=.*|AI_MODEL=gpt-4o-mini|" .env
	@sed -i "s|^EMBEDDING_MODEL=.*|EMBEDDING_MODEL=text-embedding-ada-002|" .env
	@echo ""
	@echo "✓ Switched to OpenAI. No DB migration needed (dimensionless vector column)."
	@echo "  Next: kill the API process, run 'make dev', then re-index your documents."
	@echo ""
