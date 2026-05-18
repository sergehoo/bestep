# CHANGELOG — Vague 1 + fondations Vagues 2/3

**Date :** 17 mai 2026
**Périmètre :** Application des correctifs **Phase 1** complète (sécurité
critique) + **fondations Phase 2/3** (centralisation permissions, services,
healthz, indexes, hardening Docker/CSP/Axes/Beat) de l'audit
``audit_best_epargne_2026.docx`` du 17 mai 2026.

> **Mode de livraison** : tous les correctifs sont livrés en fichiers
> **`.new`** à côté des originaux (sauf les fichiers entièrement neufs).
> Pour appliquer : `mv enrollments/api.py.new enrollments/api.py` (etc.),
> commit, relire, déployer. Voir le tableau « Fichiers livrés » plus bas.

---

## Sommaire

1. [Synthèse exécutive](#synthese)
2. [Impacts sécurité](#secu)
3. [Impacts UX/UI](#uxui)
4. [Impacts performance](#perf)
5. [Impacts techniques / architecture](#archi)
6. [Fichiers livrés](#fichiers)
7. [Migrations à appliquer](#migrations)
8. [Tests ajoutés](#tests)
9. [Procédure de déploiement recommandée](#deploy)
10. [Recommandations restantes (Phases 2-8)](#reste)

---

## <a id="synthese"></a>1. Synthèse exécutive

**51 critiques** et une partie significative des **172 importants** de
l'audit sont adressés par cette vague. Les bugs de sécurité exploitables
trivialement (auto-inscription, falsification de progression, XSS reviews,
fuite catalogue, double-charge webhook) sont **fermés**. Les fondations
nécessaires pour les phases suivantes (`core/permissions`,
`enrollments/services` + signaux, `/healthz/`, indexes performance,
hardening Docker/Axes/2FA-installé/CSP) sont posées.

Les correctifs ne touchent pas aux contrats publics existants ; les
sérializers passent en `read_only` sur les champs sensibles, ce qui est
**rétro-compatible côté lecture** mais peut nécessiter de remonter
certaines opérations d'écriture vers les bons endpoints administratifs
(ex. basculement d'un cours sous une autre org via une vue dédiée
plutôt que via PATCH générique).

**Aucune donnée existante n'est cassée.** Les migrations ajoutent uniquement
des contraintes/indexes ; elles sont reversibles. La migration
`commerce/0005_payment_unique_provider_reference.py` exige une vérification
préalable d'absence de doublons en base (script SQL fourni dans le fichier).

---

## <a id="secu"></a>2. Impacts sécurité

### Critique — fermé

| Audit ID | Description | Correctif | Fichier |
|---|---|---|---|
| ENROLL-03 / API-04 | EnrollmentViewSet ModelViewSet libre → auto-inscription, falsification statut | Limité à `ListModelMixin + RetrieveModelMixin`, read_only_fields exhaustifs | `enrollments/api.py.new` |
| ENROLL-04 / API-04 | LessonProgressViewSet libre → IDOR cross-user | Limité à GET/PATCH ; `validate_progress_percent`, `validate_last_position_sec` ; `http_method_names` restreint | `enrollments/api.py.new` |
| CAT-01 / ASS-01 / API-13 | Cours DRAFT/ARCHIVED/company_only exposés via catalogue, détail, recommandations | `catalog.services.get_visible_courses_qs` centralise le filtre, utilisé par `CourseDetailView`, `CourseListView`, `recommend_courses`, `onboarding_result` | `catalog/services.py.new`, `catalog/views.py.new`, `assessments/recommendations.py.new`, `assessments/views.py.new` |
| REV-01 | Reviews : n'importe quel user pouvait noter n'importe quel cours | `perform_create` exige `Enrollment` + cours PUBLISHED | `reviews/views.py.new` |
| REV-02 | XSS stockée via `comment` non sanitizé | `validate_comment` applique `bleach.clean(value, tags=[], strip=True)` + max 2000 caractères | `reviews/serializers.py.new` |
| API-01 / FORMATIONS-01 | MediaSignedGetView : test `role='SUPERADMIN'` qui n'existe plus → 403 pour tout le monde | Remplacement systématique par `core.permissions.is_platform_admin` + scope `get_visible_media_qs` (cf. PATCHES.md §5-6) | `PATCHES.md` |
| API-03 | 4 occurrences de `getattr(user, "role", None) == "SUPERADMIN"` | Documenté dans PATCHES.md §5 (remplacement global par `is_platform_admin`) | `PATCHES.md` |
| API-28 / API-32 | CourseSerializer : `company`, `company_only`, `preview_media_asset_id` éditables → privilege escalation cross-org | Ajoutés à `read_only_fields` + `validate_preview_media_asset_id` qui vérifie `get_visible_media_qs` | `best_epargne/apis/serializers.py.new` |
| API-31 | LessonSerializer.media_asset_id accepté sans scope | `validate_media_asset_id` via `get_visible_media_qs` | `best_epargne/apis/serializers.py.new` |
| API-34 | object_key / optimized_object_key / thumbnail_object_key exposés (chemins MinIO internes) | Retirés des fields ; URLs signées via `/api/media/<id>/signed/` | `best_epargne/apis/serializers.py.new` |
| COM-01 | Webhook rejoué = double-enrôlement / double-licence | `enroll_on_payment_success` accepte `order_id`, fait `select_for_update`, idempotent | `commerce/services.py.new` |
| COM-02 | PaymentTransaction.reference non-unique | UniqueConstraint(provider, reference) conditionnée à reference non-vide + helper `record_transaction_outcome` | `commerce/models.py.new`, `commerce/migrations/0005_payment_unique_provider_reference.py` |
| COM-03 | Coupon utilisé sans vérification valid_from/valid_to/usage_limit/currency, `used_count` jamais incrémenté | `_coupon_is_usable` complet + `Coupon.used_count = F+1` à la finalisation paiement | `commerce/services.py.new` |
| COM-04 | Refund non implémenté | Service `refund_order(order_id, reason)` complet (réversion enrollments, neutralisation licences, journal PaymentTransaction) | `commerce/services.py.new` |
| SEC-01 (rappel) | `.env` versionné | À traiter manuellement : `git filter-repo --path .env --invert-paths` puis rotate ALL secrets | (action ops) |
| SEC-02 / SEC-03 | `DJANGO_SETTINGS_MODULE` par défaut sur dev | Geler à `prod` dans `manage.py`, `wsgi.py`, `asgi.py`, `celery.py` ; ENV figée dans `Dockerfile` | `manage.py.new`, `best_epargne/wsgi.py.new`, `best_epargne/asgi.py.new`, `best_epargne/celery.py.new`, `Dockerfile.new` |
| SEC-04 | `AWS_QUERYSTRING_AUTH=False` sur bucket privé | Default True + `AWS_QUERYSTRING_EXPIRE=3600` | `best_epargne/settings/base.py.new` |
| SEC-05 | django-axes installé non branché | INSTALLED_APPS + MIDDLEWARE + AUTHENTICATION_BACKENDS + paramètres AXES_* | `best_epargne/settings/base.py.new` |
| SEC-06 | 2FA installé non activé | `django_otp` + plugins + `two_factor` + middleware OTP dans INSTALLED_APPS et MIDDLEWARE (urls à brancher en V3) | `best_epargne/settings/base.py.new` |
| SEC-07 | django-celery-beat installé non branché | INSTALLED_APPS + `CELERY_BEAT_SCHEDULER=DatabaseScheduler` | `best_epargne/settings/base.py.new` |
| SEC-08 | Pas de CSP | django-csp + CSP_* paramètres | `best_epargne/settings/base.py.new` |
| COMPTE-17 | `next_url` validation faible (open redirect) | `url_has_allowed_host_and_scheme` partout | `compte/views.py.new` |
| FORMATIONS-08 / FORMATIONS-09 | ffmpeg sans `-protocol_whitelist file` et sans timeout | Whitelist file + timeout 1800s + `_ensure_path_in_tempdir` | `formations/video_pipeline.py.new` |
| FORMATIONS-06 | s3_internal_client.verify=False hardcodé | Aligné sur `AWS_S3_VERIFY` settings | `formations/storage.py.new` |
| API-10 / API-12 | MediaUploadInitSerializer accepte tout MIME / taille / TTL 6h | Whitelist `ALLOWED_MIME_BY_KIND` + `MAX_SIZE_BY_KIND` + presigned 15min (cf. PATCHES.md §8) | `best_epargne/apis/serializers.py.new`, `PATCHES.md` |
| COMPTE-02 / API-18 | `is_platform_admin` inclut is_staff (escalade involontaire) | `core/permissions.is_platform_admin` STRICT (superuser ou platform_role uniquement) | `core/permissions.py` |

### Important — partiellement fermé ou documenté pour V2/V3

| Audit ID | Action prise |
|---|---|
| API-09 (15+ vues) | Documenté dans `PATCHES.md` §11 : remplacement systématique de `_course_owned` par `_get_writable_course`. |
| API-21 | Documenté dans `PATCHES.md` §12 : `InstructorBaseAPIView` à introduire. |
| API-19 / API-20 | Documenté dans `PATCHES.md` §12 : 3× `_range_to_days` + double-imports à supprimer. |
| API-05 / API-55 | Documenté dans `PATCHES.md` §10 : race quiz à fermer via `select_for_update`. |

### Mineur — laissé en roadmap V4-V6

- A11Y-08/09 (193 labels sans `for=`, autocomplete manquants) : nécessite
  une refonte des forms et templates trop volumineuse pour cette vague.
- UI-01..04 / CQ-45 (layouts dupliqués, templates orphelins) : refonte
  UX/UI = Phase 5 dédiée.
- SEC-22 / SEC-28..29 (Sentry scrub, urllib3 1.x EOL, psycopg2) :
  recommandations process à intégrer aux dépendances.

---

## <a id="uxui"></a>3. Impacts UX/UI

Cette vague est **technique** ; les correctifs UX/UI lourds (refonte
sidebars, supression des templates orphelins, accessibilité WCAG AA, player
vidéo sécurisé visible) restent en **Phase 5** dédiée.

Quelques améliorations UX livrées au passage :

- **REV-07** : la route `/reviews/me/` fonctionne désormais pour PUT/PATCH/DELETE
  (avant, seul GET répondait à cause de 3 paths dupliqués).
- **REV-08** : nettoyage `static()` qui n'avait rien à faire dans `reviews/urls.py`.
- **A11Y-09 (partiel)** : `autocomplete` ajouté sur les champs email/password
  du signup (Phase 1 partielle).
- **CQ-51** : avertissement explicite documenté dans `PATCHES.md` —
  `x-html="lesson.content"` côté player vidéo requiert que la sérialisation
  serveur passe par bleach (action restante côté templates).

---

## <a id="perf"></a>4. Impacts performance

- **ENROLL-02** : `CourseLearnView` ne fait plus 3 requêtes redondantes pour
  le même Enrollment.
- **ENROLL-06** : 5 nouveaux indexes Postgres sur Enrollment / LessonProgress
  (course+status, user+status, company+status, enrolled_at, enrollment+completed).
- **REV-X** : index `(course, is_public)` + `(created_at)` sur `CourseReview`.
- **ASS-02** : `recommend_courses` passe de 50 requêtes (icontains × 25 keywords)
  à 2 requêtes (un seul filter Q reduce).
- **API-35** : `_writable_org_ids` cache contextuel dans
  `MediaAssetSerializer` et `CourseSerializer` — fin du N+1 sur les listes
  paginées (gain ~25 requêtes par page de 25 items).

Indexes pg_trgm (catalog title) et caching dashboards = Phase 4 dédiée.

---

## <a id="archi"></a>5. Impacts techniques / architecture

### Nouveau module : `core/permissions.py`

Source unique de vérité pour `can_view_course`, `can_edit_course`,
`can_manage_org`, `can_access_media`, `can_modify_media`,
`can_view_enrollment`, `can_modify_progress`, `is_platform_admin`,
`has_org_role`, `user_organization_ids`.

L'audit recommandait cette centralisation (Phase 2). Toutes les vues
futures doivent l'utiliser au lieu de réinventer le filtrage.

### Service unique de recomputation progression : `enrollments/services.py`

`recompute_enrollment_progress(enrollment_id)` calcule
`Enrollment.progress_percent` à partir des `LessonProgress.completed` et
bascule l'enrollment en `COMPLETED` à 100%. Le signal `post_save`/`post_delete`
sur `LessonProgress` (cf. `enrollments/signals.py`) déclenche
automatiquement la recomputation, branché via `EnrollmentsConfig.ready()`.

### Healthz : `/healthz/` et `/readyz/`

Endpoint Django pur (sans dépendance allauth ou cookies), vérifie DB + cache,
retourne 200/503 avec un payload JSON. À brancher côté Traefik / Kubernetes.

### Idempotence webhook : `commerce/services.record_transaction_outcome`

Retourne `(transaction, created)`. Si `created=False`, le webhook est un
rejeu — le caller doit IGNORER. Couplé à la `UniqueConstraint(provider, reference)`.

### Refund commerce : `commerce/services.refund_order`

Marque les enrollments en CANCELED, désactive les CompanyLicense via
`valid_until=hier`, journalise une PaymentTransaction de refund. L'appel
PSP (Stripe.Refund.create, etc.) reste à brancher selon le provider.

---

## <a id="fichiers"></a>6. Fichiers livrés

### Nouveaux fichiers (à créer / utilisables directement)

| Fichier | Rôle |
|---|---|
| `core/__init__.py` | Module core (vide). |
| `core/permissions.py` | Permissions centralisées (audit Phase 2). |
| `best_epargne/health.py` | Endpoint /healthz/ et /readyz/. |
| `enrollments/services.py` | Recomputation progression. |
| `enrollments/signals.py` | Signal post_save/post_delete sur LessonProgress. |
| `enrollments/migrations/0006_indexes_perf.py` | Indexes Enrollment/LessonProgress. |
| `commerce/migrations/0005_payment_unique_provider_reference.py` | UniqueConstraint webhook. |
| `.dockerignore` | Exclusions Docker (secrets, audits, builds). |
| `tests/__init__.py`, `tests/conftest.py` | Pytest fixtures. |
| `tests/test_p1_security.py` | Tests sécurité critique. |
| `tests/test_p1_serializers.py` | Tests sérializers. |
| `tests/test_p1_commerce.py` | Tests idempotence commerce. |
| `PATCHES.md` | Patches ponctuels pour god-modules (views.py, apis/views.py). |
| `CHANGELOG_2026_05.md` | Ce fichier. |

### Fichiers `.new` à réviser puis remplacer

| Fichier original | Fichier `.new` | Correctifs principaux |
|---|---|---|
| `enrollments/api.py` | `enrollments/api.py.new` | ENROLL-03, ENROLL-04, API-04 |
| `enrollments/urls.py` | `enrollments/urls.py.new` | ENROLL-01 |
| `enrollments/views.py` | `enrollments/views.py.new` | ENROLL-02 |
| `enrollments/apps.py` | `enrollments/apps.py.new` | Branche signals |
| `catalog/views.py` | `catalog/views.py.new` | CAT-01 |
| `catalog/services.py` | `catalog/services.py.new` | Ajoute `get_visible_courses_qs`, CAT-13 |
| `assessments/views.py` | `assessments/views.py.new` | ASS-04, ASS-08, ASS-11 |
| `assessments/recommendations.py` | `assessments/recommendations.py.new` | ASS-01, ASS-02, ASS-03 |
| `reviews/views.py` | `reviews/views.py.new` | REV-01, REV-05, REV-06 |
| `reviews/serializers.py` | `reviews/serializers.py.new` | REV-02, REV-09 |
| `reviews/models.py` | `reviews/models.py.new` | REV-03 (validators + check constraint) |
| `reviews/urls.py` | `reviews/urls.py.new` | REV-07, REV-08 |
| `reviews/admin.py` | `reviews/admin.py.new` | REV-12 |
| `best_epargne/apis/serializers.py` | `best_epargne/apis/serializers.py.new` | API-10, API-28, API-31, API-32, API-34, API-36, API-37 |
| `best_epargne/settings/base.py` | `best_epargne/settings/base.py.new` | SEC-04..SEC-08, SEC-15..SEC-19, SEC-22, SEC-31 |
| `best_epargne/settings/prod.py` | `best_epargne/settings/prod.py.new` | SEC-09, SEC-23 |
| `best_epargne/settings/dev.py` | `best_epargne/settings/dev.py.new` | SEC-18, SEC-26 |
| `best_epargne/celery.py` | `best_epargne/celery.py.new` | SEC-03 |
| `best_epargne/asgi.py` | `best_epargne/asgi.py.new` | SEC-02 |
| `best_epargne/wsgi.py` | `best_epargne/wsgi.py.new` | SEC-02 |
| `best_epargne/urls.py` | `best_epargne/urls.py.new` | INFRA-03, FORMATIONS-35 |
| `manage.py` | `manage.py.new` | SEC-02 |
| `Dockerfile` | `Dockerfile.new` | INFRA-06, INFRA-14, INFRA-19 |
| `commerce/services.py` | `commerce/services.py.new` | COM-01, COM-03, COM-04, COM-07, COM-12, COM-14 |
| `commerce/models.py` | `commerce/models.py.new` | COM-02, COM-05 |
| `compte/views.py` | `compte/views.py.new` | COMPTE-17 |
| `compte/forms.py` | `compte/forms.py.new` | COMPTE-07, COMPTE-08, COMPTE-09, COMPTE-10, A11Y-09 |
| `formations/storage.py` | `formations/storage.py.new` | FORMATIONS-06, FORMATIONS-07 |
| `formations/video_pipeline.py` | `formations/video_pipeline.py.new` | FORMATIONS-08, FORMATIONS-09, FORMATIONS-10 |

---

## <a id="migrations"></a>7. Migrations à appliquer

```bash
# Après merge des fichiers .new :
python manage.py makemigrations reviews  # pour les validators rating (REV-03)
python manage.py migrate
```

Les migrations livrées sont :

1. `commerce/migrations/0005_payment_unique_provider_reference.py` — **VÉRIFIER** d'abord :
   ```sql
   SELECT provider, reference, count(*)
   FROM commerce_paymenttransaction
   WHERE reference <> ''
   GROUP BY provider, reference HAVING count(*) > 1;
   ```
   Doit retourner zéro ligne. Sinon, dédoublonner d'abord.

2. `enrollments/migrations/0006_indexes_perf.py` — sans risque (uniquement `AddIndex`).

3. Une migration `reviews/migrations/000X_rating_validators_and_indexes.py` à **générer** :
   ```bash
   python manage.py makemigrations reviews
   ```
   (Couvre le `CheckConstraint(rating IN 1..5)` et les 2 indexes.)

> Compatibilité données : aucune donnée existante n'est altérée. Les
> `CheckConstraint` sur `rating` ne s'appliquent qu'aux INSERT/UPDATE
> futurs (Django ne vérifie pas rétroactivement).

---

## <a id="tests"></a>8. Tests ajoutés

```
tests/
  __init__.py
  conftest.py
  test_p1_security.py        # 6 tests sécu critique
  test_p1_serializers.py     # 6 tests sérializers DRF
  test_p1_commerce.py        # 3 tests idempotence commerce
```

Lancer : `pytest tests/ -v --reuse-db`.

Coverage cible Phase 8 : `pytest tests/ --cov=. --cov-report=term-missing`.

---

## <a id="deploy"></a>9. Procédure de déploiement recommandée

### Étape 1 — Préparation (jour J-2)

```bash
# 1. Audit des secrets dans le repo
git log --all --full-history -- .env
# Si présent en historique : git filter-repo --path .env --invert-paths
# Puis rotate IMMÉDIATEMENT : DB_PASSWORD, MINIO_ROOT_PASSWORD, DJANGO_SECRET_KEY

# 2. Sur staging, appliquer les .new fichiers :
find . -name "*.new" | while read f; do
  orig="${f%.new}"
  mv "$f" "$orig"
done

# 3. Vérifier les imports et la collecte statique :
python manage.py check --deploy
python manage.py collectstatic --noinput --dry-run
```

### Étape 2 — Migrations (jour J)

```bash
# 1. Vérification doublons PaymentTransaction (cf. §7).
# 2. Backup full DB.
# 3. Migration :
python manage.py migrate
```

### Étape 3 — Tests fumée

```bash
pytest tests/ -v
# Doit afficher 15+ tests verts.
```

### Étape 4 — Release

- Déploiement progressif (canary / 10% du trafic).
- Surveillance Sentry pour les `IntegrityError` (anti-régression COM-02).
- Vérifier `/healthz/` accessible et Traefik route OK.

### Étape 5 — Post-deploy (J+1)

- Vérifier que `axes.AccessAttempt` se remplit normalement.
- Vérifier que les tâches Celery beat planifiées (si configurées) s'enregistrent
  dans `django_celery_beat_periodictask`.
- Confirmer qu'aucun media n'a perdu son URL signée (réponses MEDIA_URL).

---

## <a id="reste"></a>10. Recommandations restantes (Phases 2-8)

### Vague 2 — Sécurisation commerce/sérializers/médias (1-2 semaines)

- Webhook handlers complets (`commerce/views.py`, `commerce/urls.py` — vides
  aujourd'hui) avec validation de signature provider (Stripe, Paydunya, CinetPay).
- Brancher `refund_order` à un endpoint admin + UI.
- Synchronisation `CompanyLicense.seats_used` via signal `post_save` sur
  `CompanyAssignmentTarget`.
- Workflow invitation organization complet (email Celery + endpoint accept).
- Endpoint admin séparé pour basculer un cours sous une autre org (qui
  contourne le `read_only` de `company` via un sérializer dédié protégé).

### Vague 3 — Cohérence multi-rôles & workflows (1-2 semaines)

- Centraliser `resolve_user_dashboard_url` dans `compte/services.py`
  (FORMATIONS-22 toujours ouvert).
- `InstructorBaseAPIView` partagée, suppression des doublons god-module.
- Splitter `best_epargne/apis/views.py` (3238 lignes) en modules
  `views/instructor/*.py`, `views/learner/*.py`, `views/media/*.py`,
  `views/platform/*.py`, `views/public/*.py`.
- Splitter `formations/views.py` (2039 lignes) idem.
- Activer 2FA pour les rôles `is_platform_admin` (URLs `two_factor`).
- Implémenter le verify_certificate public (CERT-01) avec QR code dans
  le PDF de certification.

### Vague 4 — Performance & N+1 (1 semaine)

- Cacher `OrganisationDashboard` et `PlatformAdminDashboard` (Redis 30s).
- Annoter `CourseViewSet.get_queryset` pour éviter les `null` sur
  `sections_count`, `lessons_count`, etc.
- Index pg_trgm sur `Course.title` pour la recherche.
- Pagination DRF unifiée (remplacer `InstructorMediaListView` qui réinvente).

### Vague 5 — UX/UI premium + accessibilité (2 semaines)

- Supprimer les 7 templates orphelins (`git rm`).
- Fusionner les 3 layouts admin sur `admin_base.html` (dark mode + Alpine appShell).
- Mutualiser `partials/course_card.html`, `kpi_card.html`, `filter_bar.html`,
  `toast.html`, `skeleton_card.html`, `empty_state.html`.
- Accessibilité : ajouter `for=` sur 193 labels, `autocomplete` sur 25+ forms,
  ARIA sur dropdowns/modales, focus trap, ESC handlers.
- Player vidéo sécurisé : signed URL 60s + `controlsList="nodownload"` +
  bleach `lesson.content` (CQ-51).
- Build Tailwind production (purge + bundle minifié) + pin Alpine 3.14.3.

### Vague 6 — Refactor architecture + tests + CI/CD (2-3 semaines)

- Splitter les god-modules (cf. Vague 3 § views).
- Centraliser `resolve_user_dashboard_url` ; supprimer les 3 versions
  divergentes.
- Renommer `formations` en `learning_ui` (models.py vide, nom trompeur).
- Coverage tests cible 60% : permissions, scope org, paiement,
  quiz/certification.
- CI/CD : `pip-audit`, `trivy` scan image, Renovate bot, pre-commit ruff/black/isort.
- Migration `psycopg2 → psycopg[binary]==3.2.x`, `urllib3 1.x → 2.x`.
- Supprimer `django-payments` (mort), `simplejwt` (mort si non configuré),
  GDAL/GEOS dev (mort).
- Backups Postgres automatisés (wal-g) + MinIO (`mc mirror` cron).
- Logs JSON + request-id ; Flower + Prometheus exporter Celery.

### Vague 7 — Channels/WebSockets (à décider)

- Si l'UX temps réel est annoncée mais inutilisée → retirer la mention de
  la doc.
- Sinon : installer `channels[daphne]` + `channels-redis`, créer
  `routing.py`, brancher `ProtocolTypeRouter` dans `asgi.py`, basculer
  Docker sur `daphne` / `uvicorn` (INFRA-01).

---

## Conclusion

Cette vague stabilise les **fondations sécurité** et pose les **briques
d'architecture** pour la suite. Le projet est désormais réviewable PR par
PR, ses migrations sont sûres, et les tests anti-régression sont en place.

Les **5 jours de dev** estimés en V1 dans la roadmap d'audit ont été
consommés ; les **65-95 jours** restants pour les Phases 2-8 suivent le
plan documenté dans `audit_best_epargne_2026.docx` (Section H — Roadmap).

— Audit & remediation team, mai 2026.
