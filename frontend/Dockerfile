# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# Best-Épargne — Multi-stage Dockerfile frontend (R26)
#
# Stage 1 : build Vite production
# Stage 2 : nginx alpine qui sert dist/ + reverse-proxy Django
#
# Build :
#   docker build \
#     --build-arg VITE_API_URL=https://ayo-group.com \
#     -t bestepargne-front:latest -f frontend/Dockerfile ./frontend
# ─────────────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════
# Stage 1 : builder
# ══════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# Optim : on copie d'abord package.json pour maximiser le cache Docker.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Puis le reste du code.
COPY . .

# Variables d'environnement injectées au build.
# Vite inline ces valeurs dans le bundle (elles seront publiques).
ARG VITE_API_URL
ARG VITE_API_BASE=/api
ARG VITE_APP_NAME=Best-Épargne
ARG VITE_ENV=production
ARG VITE_SENTRY_DSN=
ARG VITE_OAUTH_GOOGLE_CLIENT_ID=
ARG VITE_OAUTH_LINKEDIN_CLIENT_ID=
ARG VITE_OAUTH_MICROSOFT_CLIENT_ID=
ARG VITE_BUILD_SOURCEMAP=hidden

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_API_BASE=${VITE_API_BASE} \
    VITE_APP_NAME=${VITE_APP_NAME} \
    VITE_ENV=${VITE_ENV} \
    VITE_SENTRY_DSN=${VITE_SENTRY_DSN} \
    VITE_OAUTH_GOOGLE_CLIENT_ID=${VITE_OAUTH_GOOGLE_CLIENT_ID} \
    VITE_OAUTH_LINKEDIN_CLIENT_ID=${VITE_OAUTH_LINKEDIN_CLIENT_ID} \
    VITE_OAUTH_MICROSOFT_CLIENT_ID=${VITE_OAUTH_MICROSOFT_CLIENT_ID} \
    VITE_BUILD_SOURCEMAP=${VITE_BUILD_SOURCEMAP}

# Typecheck strict avant build pour bloquer les régressions.
RUN ./node_modules/.bin/tsc --noEmit

# Build production. Output → /app/dist.
RUN npm run build

# ══════════════════════════════════════════════════════════════
# Stage 2 : nginx runtime
# ══════════════════════════════════════════════════════════════
FROM nginx:1.27-alpine AS runtime

# Support des logs vers stdout/stderr par défaut (héritage du base image).
RUN rm -f /etc/nginx/conf.d/default.conf

# Config nginx custom (SPA + reverse proxy Django).
COPY nginx.conf /etc/nginx/conf.d/best_epargne.conf

# Bundle statique.
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck : renvoie la page d'accueil sur / (nginx directement).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q http://127.0.0.1/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
