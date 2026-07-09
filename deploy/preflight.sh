#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# preflight.sh — Vérifications avant déploiement production (R25.5)
#
# Usage :
#   ./deploy/preflight.sh
#
# À lancer sur le serveur cible, sur la branche à déployer, AVANT
# `docker-compose up -d` ou l'équivalent Kubernetes/systemd. Vérifie :
#   1. Variables d'environnement requises
#   2. Connexion PostgreSQL
#   3. Connexion Redis
#   4. Migrations Django pending
#   5. Collectstatic prêt
#   6. Bundle frontend `dist/` présent (si SPA servie via nginx)
#
# Exit code : 0 = OK, 1 = échec bloquant. Affiche un rapport final coloré.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

# Couleurs
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; NC='\033[0m'

OK=0
KO=0

pass() { echo -e "  ${G}✓${NC} $1"; OK=$((OK+1)); }
fail() { echo -e "  ${R}✗${NC} $1"; KO=$((KO+1)); }
warn() { echo -e "  ${Y}!${NC} $1"; }
title() { echo -e "\n${Y}▶ $1${NC}"; }

# ─────────────────────────────────────────────────────────
title "1. Variables d'environnement requises"

REQUIRED_VARS=(
  DJANGO_SETTINGS_MODULE
  DJANGO_SECRET_KEY
  DJANGO_ALLOWED_HOSTS
  DJANGO_CSRF_TRUSTED_ORIGINS
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  DB_HOST
  REDIS_URL
  DEFAULT_FROM_EMAIL
)

for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    fail "$v n'est pas défini"
  else
    pass "$v défini"
  fi
done

# Alerte si DEBUG=True accidentellement
if [[ "${DJANGO_DEBUG:-False}" == "True" ]]; then
  fail "DJANGO_DEBUG=True — DOIT être False en prod"
fi

# ─────────────────────────────────────────────────────────
title "2. SECRET_KEY solide"

if [[ ${#DJANGO_SECRET_KEY} -lt 40 ]]; then
  fail "DJANGO_SECRET_KEY trop courte (${#DJANGO_SECRET_KEY} chars, min 40)"
elif [[ "$DJANGO_SECRET_KEY" == "REPLACE_ME_WITH_A_LONG_RANDOM_STRING" ]]; then
  fail "DJANGO_SECRET_KEY est encore la valeur du template .env.example"
else
  pass "SECRET_KEY longueur OK (${#DJANGO_SECRET_KEY} chars)"
fi

# ─────────────────────────────────────────────────────────
title "3. Connexion PostgreSQL"

if command -v pg_isready > /dev/null 2>&1; then
  if pg_isready -h "${DB_HOST}" -p "${DB_PORT:-5432}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t 5 > /dev/null 2>&1; then
    pass "PostgreSQL ${DB_HOST}:${DB_PORT:-5432} joignable"
  else
    fail "PostgreSQL injoignable ou credentials KO"
  fi
else
  warn "pg_isready absent — vérification DB skipée (installez postgresql-client)"
fi

# ─────────────────────────────────────────────────────────
title "4. Connexion Redis"

if command -v redis-cli > /dev/null 2>&1; then
  REDIS_HOST=$(echo "${REDIS_URL}" | sed -E 's|redis://([^:/]+).*|\1|')
  REDIS_PORT=$(echo "${REDIS_URL}" | sed -E 's|redis://[^:]+:([0-9]+).*|\1|')
  REDIS_PORT="${REDIS_PORT:-6379}"
  if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q PONG; then
    pass "Redis ${REDIS_HOST}:${REDIS_PORT} répond PONG"
  else
    fail "Redis injoignable à ${REDIS_HOST}:${REDIS_PORT}"
  fi
else
  warn "redis-cli absent — vérification Redis skipée"
fi

# ─────────────────────────────────────────────────────────
title "5. Migrations Django"

if command -v python > /dev/null 2>&1; then
  # `--check` renvoie 1 si des migrations sont pending. On tolère
  # (informatif), la CI fera la migration réelle avec `migrate`.
  if python manage.py migrate --check > /dev/null 2>&1; then
    pass "Aucune migration pending"
  else
    warn "Migrations pending détectées — elles seront appliquées au deploy"
  fi

  # `check --deploy` détecte les misconfigurations sécurité
  if python manage.py check --deploy --fail-level ERROR > /dev/null 2>&1; then
    pass "Django check --deploy : aucune erreur bloquante"
  else
    fail "Django check --deploy remonte des erreurs (relancer avec -v 2 pour détail)"
  fi
else
  warn "python absent — checks Django skipés"
fi

# ─────────────────────────────────────────────────────────
title "6. Bundle frontend"

if [[ -d "frontend/dist" ]]; then
  SIZE=$(du -sh frontend/dist 2>/dev/null | awk '{print $1}')
  pass "frontend/dist présent (${SIZE})"

  if [[ -f "frontend/dist/index.html" ]]; then
    pass "index.html présent dans dist/"
  else
    fail "frontend/dist/index.html manquant — relancer npm run build"
  fi
else
  warn "frontend/dist absent — pas bloquant si SPA servie ailleurs (CDN)"
fi

# ─────────────────────────────────────────────────────────
title "7. Fichiers sensibles absents"

if [[ -f ".env" ]] && git check-ignore .env > /dev/null 2>&1; then
  pass ".env ignoré par git"
elif [[ -f ".env" ]]; then
  fail ".env présent mais NON ignoré par git — SECRETS À RISQUE"
else
  warn ".env absent (utilisez docker-compose --env-file ou variables OS)"
fi

# ─────────────────────────────────────────────────────────
echo -e "\n${Y}▶ Résumé${NC}"
echo -e "  ${G}${OK} check(s) OK${NC}"
if [[ ${KO} -gt 0 ]]; then
  echo -e "  ${R}${KO} check(s) en échec — CORRIGER AVANT DEPLOY${NC}"
  exit 1
fi
echo -e "\n${G}✓ Preflight réussi — prêt pour déploiement${NC}\n"
