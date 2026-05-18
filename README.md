# Best Épargne — Plateforme e-learning SaaS multi-rôles

Plateforme Django 4.2 / DRF avec multi-rôles (Apprenant, Formateur,
Organisation, Admin plateforme), pipeline vidéo MinIO+ffmpeg, dashboards
par rôle, organisations B2B, paiements multi-PSP, certificats vérifiables.

> Audit complet et remédiation V1+V2+V3+V4 documentés dans
> [`MANIFEST_REMEDIATION.md`](MANIFEST_REMEDIATION.md). État global : **65%
> des 350 findings audit fermés**, dont **94% des critiques**.

---

## Stack

- **Backend** : Django 4.2.27 · DRF 3.16 · Celery 5.6 · django-allauth · django-axes · django-two-factor-auth · drf-spectacular · django-csp
- **DB** : PostgreSQL 16 (psycopg 3) avec extension `pg_trgm`
- **Cache / queue** : Redis 7 (cache + sessions + broker Celery)
- **Stockage** : MinIO/S3 via django-storages (URLs signées 1h par défaut)
- **Frontend** : TailwindCSS (build prod purgé) · Alpine.js 3.14.3 · TinyMCE
- **Médias** : ffmpeg + ffprobe (transcoding sécurisé, protocol_whitelist=file)
- **Infra** : Docker + docker-compose · Traefik · Gunicorn (gthread)

## Démarrage rapide (dev)

```bash
# 1. Cloner et configurer.
git clone <repo>
cd best_epargne
cp .env.example .env        # éditer DB_*, MINIO_*, etc.

# 2. Stack docker.
docker compose up -d

# 3. Dépendances Python (dev).
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# 4. Build CSS Tailwind production.
npm install
npm run build:css   # → static/dist/app.min.css

# 5. Migrations + smoke test.
export DJANGO_SETTINGS_MODULE=best_epargne.settings.dev
python manage.py migrate
python manage.py runserver
```

Visitez :
- `http://localhost:8000/` — landing
- `http://localhost:8000/api/docs/` — Swagger UI (drf-spectacular)
- `http://localhost:8000/healthz/` — liveness probe

## Variables d'environnement

| Variable | Description |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `best_epargne.settings.prod` ou `.dev` (défaut prod) |
| `DJANGO_SECRET_KEY` | Requis ; fail-closed si absent en prod |
| `DJANGO_DEBUG` | `1` ou `0` |
| `DJANGO_ALLOWED_HOSTS` | CSV |
| `POSTGRES_*` | DB credentials (prod) |
| `REDIS_URL` | Cache + sessions |
| `CELERY_BROKER_URL` | Broker Celery |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Auth MinIO |
| `MINIO_PUBLIC_DOMAIN` | Pour URLs publiques |
| `MINIO_QUERYSTRING_AUTH` | `1` (par défaut V1) → URLs signées |
| `MINIO_PRESIGN_EXPIRE` | TTL signed URL (3600 par défaut) |
| `SITE_URL` | URL absolue (certificats, invitations) |
| `STRIPE_WEBHOOK_SECRET` / `PAYDUNYA_MASTER_KEY` / `CINETPAY_WEBHOOK_SECRET` | Signatures webhook |
| `FLOWER_BASIC_AUTH` | `user:password` pour Flower (V_OPS.B) |
| `DR_S3_*` | Backup MinIO vers S3 externe (V_OPS.A) |

Variables complètes : voir [`MANIFEST_REMEDIATION.md` §3.2](MANIFEST_REMEDIATION.md).

## Structure du projet

```
best_epargne/
├── best_epargne/          # settings, urls, asgi, health, two_factor_urls
│   ├── apis/              # APIs DRF (views.py 3238 lignes — splitter V6.C posé)
│   ├── settings/          # base.py + dev.py + prod.py
│   └── apis/views_package/  # skeleton splitter (V6.C)
├── core/                  # ⭐ transverse : permissions, cache, dashboards, a11y
│   ├── permissions.py     # source unique : can_view_course, can_manage_org, ...
│   ├── cache.py           # helpers KPI cache + invalidation
│   ├── dashboard_kpis.py  # 3 fonctions cached (org / platform / instructor)
│   ├── logging.py         # JsonFormatter + RequestIdMiddleware
│   ├── decorators.py      # @platform_admin_otp_required, @org_admin_required_for_id
│   └── templatetags/a11y.py  # {% labeled_field %} avec for=/autocomplete/ARIA
├── compte/                # User custom + multi-rôle (workspaces)
├── catalog/               # Course, Section, Lesson, MediaAsset
│   ├── querysets.py       # annotate_course_kpis (V4.B)
│   └── signals.py         # invalidation dashboards
├── enrollments/           # Inscriptions + progression
│   ├── lesson_media_views.py  # signed URL 60s (V5.D / SEC-33)
│   └── services.py        # recompute_enrollment_progress
├── commerce/              # Order, OrderItem, Coupon, PaymentTransaction
│   ├── services.py        # enroll_on_payment_success atomic + refund_order
│   ├── webhook_signatures.py  # Stripe/Paydunya/CinetPay signatures
│   └── views.py           # checkout + webhook handler idempotent
├── organizations/         # Org + memberships + invitations
│   ├── services.py        # invite_member + accept_invitation
│   └── invitation_views.py  # endpoint HTML accept
├── certifications/        # Certificate + vérification publique
│   ├── services.py        # PDF + QR + révocation
│   └── views.py           # verify_certificate (HTML + JSON)
├── reviews/               # Avis cours (XSS-safe, enrollment requis)
├── assessments/           # Quiz + Attempts (is_final + onboarding)
├── notifications/         # ⭐ V_FIN.B : service in-app + email
├── formations/            # Vues template (V6.C splitter posé)
├── tests/                 # 60+ tests pytest
├── templates/
│   ├── layout/
│   │   └── app_shell.html  # Layout unifié premium (V5.C)
│   ├── partials/
│   │   ├── course_card.html
│   │   ├── kpi_card.html
│   │   ├── filter_bar.html
│   │   ├── toast.html
│   │   ├── empty_state.html
│   │   ├── skeleton_card.html
│   │   ├── logout_button.html
│   │   └── lesson_player.html  # Player sécurisé signed URL
│   └── ...
├── static/
│   └── src/app.css         # Tailwind production source
├── docker-compose.yml
├── docker-compose.backup.yml   # V_OPS.A : pg-backup + minio-mirror
├── docker-compose.monitoring.yml # V_OPS.B : Flower + celery-exporter
└── apply.sh                # Script d'application des .new
```

## Sécurité

- **Auth** : email-only via allauth ; mots de passe Argon2 min 12 chars
- **Brute force** : django-axes (8 échecs / 1h cooloff)
- **2FA** : django-two-factor-auth (TOTP), URLs `/account/two-factor/*`
- **CSP** : django-csp avec whitelist domaines
- **HSTS** : 1 an, preload
- **Webhooks** : signatures vérifiées Stripe (HMAC-SHA256 + anti-rejeu 5 min),
  Paydunya (SHA-512), CinetPay (HMAC-SHA256)
- **Médias** : URLs signées 1h (catalog) ou 60s (player vidéo), `controlsList="nodownload"`
- **ffmpeg** : `-protocol_whitelist file`, timeout 30 min, path sandboxing
- **CSRF** : SameSite=Lax + HttpOnly
- **DB** : `sslmode=require` en prod

## Tests

```bash
pytest tests/ -v --reuse-db
pytest tests/ --cov=. --cov-report=term-missing
```

**60+ tests pytest** couvrant :
- Sécurité critique (V1) : APIs read-only, sérializers, catalogue filtré
- Workflows (V2) : certificats, invitations, webhooks
- Performance (V4) : cache invalidation, signatures
- Multi-rôle (V8.D) : permissions, signals, request-id
- V_FIN : Quiz constraints, notifications, decorators

## Documentation

- [`audit_best_epargne_2026.docx`](audit_best_epargne_2026.docx) — Audit complet 350 findings
- [`MANIFEST_REMEDIATION.md`](MANIFEST_REMEDIATION.md) — Point d'entrée unique
- [`PATCHES.md`](PATCHES.md) — Patches ponctuels pour les god-modules
- [`CLEANUP_TEMPLATES.md`](CLEANUP_TEMPLATES.md) — Suppression sûre des 7 templates orphelins
- `CHANGELOG_2026_05.md` (V1) · `CHANGELOG_2026_05_V2.md` (V2) ·
  `CHANGELOG_2026_05_V3.md` (V3) · `CHANGELOG_2026_05_V4.md` (V4 final)
- API : `http://localhost:8000/api/docs/` (Swagger) ou `/api/redoc/`

## Application des correctifs audit (un seul script)

```bash
./apply.sh check     # liste les 48+ fichiers .new prêts
./apply.sh dry-run   # simulation
./apply.sh apply     # applique tout en une fois
```

Puis :
```bash
python manage.py migrate
pytest tests/ -v
```

## Roadmap restante (V5 lourd, V6 lourd, V7)

- **V5 lourd** : migrer ~25 écrans vers `app_shell.html` (pattern dans
  `templates/organization/dashboard.html.new` et
  `templates/instructor/instructor_dash.html.new`)
- **V5 lourd** : 193 labels `for=` via `{% labeled_field %}` (helper posé)
- **V6 lourd** : migrer le code des god-modules `apis/views.py` (3 238 lignes)
  et `formations/views.py` (2 039 lignes) vers les `views_package/` skeletons
- **V7** : décision Channels/WebSockets

Total effort restant estimé : **~10-15 jours dev**.

## Licence / contact

Document interne — Best Épargne / ayo-group.com.
Audit & remédiation : équipe ingénierie senior, mai 2026.
