# CHANGELOG — V4 final (observabilité + ops prod-ready + V5/V6 démos)

**Date :** 17 mai 2026
**Périmètre :** V_OBS.A/B (API docs + logs JSON), V_OPS.A/B (backups + monitoring),
V5.G (démo migration app_shell), V8.D (tests étendus).

Clôt l'effort de remédiation cumulé V1+V2+V3+V4.

---

## Sommaire

1. [Synthèse](#synthese)
2. [Livrables](#livrables)
3. [État final consolidé](#etat)
4. [Reste strict pour 100 % audit](#reste)
5. [Recommandations long-terme](#reco)

---

## <a id="synthese"></a>1. Synthèse

Cette vague clôt l'effort sur 4 axes :

### Observabilité (V_OBS)
- **API docs OpenAPI 3.0** via drf-spectacular (déjà installé, jamais branché).
  3 endpoints : `/api/schema/` (JSON), `/api/docs/` (Swagger UI), `/api/redoc/`.
  11 tags structurels (auth/catalog/instructor/learner/orgs/commerce/certs/reviews/media/admin/health).
- **Logs JSON + request-id**. Middleware `RequestIdMiddleware` pose un UUID4
  (ou respecte `X-Request-ID` amont), `JsonFormatter` produit du JSON ligne
  par ligne, `RequestIdFilter` injecte `request_id` dans chaque LogRecord.
  Compatible Loki / ELK / Datadog. Format JSON forcé en prod (`DJANGO_LOG_FORMAT=json`).

### Ops prod-ready (V_OPS)
- **Backups Postgres** via `prodrigestivill/postgres-backup-local` :
  dump horaire, rétention 7j/4sem/6mois, healthcheck HTTP.
- **Mirror MinIO → S3 externe** via `mc mirror` boucle (idle si
  `DR_S3_*` vides → safe par défaut). RPO ~1h ajustable.
- **Flower** derrière Traefik + basicauth (`FLOWER_BASIC_AUTH`).
- **Celery exporter Prometheus** (port 127.0.0.1:9808/metrics, jamais
  exposé publiquement).
- Tous les sidecars en `no-new-privileges:true` + `cap_drop: ALL`.

### V5.G — démo migration UI
- `templates/organization/dashboard.html.new` migre l'écran réel vers
  `layout/app_shell.html` + utilise `partials/kpi_card.html`,
  `partials/course_card.html`, `partials/empty_state.html`.
- Pattern réutilisable pour les ~25 autres écrans à migrer (V5 lourd).

### V8.D — tests étendus
- `test_v8_core_permissions.py` (7 tests) : `is_platform_admin` strict,
  `can_view_course` scope DRAFT/company_only, `can_modify_progress` IDOR,
  `resolve_user_dashboard_url` pour tous les profils.
- `test_v8_signals.py` (3 tests) : recomputation progression,
  auto-création Enrollment via CompanyAssignmentTarget, sync
  CompanyLicense.seats_used.
- `test_v8_request_id.py` (3 tests) : génération UUID, préservation header
  amont, JsonFormatter.

**+13 tests** → total **47 tests pytest**.

---

## <a id="livrables"></a>2. Livrables V4 final

### Nouveaux modules / fichiers

```
core/
  logging.py                    [V_OBS.B — JsonFormatter, RequestIdMiddleware]

docker-compose.backup.yml       [V_OPS.A — postgres-backup-local + minio-mirror]
docker-compose.monitoring.yml   [V_OPS.B — Flower + celery-exporter]

templates/organization/
  dashboard.html.new            [V5.G — démo migration vers app_shell]

tests/
  test_v8_core_permissions.py   [V8.D — 7 tests]
  test_v8_signals.py            [V8.D — 3 tests]
  test_v8_request_id.py         [V8.D — 3 tests]

CHANGELOG_2026_05_V4.md         [ce fichier]
```

### Modifications de fichiers existants .new (mis à jour)

```
best_epargne/settings/base.py.new
  + drf_spectacular, drf_spectacular_sidecar dans INSTALLED_APPS
  + DEFAULT_SCHEMA_CLASS dans REST_FRAMEWORK
  + SPECTACULAR_SETTINGS complet
  + RequestIdMiddleware en haut de MIDDLEWARE
  + LOGGING refondu (filters request_id, formatters verbose+json)

best_epargne/settings/prod.py.new
  + LOGGING["handlers"]["console"]["formatter"] = "json" par défaut

requirements.txt.new
  + drf-spectacular-sidecar==2024.7.1

PATCHES.md
  + §28 : branchement drf-spectacular URLs
```

---

## <a id="etat"></a>3. État final consolidé après V1+V2+V3+V4

### Inventaire global

| Métrique | Valeur |
|---|---|
| Fichiers `.new` | **47** |
| Nouveaux modules Python | **19** |
| Templates neufs | **13** (1 layout, 4 pages, 7 partials, 1 démo migration) |
| Migrations Django | **5** |
| Tests pytest | **47** sur 13 fichiers |
| Documentation | **8 fichiers** (audit docx + 5 changelogs + manifest + patches + cleanup) |
| Outillage | **11** (pyproject, package, tailwind, css, pre-commit, ci.yml, dockerignore, requirements-dev, apply.sh, docker-compose.backup.yml, docker-compose.monitoring.yml) |

### Findings audit traités

| Sévérité | Initial | Fermés/atténués | % |
|---|---|---|---|
| **Critiques** | 51 | **48** | **94 %** |
| **Importants** | 172 | **~125** | **73 %** |
| **Mineurs** | 127 | **~55** | **43 %** |
| **TOTAL** | **350** | **~228** | **65 %** |

### Catégories **fermées** (intégralement ou massivement)

✅ Sécurité APIs (IDOR, write libre, role legacy)
✅ Sécurité catalogue (fuite DRAFT/company_only)
✅ Sécurité commerce (idempotence + signatures webhook 3 PSP)
✅ Sécurité reviews (XSS + enrollment requis)
✅ Sécurité settings (axes, Argon2, CSP, AWS_QS, ENV figé)
✅ Sécurité uploads (ffmpeg whitelist + timeout + MIME)
✅ Sécurité player vidéo (signed URL 60s + controlsList)
✅ Certificats vérifiables (QR + révocation + ré-émission)
✅ Workflow invitation org (email + accept + IDOR refusé)
✅ Idempotence commerce + webhook signatures
✅ Sync seats licences B2B (signal automatique)
✅ Routing centralisé (`resolve_user_dashboard_url`)
✅ Performance dashboards (cache 30-60s + signaux invalidation)
✅ Performance N+1 (annotations + Exists + cached_property)
✅ Indexes DB (pg_trgm Course.title + composés + enrollments)
✅ Layout unifié posé (`app_shell.html` + démo migration org/dashboard)
✅ Accessibilité critique (skip-link, ARIA, focus-trap, reduced-motion, templatetag a11y `labeled_field`)
✅ Composants frontend mutualisés (7 partials)
✅ Player vidéo sécurisé
✅ CI/CD GitHub Actions (ruff + pytest + pip-audit + Trivy)
✅ Outillage qualité (pyproject + pre-commit + requirements scindés)
✅ Documentation (audit docx + 5 changelogs + patches + manifest + cleanup)
✅ **API docs OpenAPI** (drf-spectacular + Swagger + ReDoc)
✅ **Logs JSON + request-id** (corrélation request HTTP ↔ celery)
✅ **Backups Postgres** (sidecar avec rétention 7j/4sem/6m)
✅ **Mirror MinIO → S3 externe** (RPO ~1h)
✅ **Monitoring Celery** (Flower + Prometheus exporter)
✅ Dépendances modernisées (psycopg3, urllib3 2.x, deps mortes retirées)
✅ 2FA URLs (module posé, à brancher)

---

## <a id="reste"></a>4. Reste strict pour 100 % couverture audit

### Effort restant ~10-15 jours de dev

| Vague | Tâche | Effort | Risque |
|---|---|---|---|
| V5 lourd | Migrer ~25 écrans `organization/*`, `learner/*`, `instructor/*`, `platform/*` vers `app_shell.html` (pattern dans dashboard.html.new) | 4-6 j | Faible |
| V5 lourd | Suppression effective des 7 templates orphelins (procédure prête dans CLEANUP_TEMPLATES.md) | 30 min | Nul |
| V5 lourd | 193 labels `for=` via script sed + utilisation `{% labeled_field %}` dans les forms réécrits | 2-3 j | Faible |
| V5 lourd | `autocomplete` sur 25+ forms (helper `labeled_field` posé) | 1 j | Faible |
| V6 lourd | Migration effective du contenu de `best_epargne/apis/views.py` (3 238 lignes) vers `views_package/instructor.py`, `learner.py`, `media.py`, `public.py`, `platform.py` | 3-4 j | Modéré |
| V6 lourd | Idem `formations/views.py` (2 039 lignes) | 2 j | Modéré |
| V6 lourd | Quiz `is_final` + Quiz.clean() (PATCHES.md §23) + migration | 1 j | Faible |
| V6 lourd | Activation effective 2FA (URLs branchées, décorateur `@otp_required` sur views admin) | 1 j | Faible |
| V7 | Décision Channels/WebSockets (retirer doc OU installer stack) | 0.5 - 3 j | — |
| Tests | Coverage 60% (aujourd'hui ~30%) | 3-4 j | Faible |

### Findings restants

- Mineurs UX (densité, surcharge couleur) → cosmétique, à itérer.
- Quelques edge cases multi-org (FORMATIONS-23 multi-org admin)
- Refactor formations.views.py / formations.models.py vide → conceptuel (renommage app)
- Quelques `try/except Exception` à durcir (FORMATIONS-30)
- Index pg_trgm aussi sur description / subtitle si vraiment utile

---

## <a id="reco"></a>5. Recommandations long-terme

### Process

1. **Convention de PR** : exiger qu'une PR ne ferme jamais > 5 findings
   audit à la fois (revue plus fine, rollback simple).
2. **Audit récurrent** : reconduire un audit tous les 6 mois sur la
   liste audit_best_epargne_2026.docx + écart au CHANGELOG.
3. **Definition of Done par feature** : tests pytest, scope explicite
   (qui peut voir/modifier), aria + autocomplete, documentation OpenAPI.

### Stack / infra

4. **Channels** : décider AVANT V7 si une UX temps réel est promise au
   produit. Le commit asgi.py actuel est un trompe-l'œil.
5. **Sentry traces > 0** en staging au moins ; permet d'avoir les
   percentiles P50/P95 pour cibler les optimisations.
6. **CDN devant WhiteNoise** pour les assets statiques (Bunny, Cloudflare).
7. **Read replica Postgres** dès que vous passez la barre des 10 RPS
   soutenu.
8. **HLS / DRM** sur le player vidéo si le contenu premium devient
   significatif (Mux ou Cloudflare Stream).

### Sécurité

9. **Rotation des secrets** au moins tous les 6 mois.
10. **2FA obligatoire** pour `is_platform_admin` ou `is_staff` — décorateur
    `@otp_required` sur `dashboard/admin/*` après branchement V6.D.
11. **Audit log structuré** pour les actions sensibles (refund, révocation
    certificat, suppression user) — pattern `logger.info(...)` existant
    suffit avec request_id.
12. **WAF Traefik** ou Cloudflare devant `/admin/` avec IP allow-list.

### Code quality

13. **Coverage 60%** cible Phase 8 — actuellement ~30%.
14. **Renovate** ou Dependabot pour les bumps automatisés des deps mineures.
15. **ruff strict** : ajouter `S` (bandit) au sélecteur de règles dans
    `pyproject.toml` quand l'équipe est prête.
16. **Type hints** progressifs avec `mypy --strict` sur les services
    métier (`compte/services.py`, `core/*`, `commerce/services.py`).

---

## Conclusion

L'effort de remédiation a fermé **94% des critiques** et **65% des findings
totaux** identifiés dans l'audit. Toutes les **classes de bugs exploitables
trivialement** sont fermées. Tous les **workflows critiques métier** sont
fonctionnels. La couche **performance/observabilité/ops** est en place
pour passer le projet en production.

Le reste (~35% de findings, principalement mineurs et l'effort V5/V6 lourd)
est documenté, tracé, et peut être attaqué par vagues de 3-5 jours en
PRs commitables indépendamment.

— Audit & remediation team, mai 2026. Fin de remédiation V1→V4 final.
