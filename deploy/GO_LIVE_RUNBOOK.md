# Go-Live Runbook (Production)

Ce runbook est la checklist opérationnelle minimale avant mise en production.

## 1) Pré-requis

- Accès shell au serveur/runner de déploiement
- DNS déjà propagé
- TLS/Traefik opérationnel
- Backup PostgreSQL validé (restore testé)
- Variables d'environnement de production complètes

## 2) Variables critiques à vérifier

- `DJANGO_SETTINGS_MODULE=best_epargne.settings.prod`
- `DJANGO_DEBUG=0`
- `DJANGO_SECRET_KEY` (forte, non partagée)
- `DJANGO_ALLOWED_HOSTS` (domaine(s) prod uniquement)
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_HOST`, `DB_PORT`
- `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET`, `MINIO_PUBLIC_DOMAIN`
- PSP: `STRIPE_*`, `PAYDUNYA_*`, `CINETPAY_*`
- `SITE_URL` (URL prod absolue)

## 3) Hardening infra obligatoire

- Images Docker pinées (pas de `latest`)
- Redis et PostgreSQL non exposés publiquement
- MinIO console non publique sans ACL stricte
- Rotation secrets initiale post-déploiement
- Logs centralisés activés (JSON)

## 4) Déploiement

```bash
# Depuis la racine du projet

docker compose pull

docker compose up -d --build

# Vérifier l'état des services

docker compose ps
```

## 5) Post-déploiement immédiat

```bash
# Health checks applicatifs
curl -fsS https://<APP_HOST>/healthz/
curl -fsS https://<APP_HOST>/readyz/

# Smoke test HTTP/headers/CSP
APP_URL="https://<APP_HOST>" ./deploy/smoke_prod.sh
```

## 6) Vérifications fonctionnelles critiques

- Connexion / déconnexion
- Upload média (init + finalize)
- Lecture vidéo (URL signée)
- Paiement de test (sandbox PSP)
- Webhook PSP signé
- Enrôlement post-paiement
- Génération certificat + vérification publique

## 7) Vérifications sécurité minimales

- Header CSP présent sans `unsafe-inline`/`unsafe-eval`
- `X-Frame-Options` ou `frame-ancestors 'none'`
- `Referrer-Policy` présente
- `X-Content-Type-Options: nosniff` présent
- Cookies session/CSRF en `Secure` en production

## 8) Vérifications observabilité

- Erreurs applicatives remontent (Sentry/outil équivalent)
- Worker Celery consomme correctement
- `celery beat` actif
- Aucune file Redis qui sature

## 9) Rollback

```bash
# Revenir à l'image/tag précédent (exemple)
# 1) Ajuster les tags d'images
# 2) Redeployer

docker compose up -d

# Restaurer DB si migration destructive détectée
# pg_restore ...
```

## 10) Critères Go / No-Go

Go si:
- Smoke test script passe
- Healthz/readyz OK
- Paiement + webhook validés
- Upload + vidéo validés
- Aucun pic d'erreurs 5xx

No-Go si:
- Échec CSP/headers sécurité
- Échec webhook paiement
- Échec enrôlement post-paiement
- Erreurs critiques persistantes sur workers
