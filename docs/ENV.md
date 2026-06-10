# Environment Variables

Complete reference for every variable in `.env.example`. Copy that file to `.env` and fill
in real values before running anything.

---

## Obtaining Values

### Local Supabase (development)

```bash
supabase start
# Outputs all four Supabase values:
#   API URL:         http://localhost:54321
#   anon key:        eyJ...
#   service_role:    eyJ...
#   JWT secret:      super-secret-jwt-token-with-at-least-32-characters-long
```

Copy those directly into `.env`. They are stable across restarts of the same local project.

### Cloud Supabase (staging/production)

Go to **Project Settings → API** in the Supabase dashboard:
- API URL → `SUPABASE_URL`
- `anon` `public` key → `SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

Go to **Project Settings → API → JWT Settings**:
- JWT Secret → `SUPABASE_JWT_SECRET`

---

## Variable Reference

### Supabase

```
SUPABASE_URL
```
The base URL for the Supabase project.
- Local: `http://localhost:54321`
- Cloud: `https://<project-ref>.supabase.co`

```
SUPABASE_ANON_KEY
```
The public anon key. Safe to embed in client-side code. RLS still applies.
Used by the NestJS API's `getAuthClient(jwt)` (anon key + user JWT in header).

```
SUPABASE_SERVICE_ROLE_KEY
```
The service role key. Bypasses all RLS policies. **Server-only.** Never set this in
any `NEXT_PUBLIC_*` variable or include it in the web build.

```
SUPABASE_JWT_SECRET
```
The secret used by Supabase to sign auth tokens. NestJS's `JwtStrategy` uses this to
verify incoming tokens without making a network call to Supabase on every request.

---

### AI Provider

```
AI_BASE_URL
```
Base URL for the OpenAI-compatible chat completions API. Default: `https://api.openai.com/v1`.

Provider examples:
```
https://api.openai.com/v1          OpenAI
https://api.groq.com/openai/v1     Groq
https://api.together.xyz/v1        Together AI
https://openrouter.ai/api/v1       OpenRouter (access 100+ models)
http://localhost:11434/v1          Ollama (local)
```

```
AI_API_KEY
```
API key for the chosen provider. For Ollama use the string `ollama`.

```
AI_MODEL
```
Model identifier string for chat completions. Default: `gpt-4o-mini`.

Examples: `gpt-4o`, `llama3-70b-8192` (Groq), `mistralai/Mixtral-8x7B-Instruct-v0.1`
(Together), `anthropic/claude-3-haiku` (OpenRouter), `llama3` (Ollama).

```
EMBEDDING_MODEL
```
Model identifier for the embeddings endpoint. Default: `text-embedding-ada-002`.

**Critical constraint**: this model must produce `1536`-dimensional vectors to match the
`vector(1536)` column in `document_chunks`. If you use a different-dimension model, you
must also change the column definition and the `match_document_chunks` function signature
via a new migration. Do not re-index existing documents with a different model without
deleting the old chunks first.

| Model | Dimensions | Notes |
|---|---|---|
| `text-embedding-ada-002` | 1536 | OpenAI; matches schema default |
| `text-embedding-3-small` | 1536 | OpenAI; better quality, same dimensions |
| `text-embedding-3-large` | 3072 | Requires schema change |
| `nomic-embed-text` | 768 | Ollama; requires schema change |
| `mxbai-embed-large` | 1024 | Ollama; requires schema change |

---

### Application

```
API_PORT
```
Port for the NestJS API server. Default: `3001`.
The Next.js dev server always uses `3000`.

```
NEXT_PUBLIC_API_URL
```
The URL the browser uses to reach the NestJS API. Default when not set: `http://localhost:3001`.
In production behind a reverse proxy, set this to the public API URL.
This is baked into the Next.js standalone build — set it at build time via `docker-compose.yml`
`build.args` or your CI pipeline.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
Same values as `SUPABASE_URL` and `SUPABASE_ANON_KEY` but prefixed with `NEXT_PUBLIC_` so
Next.js bundles them into the client. Required for Supabase SSR auth on the browser side.

---

## Changing AI Providers

Swap without code changes by editing `.env` and restarting the API:

```bash
# Groq (fast, free tier available)
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=llama3-70b-8192
EMBEDDING_MODEL=text-embedding-ada-002   # Groq does not support embeddings; use OpenAI

# Ollama (fully local)
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=llama3
EMBEDDING_MODEL=nomic-embed-text         # ⚠ requires schema migration (768 dims)

# OpenRouter (access Anthropic, Google, Meta via OpenAI SDK)
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-...
AI_MODEL=anthropic/claude-3-haiku
EMBEDDING_MODEL=text-embedding-ada-002   # route to OpenAI for embeddings
```

**Groq + embeddings**: Groq does not expose an embeddings endpoint. Mix providers by keeping
`EMBEDDING_MODEL=text-embedding-ada-002` and a separate OpenAI key. You would need to split
`AiService` into two client instances — one for chat (Groq), one for embeddings (OpenAI).

---

## Security Checklist

- [ ] `.env` is in `.gitignore` — never commit secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is not in any `NEXT_PUBLIC_*` variable
- [ ] Production `SUPABASE_JWT_SECRET` is rotated from the local dev value
- [ ] `AI_API_KEY` has usage limits set in the provider dashboard
- [ ] Docker build args do not include `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET`
