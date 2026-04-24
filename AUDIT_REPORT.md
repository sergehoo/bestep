# Rapport d'audit — Plateforme elearning Best Épargne

Date : 23 avril 2026
Stack : Django 4.2.27, DRF 3.16, Celery 5.6, PostgreSQL 16, Redis 7, MinIO (S3), TinyMCE, django-allauth, WhiteNoise, Traefik.

## 1. Résumé exécutif

L'architecture (apps découpées par domaine métier, séparation template / API / workers, storage S3, cache Redis, routage Traefik) est saine. En revanche, la configuration Django contenait plusieurs défauts bloquants pour une mise en production (clé secrète hardcodée, DEBUG=True en prod, mots de passe DB en dur, permissions DRF "AllowAny" par défaut, CORS non configuré alors que django-cors-headers est installé). L'app `formations` concentrait aussi du code mort, des imports dupliqués et une dizaine de requêtes SQL redondantes sur le dashboard formateur.

Toutes les anomalies bloquantes et les gains de perfs "faciles" ont été corrigés dans cette passe. La base est désormais compatible `manage.py check --deploy` sans avertissement (avec une vraie clé secrète fournie par l'env).

État sommaire :

| Axe | Avant | Après |
|---|---|---|
| Sécurité (secrets / DEBUG / permissions) | Critique | Corrigé |
| Configuration Django (base / dev / prod) | Fragile | Homogène, pilotée par env |
| Performance dashboard formateur | ~18 requêtes / page | ~6 requêtes / page |
| Index DB sur colonnes filtrées | Manquants | Ajoutés + migrations |
| Code mort / imports dupliqués (formations/views.py) | Oui | Nettoyé |

## 2. Fichiers modifiés

### Configuration
- `best_epargne/settings/base.py` — refonte : helpers `env_bool`/`env_list`, `SECRET_KEY` via env, `DEBUG` via env, `ALLOWED_HOSTS` via env, CORS configurable, DRF `IsAuthenticated` par défaut + throttling + pagination, cookies de session/CSRF sécurisés, logging structuré, intégration Sentry optionnelle, MinIO TLS cohérent avec `MINIO_SECURE`.
- `best_epargne/settings/dev.py` — suppression du mot de passe DB hardcodé (`weddingLIFE18`), passage par l'env, email console, `LOGIN_URL` pointé sur la vraie route allauth.
- `best_epargne/settings/prod.py` — `DEBUG` piloté par env (au lieu de `True`!), `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` pilotés par env avec fallback, DB : refus de démarrer sans `POSTGRES_PASSWORD`, `CONN_MAX_AGE`, `sslmode`, sessions en cache Redis, email SMTP configurable, `ACCOUNT_EMAIL_VERIFICATION=mandatory` par défaut, `SECURE_REFERRER_POLICY`.
- `best_epargne/settings.py` (fichier) — marqué déprécié : lève explicitement `ImportError`. Le package `best_epargne/settings/` est l'unique source de vérité.
- `best_epargne/celery.py` — `DJANGO_SETTINGS_MODULE` par défaut sur `best_epargne.settings.dev`, ajout d'une `debug_task`.

### Permissions / middleware
- `best_epargne/apis/permissions.py` — suppression de la classe `IsInstructor` dupliquée (la 2e écrasait la 1re). Ajout de `IsAuthenticatedAndActive`, `IsInstructorOwnerOrReadOnly`, hardening de `IsSuperAdmin` et `IsCompanyAdmin`.
- `compte/middleware.py` — `OnboardingRequiredMiddleware` réécrit : mémorisation du résultat dans la session (fin de la requête SQL à chaque page), exemptions étendues (`/admin/`, `/account/`, `/api/`, `/tinymce/`), gestion de `NoReverseMatch`.
- `assessments/signals.py` (nouveau) + `assessments/apps.py` — hook `post_save` prêt à invalider un cache d'onboarding par user (placeholder documenté).

### Modèles (indexes / contraintes)
- `compte/models.py` — `User.role` indexé, ajout d'un index `(role, is_active)` et `(created_at)`, `EMAIL_FIELD` et `REQUIRED_FIELDS` déclarés proprement.
- `assessments/models.py` — `Attempt` : index `(quiz, user)` et `(user, submitted_at)` (accéléré le middleware d'onboarding). `AttemptAnswer` : contrainte d'unicité `(attempt, question)`.
- `commerce/models.py` — `Order` : indexes `(user, status)`, `(company, status)`, `(status, created_at)`, `(paid_at)` + contrainte `user OR company`. `OrderItem` : index `(order, item_type)`. `PaymentTransaction` : indexes `(order, status)` et `(provider, reference)`.
- `formations/views.py` — suppression des imports dupliqués, factorisation de `_month_bounds`, réécriture de `get_instructor_dashboard_kpis` en aggrégats uniques (de ~18 à 6 requêtes), `InstructorDashboard.get_context_data` réutilise maintenant cette fonction au lieu de dupliquer la logique.

### Migrations générées
- `assessments/migrations/0007_alter_attempt_options_and_more.py`
- `commerce/migrations/0003_alter_order_options_alter_paymenttransaction_options_and_more.py`
- `compte/migrations/0004_alter_user_role_user_compte_user_role_c04f48_idx_and_more.py`

À appliquer avec `python manage.py migrate`.

## 3. Détails des corrections

### 3.1 Sécurité — critique

Clé secrète, DEBUG, ALLOWED_HOSTS : tout provient désormais de l'environnement. En DEBUG=0, Django refuse explicitement de démarrer sans `DJANGO_SECRET_KEY` (évite un redémarrage silencieux sur une clé insecure). `DEBUG=True` en prod a été supprimé.

DRF `"AllowAny"` par défaut → `"IsAuthenticated"`. Chaque endpoint public doit désormais opter in explicitement (`permission_classes=[AllowAny]`). Throttling et pagination activés par défaut.

CORS : installé (`django-cors-headers`) mais jamais branché. Le middleware est ajouté au bon emplacement (après `SecurityMiddleware` et avant `CommonMiddleware`), avec une allow-list contrôlée par `DJANGO_CORS_ALLOWED_ORIGINS`.

MinIO : le mode TLS (`MINIO_SECURE`) pilote désormais `AWS_S3_USE_SSL` et `AWS_S3_VERIFY` de façon cohérente, au lieu d'être hardcodés à `False`.

Mots de passe DB : retirés du code source. Ils viennent exclusivement de l'env (`DB_PASSWORD` en dev, `POSTGRES_PASSWORD` en prod).

Duplication de `IsInstructor` : la seconde définition (basée sur `is_instructor` property, sans fallback sur le rôle `SUPERADMIN`) écrasait la première. Une seule classe unifiée accepte maintenant les deux approches.

### 3.2 Performance

**Dashboard formateur (`get_instructor_dashboard_kpis` + `InstructorDashboard.get_context_data`)**

Avant : ~18 requêtes SQL (5 × `count()` sur cours, 4 × `count()` sur enrollments, `count()` + `aggregate` pour reviews, 3 × `aggregate` pour payments, 2 × `aggregate` pour progression, `count()` pour notifications, puis re-duplication intégrale dans la view).

Après : 1 `aggregate` par groupe logique avec filtres conditionnels (`Count("id", filter=Q(...))`, `Sum(..., filter=Q(...))`), et la view réutilise la fonction de service au lieu de dupliquer. Bilan : **6 requêtes pour l'ensemble des KPIs**.

**Middleware d'onboarding**

Avant : un `SELECT EXISTS(...)` sur `Attempt` à chaque requête HTTP d'un learner.
Après : le flag est posé en session (`session["onboarding_completed"] = True`), l'index composé `(user, submitted_at)` accélère le calcul initial, les paths `/admin/`, `/account/`, `/api/`, `/tinymce/` sont exemptés.

**Indexes ajoutés** : on cible les colonnes effectivement filtrées/triées par les vues (role sur User, `(quiz, user)` sur Attempt, `(user, status)` et `(company, status)` sur Order, etc.).

### 3.3 Qualité / dette

Imports dupliqués (`Decimal`, `Q`, `Count`, `LoginRequiredMixin`, `LessonProgress`, `CourseReview`…) dans `formations/views.py` : supprimés. Le `slugify` de `faker.utils.text` est remplacé par celui de Django.

Fonction `_month_bounds` dupliquée à l'identique dans la fonction module-level et dans la méthode de la classe : extraite en helper module-level unique.

Fichier fantôme `best_epargne/settings.py` (ignoré par Python parce qu'un package du même nom existe) : il devient un fichier explicitement mortifié (lève `ImportError` si jamais il est importé).

### 3.4 Cohérence métier

`Order.user` et `Order.company` étaient tous deux `null=True`. Une commande sans ni user ni company n'a pas de sens : ajout d'un `CheckConstraint` DB (`order_user_or_company_required`).

`AttemptAnswer` pouvait contenir deux réponses pour la même question dans une même tentative : ajout d'une `UniqueConstraint` `(attempt, question)`.

## 4. Vérifications exécutées

- `python manage.py check --settings=best_epargne.settings.dev` → **0 issue**
- `python manage.py check --settings=best_epargne.settings.prod --deploy` (avec une vraie `SECRET_KEY`) → **0 issue**
- Import smoke-test de `formations.views`, `best_epargne.apis.permissions`, `compte.middleware`, `assessments.signals` → OK
- Migrations générées : 3 fichiers, propres, pas de conflit

## 5. Points laissés ouverts (recommandations)

Ces éléments ont été identifiés pendant l'audit et méritent une itération dédiée :

**1. `catalog.Payment.course_id`** est un `PositiveIntegerField` au lieu d'une `ForeignKey` vers `Course`. Conséquence : risque d'orphelins et impossibilité pour Django de garantir l'intégrité. À migrer vers un `ForeignKey(Course, on_delete=PROTECT)` avec backfill, à planifier sur une fenêtre de maintenance car la table peut être volumineuse.

**2. `best_epargne/apis/views.py`** (2 615 lignes) et `formations/views.py` (~1 400 lignes) sont des monolithes. Scinder par domaine (instructor / learner / public / admin), extraire un layer `services/` par app (on a commencé avec `get_instructor_dashboard_kpis`).

**3. `best_epargne/apis/views.py`** contient des `try/except` autour d'imports optionnels (`Enrollment`, `LessonProgress`, `Payout`, `Review`, `Notification`) avec un `except Exception`. Ces modules existent tous dans le projet ; ces gardes-fous doivent être supprimés ou durcis en `except ImportError`.

**4. Tests quasi inexistants** : `tests.py` ne contient que le template vide dans la plupart des apps. Prioriser des tests fonctionnels sur : parcours d'inscription, achat de cours, complétion de leçon, onboarding quiz, contrôles de permissions par rôle. `pytest-django` et `factory_boy` sont déjà dans `requirements.txt`.

**5. `.env` commité historiquement** : les secrets qu'il contient (`DB_PASSWORD=weddingLIFE18`, `S3_SECRET_KEY=minio123`) sont à considérer comme compromis. **À faire** : (a) créer un `.env.example` sans les valeurs sensibles, (b) **changer ces credentials** partout où ils sont utilisés, (c) purger l'historique git (`git filter-repo`) si `.env` a déjà été poussé.

**6. `django-axes`, `django-otp`, `django-two-factor-auth`** sont installés mais ne sont **pas** dans `INSTALLED_APPS`. Soit activer le 2FA (recommandé pour les admins et formateurs), soit retirer ces dépendances pour alléger la surface.

**7. `django-payments`, `django-guardian`, `django-role-permissions`** : présents dans `requirements.txt` mais aucun usage détecté dans le code. Auditer puis supprimer ou activer.

**8. Rate-limiting login allauth** : `ACCOUNT_RATE_LIMITS` est défini dans `base.py`, vérifier que la clé de cache Redis est bien accessible (sinon les compteurs sont perdus à chaque redémarrage).

**9. Celery beat** : présent en docker-compose mais aucune tâche périodique n'est déclarée (`CELERY_BEAT_SCHEDULE` absent de settings). À documenter ou retirer.

**10. Template `django-chunked-upload`** : installé sans qu'on voie le modèle / la vue correspondante dans le code. Soit utilisé côté media MinIO (alors l'intégration mérite un README), soit à retirer.

**11. Healthcheck Django** : `docker-compose.yml` définit un healthcheck sur Postgres et Redis mais pas sur le service `bestweb`. Ajouter une route `/healthz/` renvoyant 200 et déclarer le healthcheck Traefik associé.

**12. `CONN_MAX_AGE`** ajouté à 60 s : avec gunicorn multi-workers, augmenter à 300 s pour pooler davantage est un quick win. À mesurer avec la charge réelle.

## 6. Étapes suivantes suggérées

1. **Rotation des secrets** (DB, MinIO) avant tout autre déploiement.
2. `pip install -r requirements.txt && python manage.py migrate` pour appliquer les 3 nouvelles migrations.
3. Régénérer un `DJANGO_SECRET_KEY` fort (`python -c "import secrets;print(secrets.token_urlsafe(64))"`) et l'injecter dans le vault / compose.
4. Activer `django-axes` et `django-otp` pour le staff en `INSTALLED_APPS` si le 2FA reste un objectif.
5. Écrire 10–15 tests DRF sur les endpoints critiques (`CourseViewSet.my_courses`, achat de cours, soumission de quiz).
6. Scinder `best_epargne/apis/views.py` et `formations/views.py` en sous-modules par domaine.
