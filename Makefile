.PHONY: setup dev test build clean

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
