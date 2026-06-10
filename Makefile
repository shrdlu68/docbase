.PHONY: setup dev test build clean use-ollama use-openai

# Local Supabase postgres for direct SQL execution
DB_EXEC=PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -q

# Install dependencies and initialize the local database
setup:
	npm install
	cp -n .env.example .env || true
	npx supabase start || true
	npx supabase db reset || true

# Start all services in development mode
dev:
	npx turbo run dev

# Run all tests (unit + integration + E2E)
test:
	npx supabase db reset || true
	npx turbo run test
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
# Switches the AI backend between Ollama (local) and OpenAI (cloud).
# Both targets:
#   1. Patch the AI_* variables in .env
#   2. Apply the matching pgvector dimension migration (wipes chunk embeddings)
#
# After switching, restart the API and re-index your documents:
#   - make dev          (restarts API in dev mode)
#   - In the UI: open each document and save to trigger re-indexing
#
# Ollama setup (Docker):
#   docker compose --profile ollama up -d ollama
#   docker compose --profile ollama up ollama-pull   # pulls models (~5 min first time)
#   # Then run: make use-ollama
#   # For Docker Compose use AI_BASE_URL=http://ollama:11434/v1 in .env instead

use-ollama:
	@echo "→ Saving current API key to .openai_key.bak ..."
	@grep '^AI_API_KEY=' .env | cut -d= -f2- > .openai_key.bak
	@echo "→ Patching .env for Ollama (llama3.2 / nomic-embed-text / 768-dim) ..."
	@sed -i "s|^AI_BASE_URL=.*|AI_BASE_URL=http://localhost:11434/v1|" .env
	@sed -i "s|^AI_API_KEY=.*|AI_API_KEY=ollama|" .env
	@sed -i "s|^AI_MODEL=.*|AI_MODEL=llama3.2|" .env
	@sed -i "s|^EMBEDDING_MODEL=.*|EMBEDDING_MODEL=nomic-embed-text|" .env
	@echo "→ Applying 768-dim embedding schema migration ..."
	@$(DB_EXEC) -f supabase/scripts/use_ollama.sql
	@echo ""
	@echo "✓ Switched to Ollama."
	@echo "  Next: kill the API process, run 'make dev', then re-index your documents."
	@echo ""

use-openai:
	@echo "→ Patching .env for OpenAI (gpt-4o-mini / text-embedding-ada-002 / 1536-dim) ..."
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
	@echo "→ Applying 1536-dim embedding schema migration ..."
	@$(DB_EXEC) -f supabase/scripts/use_openai.sql
	@echo ""
	@echo "✓ Switched to OpenAI."
	@echo "  Next: kill the API process, run 'make dev', then re-index your documents."
	@echo ""
