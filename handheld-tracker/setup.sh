#!/usr/bin/env bash
# One-shot local setup. Run from the project root: bash setup.sh
set -euo pipefail

echo "==> Checking Node"
node -v >/dev/null || { echo "Node 18+ required: https://nodejs.org"; exit 1; }

echo "==> Installing root tooling (concurrently)"
npm install

echo "==> Backend deps + .env"
( cd backend && npm install && { [ -f .env ] || cp .env.example .env; } )

echo "==> Frontend deps + .env"
( cd frontend && npm install && { [ -f .env ] || cp .env.example .env; } )

echo "==> Seeding 30 days of price history (mock unless FIRECRAWL_API_KEY is set)"
( cd backend && node seedMock.js 30 )

cat <<'DONE'

Setup complete.

Next:
  1. (optional) put your Firecrawl key in backend/.env  -> FIRECRAWL_API_KEY=fc-...
                without a key it runs in MOCK mode (fake but realistic prices).
  2. npm run dev
        API  -> http://localhost:8787
        Web  -> http://localhost:5173
DONE
