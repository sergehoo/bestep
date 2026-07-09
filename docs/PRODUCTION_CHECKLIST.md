# Best-Épargne — Production Go-Live Checklist

Checklist coche par coche à parcourir **avant** la première mise en prod et
à chaque déploiement majeur. Complémentaire à `deploy/GO_LIVE_RUNBOOK.md`
(procédure d'exécution) et à `docs/DEPLOY.md` (runbook pas à pas).

Convention : `[ ]` = à faire · `[x]` = fait · `[/]` = partiellement fait.

## 1. Secrets & variables d'environnement

- [ ] `DJANGO_SECRET_KEY` régénérée (≥ 64 caractères, cryptographique).
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(64))"
  ```
- [ ] `POSTGRES_PASSWORD` fort (≥ 20 caractères, non réutilisé ailleurs).
- [ ] `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` en rotation depuis les valeurs par défaut.
- [ ] `EMAIL_HOST_PASSWORD` (SendGrid / SES / Mailgun) valide et testé.
- [ ] Toutes les entrées de `.env.example` présentes dans le `.env` prod (utiliser `deploy/preflight.sh`).
- [ ] `.env` **jamais** committé (vérifier `.gitignore`).
- [ ] Secrets stockés dans un vault (Vault, AWS Secrets Manager, GitHub Actions Secrets, etc.) — pas seulement sur le VM.

## 2. DNS + SSL

- [ ] Enregistrements DNS A/AAAA pointant vers le LB / VM.
- [ ] Certificat SSL valide (Let's Encrypt, Cloudflare, etc.).
- [ ] Redirection HTTPS testée : `curl -I http://ayo-group.com` → `301`.
- [ ] `HSTS` en place (déjà configuré dans `settings/prod.py`).
- [ ] Test SSL Labs : score ≥ A (https://www.ssllabs.com/ssltest/).

## 3. Base de données

- [ ] Instance PostgreSQL 15+ créée avec SSL activé.
- [ ] Utilisateur DB dédié, permissions restreintes (pas superuser).
- [ ] `pg_hba.conf` autorise seulement l'IP de l'app.
- [ ] Backup automatisé configuré (pg_dump quotidien + rétention 30 j).
- [ ] Test de restauration effectué (au moins 1 fois).
- [ ] `python manage.py migrate --check` OK sans migration pending.
- [ ] Superuser créé : `python manage.py createsuperuser`.

## 4. Cache + Broker (Redis)

- [ ] Redis 7+ déployé, isolé du web (bind seulement sur network privé).
- [ ] `requirepass` activé et sync avec `REDIS_URL`.
- [ ] Persistence AOF ou snapshots RDB configurée.
- [ ] Monitoring memory usage.

## 5. Stockage médias (MinIO / S3)

- [ ] Bucket créé (`be-media-prod` par défaut).
- [ ] Bucket policy privée (accès via signed URLs uniquement).
- [ ] CORS bucket configuré pour le domaine front prod.
- [ ] Rétention / lifecycle rules définies.
- [ ] Backup / réplication vers région secondaire (optionnel mais recommandé).

## 6. Emails transactionnels

- [ ] Domaine d'envoi vérifié (SPF, DKIM, DMARC).
- [ ] Test d'envoi réussi vers un compte Gmail + un compte Outlook.
- [ ] `DEFAULT_FROM_EMAIL` cohérent avec le domaine vérifié.
- [ ] Templates emails testés en HTML + plain text.
- [ ] Bounce / complaint webhook configuré (si SES/SendGrid).

## 7. Backend Django

- [ ] `DJANGO_SETTINGS_MODULE=best_epargne.settings.prod` (défaut dans `manage.py`).
- [ ] `DEBUG = False` (vérifié en config, pas d'override env accidentel).
- [ ] `ALLOWED_HOSTS` sans wildcard `*`, uniquement les domaines réels.
- [ ] `CORS_ALLOWED_ORIGINS` restreint aux domaines front prod.
- [ ] `python manage.py check --deploy` : 0 warning critique.
- [ ] `python manage.py collectstatic --noinput` exécuté.
- [ ] Gunicorn / uvicorn démarré avec ≥ 2 workers et timeout raisonnable.
- [ ] Healthcheck endpoint `/api/healthz/` répond 200 (ou équivalent).

## 8. Frontend SPA

- [ ] `frontend/.env.production` configuré avec `VITE_API_URL` prod.
- [ ] `npm run build` OK, dossier `dist/` généré.
- [ ] Bundle size < 1 Mo par chunk (chunkSizeWarningLimit).
- [ ] `dist/` servi via CDN ou nginx avec cache long (Cache-Control immutable).
- [ ] Test PWA : `manifest.webmanifest` + service worker registered.
- [ ] Test offline shell : couper le réseau après premier chargement → page cachée s'affiche.

## 9. Sécurité HTTP

- [ ] Headers vérifiés via https://securityheaders.com/ (cible : score A).
- [ ] `X-Frame-Options: DENY` (déjà dans prod.py).
- [ ] `Content-Type-Options: nosniff` (idem).
- [ ] `Strict-Transport-Security` avec preload (idem).
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` (idem).
- [ ] `Content-Security-Policy` définie (à ajouter au reverse proxy / middleware si absente).
- [ ] Rate limiting sur endpoints d'auth (nginx ou `django-ratelimit`, roadmap R26).

## 10. Observabilité

- [ ] Sentry DSN configuré (`SENTRY_DSN`) — backend + frontend.
- [ ] `SENTRY_RELEASE` set au SHA du commit (via CI).
- [ ] Logs Django format JSON → agrégés (Loki / ELK / Datadog).
- [ ] Métriques Prometheus exposées (roadmap R26 si absentes).
- [ ] Alertes configurées :
  - [ ] Taux d'erreur 5xx > 1% sur 5 min
  - [ ] Latence P95 > 2s
  - [ ] Redis / Postgres disponibilité < 99%
  - [ ] Certificat SSL expire < 15 j

## 11. CI / CD

- [ ] `.github/workflows/ci.yml` passe sur `main` (backend tests + lint).
- [ ] `.github/workflows/frontend.yml` passe (typecheck + build + Playwright smoke).
- [ ] Déploiement automatisé (GitHub Actions → SSH ou registry push).
- [ ] Tag Git créé pour la release (`v1.0.0`).
- [ ] Changelog mis à jour (`docs/RELEASE_NOTES.md`).

## 12. Contenu initial

- [ ] Presets certificats seedés (`0005_seed_certificate_presets` — automatique via migrate).
- [ ] Catégories de cours créées (via admin ou fixture).
- [ ] Au moins 3 cours publiés pour la landing.
- [ ] Comptes de démonstration créés si besoin (learner + instructor).
- [ ] Pages statiques rédigées : `/about`, `/contact`, `/terms`, `/privacy`, `/legal`, `/cookies`.

## 13. Conformité RGPD / légal

- [ ] Politique de confidentialité publiée (`/privacy`).
- [ ] CGU publiées (`/terms`).
- [ ] Mentions légales publiées (`/legal`).
- [ ] Bannière cookies (à ajouter si tracking analytics activé).
- [ ] Registre de traitements documenté (interne).
- [ ] `send_default_pii=False` sur Sentry (déjà en place).

## 14. Plan de rollback

- [ ] Tag Git de la version précédente identifié.
- [ ] Backup DB pris **juste avant** le deploy (`pg_dump` timestamp).
- [ ] Procédure documentée : voir `docs/DEPLOY.md#rollback`.
- [ ] `deploy/smoke_prod.sh` exécuté après chaque déploiement.

## 15. Post-deploy

- [ ] `deploy/preflight.sh` OK sur la nouvelle version.
- [ ] `deploy/smoke_prod.sh` OK.
- [ ] Test manuel : login + register + browse catalog + enroll + player.
- [ ] Test manuel PWA install sur mobile Android + iOS.
- [ ] Vérification des logs Sentry / erreurs dans les 15 min post-deploy.
- [ ] Communication équipe (Slack / email) : version X déployée.
- [ ] Monitoring surveillé activement pendant 2h.

---

## Ressources

- Procédure d'exécution détaillée : [`docs/DEPLOY.md`](DEPLOY.md)
- Runbook go-live : [`deploy/GO_LIVE_RUNBOOK.md`](../deploy/GO_LIVE_RUNBOOK.md)
- Script de pré-vérification : [`deploy/preflight.sh`](../deploy/preflight.sh)
- Script smoke prod : [`deploy/smoke_prod.sh`](../deploy/smoke_prod.sh)
- Doc release notes : [`docs/RELEASE_NOTES.md`](RELEASE_NOTES.md)
