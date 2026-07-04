# Single-image build: compile the frontend, then run the backend which serves
# both the API and the built UI on one port.

# 1) Build the frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 2) Runtime: backend (+ built frontend)
FROM node:22-alpine
# better-sqlite3 compiles a native addon on musl/alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0
EXPOSE 8787
# SQLite DB + seed live in /app/backend/data — mount a volume there to persist
# (docker-compose does this via `volumes:`; Railway via an attached Volume).
# No VOLUME instruction: Railway's builder rejects it.
CMD ["node", "server.js"]
