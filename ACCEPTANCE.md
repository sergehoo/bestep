# ACCEPTANCE.md — Checklist de validation post-application

Ce document est la **checklist de validation** à exécuter après avoir lancé
`./apply.sh apply` et `python manage.py migrate`. Chaque item est binaire
(✅/❌) avec la commande exacte à lancer.

> **Quand cocher tout :** vous êtes prêt pour un déploiement de pré-production.

---

## 1. Application des `.new`

- [ ] `./apply.sh check` retourne 0 (tous les `.new` ont été appliqués)
  ```bash
  ./apply.sh check 2>&1 | tail -2
  # Doit afficher : === Total : 0 fichiers .new ===
  ```

- [ ] Git tree clean
  ```bash
  git status
  ```

---

## 2. Migrations

- [ ] Toutes les migrations passent sans erreur
  ```bash
  python manage.py migrate
  # Doit afficher : Applying ... OK pour chaque migration.
  ```

- [ ] Pas de migration pending non détectée
  ```bash
  python manage.py makemigrations --check --dry-run
  # Doit afficher : No changes detected
  ```

- [ ] Extension pg_trgm active (V4.D)
  ```sql
  SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
  -- Doit retourner 1 ligne.
  ```

---

## 3. Tests pytest

- [ ] Tous les tests passent
  ```bash
  pytest tests/ -v --reuse-db
  # Doit afficher : 60+ passed, 0 failed
  ```

- [ ] Coverage > 25 %
  ```bash
  pytest tests/ --cov=. --cov-report=term-missing | tail -5
  # Coverage globale doit être > 25%.
  ```

---

## 4. Django checks

- [ ] `manage.py check` 0 issue
  ```bash
  python manage.py check
  ```

- [ ] `manage.py check --deploy` 0 issue (avec vraies env vars prod)
  ```bash
  DJANGO_SETTINGS_MODULE=best_epargne.settings.prod \
  DJANGO_SECRET_KEY="vrai-secret" \
  POSTGRES_PASSWORD="vrai-pwd" \
    python manage.py check --deploy
  ```

---

## 5. Variables d'environnement critiques

- [ ] `DJANGO_SETTINGS_MODULE=best_epargne.settings.prod`
- [ ] `DJANGO_SECRET_KEY` posée (≥ 50 chars, pas la valeur dev)
- [ ] `DJANGO_ALLOWED_HOSTS` posée et non `*`
- [ ] `POSTGRES_PASSWORD` posée (rotated après git filter-repo)
- [ ] `MINIO_ROOT_PASSWORD` posée (rotated)
- [ ] `MINIO_QUERYSTRING_AUTH=1` (signed URLs activées)
- [ ] `SITE_URL=https://<domaine_prod>` (pour QR certificats + invitations)
- [ ] `STRIPE_WEBHOOK_SECRET` posée (si Stripe utilisé)
- [ ] `PAYDUNYA_MASTER_KEY` posée (si Paydunya)
- [ ] `CINETPAY_WEBHOOK_SECRET` posée (si CinetPay)
- [ ] `EMAIL_HOST` + `EMAIL_HOST_USER` + `EMAIL_HOST_PASSWORD` (envoi emails invitations / certificats)
- [ ] `FLOWER_BASIC_AUTH=user:pwd` (si docker-compose.monitoring activé)

---

## 6. Smoke tests HTTP

Démarrer la stack : `docker compose up -d` (ou `python manage.py runserver` en dev).

- [ ] **Healthz** : `curl http://localhost:8000/healthz/`
  ```json
  {"status":"ok","checks":{"database":"ok","cache":"ok"}}
  ```

- [ ] **API schema** : `curl http://localhost:8000/api/schema/ | head -5`
  - Doit retourner un fichier OpenAPI 3.0 JSON.

- [ ] **Swagger UI** : ouvrir `http://localhost:8000/api/docs/` dans un
  navigateur. Doit afficher la doc interactive avec 11 tags
  (auth / catalog / instructor / learner / orgs / commerce /
   certifications / reviews / media / admin / health).

- [ ] **Certificat 404 anti-énumération** :
  ```bash
  curl -i http://localhost:8000/certifications/api/verify/00000000-0000-0000-0000-000000000000/
  # 404, JSON {"verified": false, "detail": "not_found"}
  ```

- [ ] **Headers sécurité présents (prod uniquement)** :
  ```bash
  curl -I https://<domaine>/
  # Doit avoir : Strict-Transport-Security, X-Content-Type-Options,
  #             Referrer-Policy, X-Frame-Options: DENY.
  ```

- [ ] **CSP actif** :
  ```bash
  curl -I https://<domaine>/ | grep -i content-security-policy
  # Doit retourner une header CSP non-vide.
  ```

- [ ] **X-Request-ID retourné** (V_OBS.B) :
  ```bash
  curl -I http://localhost:8000/healthz/
  # Doit avoir : X-Request-ID: <uuid4>
  ```

---

## 7. Sécurité métier

- [ ] **EnrollmentViewSet read-only** (ENROLL-03) :
  ```bash
  # POST en authentifié doit retourner 405 ou 403.
  TOKEN=$(curl -s -X POST http://localhost:8000/account/login/ ...)
  curl -X POST -H "Authorization: Token $TOKEN" \
       http://localhost:8000/api/apis/enrollments/ -d '{"course": 1}'
  # Doit retourner 405 Method Not Allowed.
  ```

- [ ] **Reviews exige enrollment** (REV-01) :
  ```bash
  # Tenter de noter un cours sans être inscrit doit retourner 400.
  ```

- [ ] **Webhook idempotent** (COM-02) :
  ```bash
  # Appeler 2× le même webhook → 2e retourne "already_processed".
  ```

- [ ] **Signature webhook obligatoire en prod** :
  ```bash
  # Webhook sans signature valide → 401.
  curl -X POST http://localhost:8000/commerce/webhooks/stripe/ \
       -H 'Content-Type: application/json' -d '{}'
  # Doit retourner 401 (en prod, sans DJANGO_DEBUG=1).
  ```

- [ ] **2FA URLs accessibles** (SEC-06) :
  ```bash
  curl -I http://localhost:8000/account/two-factor/login/
  # Doit retourner 200 ou redirection vers login allauth.
  ```

---

## 8. Services Docker (si V_OPS.A/B activés)

- [ ] **postgres-backup en cours d'exécution**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.backup.yml ps postgres-backup
  # Doit montrer "running (healthy)".
  ```

- [ ] **Backups Postgres présents après 1 h**
  ```bash
  docker compose exec postgres-backup ls /backups/last/
  # Doit montrer un fichier .sql.gz récent.
  ```

- [ ] **Flower accessible (avec auth)**
  ```bash
  curl -I https://flower.ayo-group.com/flower/
  # 401 sans auth, 200 avec FLOWER_BASIC_AUTH user:pass.
  ```

- [ ] **Celery exporter expose metrics**
  ```bash
  docker compose exec bestweb curl http://celery-exporter:9808/metrics
  # Doit retourner des métriques Prometheus (celery_tasks_total, etc.).
  ```

---

## 9. Logs

- [ ] **Format JSON en prod** :
  ```bash
  docker logs bestweb --tail 10
  # Chaque ligne doit être un objet JSON valide avec : ts, level, logger,
  # message, request_id.
  ```

- [ ] **request_id corrélé entre HTTP et Celery** :
  ```bash
  # Faire une requête qui lance une task Celery (ex. upload média),
  # puis grep dans logs bestweb + logs celery worker :
  docker logs bestweb 2>&1 | jq -r '.request_id' | tail -5
  docker logs best_epargne_celery 2>&1 | jq -r '.request_id' | tail -5
  # Au moins un request_id doit apparaître dans les deux.
  ```

---

## 10. CI / Pre-commit

- [ ] **pre-commit installé**
  ```bash
  pre-commit install
  pre-commit run --all-files
  # Doit terminer sans erreur (ruff, black, isort, eof-fixer, ...).
  ```

- [ ] **CI GitHub Actions verte**
  - Pousser une branche → workflow `ci.yml` doit tourner.
  - Jobs `lint`, `tests`, `security`, `docker` doivent passer (ou warning
    pour `docker` Trivy au début).

---

## 11. Documentation utilisateur

- [ ] **README.md à jour** (intégration `apply.sh`, démarrage rapide)
- [ ] **API documentation accessible** (`/api/docs/`)
- [ ] **MANIFEST_REMEDIATION.md** présent et listé les 52 .new appliqués
- [ ] **ROADMAP.md** présent et listé les 12 PRs à venir

---

## ✅ Critères de réussite

**Pré-production OK** quand :
- 0 item ❌ dans sections 1-7
- 0 test pytest en échec
- 0 issue `check --deploy`

**Production OK** quand :
- Tous les items ci-dessus + sections 8-11
- Webhooks PSP testés en sandbox (Stripe Stripe CLI / Paydunya sandbox / CinetPay sandbox)
- Au moins 1 cycle complet de backup Postgres validé
- Au moins 1 cycle complet de mirror MinIO validé
- Une cellule d'astreinte est désignée

---

## En cas d'échec

1. **Rollback applicatif** : `./apply.sh undo` ou `git restore .`
2. **Rollback migrations** : ne pas faire en prod (faire un point-in-time
   recovery Postgres si critique). En staging : `python manage.py migrate
   <app> <previous_migration_id>`.
3. **Logs JSON** : grep par `request_id` pour reconstruire la chrono.
4. **Healthz 503** : check DB + Redis via docker exec.

— Audit & remediation team, mai 2026.
