# ROADMAP — Travail restant (~10-15 jours dev)

**Date :** 17 mai 2026
**État au moment de l'écriture :** 71 % des 350 findings audit fermés
(94 % critiques, 78 % importants).

Ce document liste **PR-par-PR** le travail restant pour atteindre 100 %
de couverture. Chaque PR est commitable indépendamment ; les dépendances
sont indiquées explicitement.

---

## Vue d'ensemble

| Sprint | Bloc | PRs | Effort | Risque |
|---|---|---|---|---|
| 0 | Application + smoke tests | 1 | 1 j | Faible |
| 1 | V5 lourd UI — écrans | 4 PR | 4-6 j | Faible |
| 2 | V5 lourd UI — accessibilité | 1 PR | 2 j | Faible |
| 3 | V6 lourd refactor — splitter | 3 PR | 4-5 j | Modéré |
| 4 | V7 — décision Channels | 1 PR | 0,5-3 j | — |
| 5 | Polish | 2 PR | 1-2 j | Faible |
| **Total** | **12 PR** | **12-19 j** | **Modéré** |

---

## Sprint 0 — Application des correctifs livrés

### PR-00 — Apply audit remediation V1+V2+V3+V4+V_FIN

**Objectif :** appliquer les **52 fichiers `.new`** et les **6 migrations**
livrés en V1→V_FIN, faire passer la CI.

**Étapes :**
1. `git checkout -b chore/audit-remediation-2026-05`
2. Audit `.env` historique (cf. SEC-01 — opérationnel) :
   ```bash
   git log --all -- .env  # si présent → git filter-repo, puis rotate
   ```
3. `./apply.sh check` puis `./apply.sh apply`
4. Suivre `CLEANUP_TEMPLATES.md` pour `git rm` les 7 templates orphelins.
5. Vérifier la migration commerce 0005 :
   ```sql
   SELECT provider, reference, count(*)
   FROM commerce_paymenttransaction
   WHERE reference <> ''
   GROUP BY provider, reference HAVING count(*) > 1;
   -- doit retourner 0 lignes
   ```
6. Activer pg_trgm : `psql -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"`
7. `python manage.py migrate`
8. `pip install -r requirements.txt -r requirements-dev.txt`
9. `npm install && npm run build:css`
10. `pytest tests/ -v --reuse-db` (61+ tests doivent passer)
11. `python manage.py check --deploy` (0 issue avec vraies env vars)
12. Poser les variables d'env (cf. README "Variables d'environnement") :
    - `STRIPE_WEBHOOK_SECRET`, `PAYDUNYA_MASTER_KEY`, `CINETPAY_WEBHOOK_SECRET`
    - `SITE_URL`, `MINIO_QUERYSTRING_AUTH=1`, etc.

**Effort :** 1 jour (incluant les vérifications opérationnelles).
**Risque :** Faible. Le script `apply.sh` est idempotent et `undo` peut
restaurer depuis git.

**Acceptance :** voir [`ACCEPTANCE.md`](ACCEPTANCE.md).

---

## Sprint 1 — V5 lourd : migration des écrans vers `app_shell.html`

3 démonstrations livrées (`organization/dashboard.html.new`,
`instructor/instructor_dash.html.new`, `learner/student_dash.html.new`).
Il reste **~23 écrans à migrer** selon le même pattern.

### PR-01 — Migrer les écrans organisation

**Périmètre :** `templates/organization/*.html`

Écrans à migrer (12) :
- `courses.html`, `course_create.html`, `course_detail.html`,
  `course_builder.html`, `lesson_create.html`
- `members.html`, `member_create.html`, `member_detail.html`,
  `instructor_create.html`, `learner_create.html`
- `media_library.html`
- `quiz_create.html`, `quiz_detail.html`

**Pattern à appliquer :**
```html
{% extends "layout/app_shell.html" %}
{% block sidebar %}{% include "partials/organization_side.html" %}{% endblock %}
{% block page_title %}…{% endblock %}
{% block content %}…{% endblock %}
```
Utiliser `kpi_card`, `course_card`, `filter_bar`, `empty_state`.

**Effort :** 1,5-2 jours.
**Risque :** Faible (template-only, pas de logique).
**Dépend de :** PR-00.

---

### PR-02 — Migrer les écrans instructor

**Périmètre :** `templates/instructor/*.html` et `templates/instructor/quiz/*.html`

Écrans à migrer (9) :
- `instructor_courses.html`, `instructor_builder.html`,
  `instructor_course_detail.html`, `instructor_media.html`,
  `instructor_media_detail.html`
- `quiz/quiz_list.html`, `quiz/quiz_create.html`,
  `quiz/quiz_detail.html`, `quiz/quiz_update.html`

**Effort :** 1,5-2 jours.
**Risque :** Faible.
**Dépend de :** PR-00.

---

### PR-03 — Migrer les écrans learner

**Périmètre :** `templates/learner/*.html`

Écrans à migrer (4) :
- `learner_explore.html` (utiliser `filter_bar` + `course_card`)
- `learner_course_player.html` (utiliser `lesson_player.html` partial)
- ré-utiliser `student_dash.html.new` comme dashboard principal

**Effort :** 1,5 jours.
**Risque :** Faible.
**Dépend de :** PR-00.

---

### PR-04 — Migrer les écrans platform admin

**Périmètre :** `templates/platform/*.html`

Écrans à migrer (3) :
- `admin_dashboard.html`, `organizations.html`, `users.html`

**Effort :** 1 jour.
**Risque :** Faible.
**Dépend de :** PR-00.

> **Note** : protéger ces vues avec `@platform_admin_otp_required`
> (cf. PATCHES.md §29 + `core/decorators.py`).

---

## Sprint 2 — V5 lourd : accessibilité (193 labels `for=` + autocomplete)

### PR-05 — Accessibilité formulaires avec `{% labeled_field %}`

**Périmètre :** tous les formulaires Django dans :
- `templates/account/*.html` (login, signup, reset password)
- `templates/organization/*_create.html`, `*_update.html`
- `templates/instructor/instructor_builder.html`, `quiz/*.html`
- `templates/learner/learner_explore.html` (filtres)
- `templates/business/*.html` (formulaire d'intérêt)
- `templates/assessments/onboarding_quiz.html`

**Pattern :**
```html
{% load a11y %}
<form method="post">
  {% csrf_token %}
  {% labeled_field form.email autocomplete="email" required=True %}
  {% labeled_field form.password autocomplete="current-password" required=True %}
  ...
  <button type="submit" class="btn-primary">Valider</button>
</form>
```

Le templatetag `{% labeled_field %}` (`core/templatetags/a11y.py`) génère
automatiquement `id`, `for`, `autocomplete`, `aria-required`, `aria-invalid`,
`aria-describedby` pour les erreurs et help_text.

**Estimer :** ~50 formulaires × ~5 minutes = ~4 heures de travail mécanique
+ tests visuels.

**Effort :** 2 jours.
**Risque :** Faible (helper testé, juste à appliquer).
**Dépend de :** PR-01..04 (les forms sont dans les écrans migrés).

---

## Sprint 3 — V6 lourd : refactor god-modules

### PR-06 — Migrer `_shared.py` + utiliser depuis le legacy `views.py`

**Objectif :** activer le module `views_package/_shared.py` (V_LAST.B) et
le faire utiliser par `apis/views.py` legacy comme étape intermédiaire.

**Étapes :**
1. Renommer `views_package/_shared.py.new` → `_shared.py`.
2. Dans `apis/views.py` : remplacer les 3 définitions de `_range_to_days`
   par `from .views_package._shared import _range_to_days`.
3. Supprimer les 3 définitions locales + définitions de `_course_to_dict`
   et `_get_writable_course` (utiliser celles de `_shared`).
4. Lancer `pytest` et `manage.py check`.

**Effort :** 0,5 jour.
**Risque :** Modéré (rétro-compatibilité imports).
**Dépend de :** PR-00.

---

### PR-07 — Migrer les vues `Instructor*` vers `views_package/instructor.py`

**Étapes :**
1. Identifier dans `apis/views.py` toutes les classes `Instructor*` (~40 vues).
2. Les couper-coller vers `views_package/instructor.py`.
3. Adapter les imports : `from ._shared import _get_writable_course`, etc.
4. Au début de `apis/views.py`, ajouter :
   ```python
   from .views_package.instructor import *  # noqa: F401,F403
   ```
5. Vérifier que `api_urls.py` n'a pas besoin d'être touché.

**Effort :** 1-1,5 jours.
**Risque :** Modéré (40 classes — tests obligatoires).
**Dépend de :** PR-06.

---

### PR-08 — Migrer les vues `Learner*` et `Media*` et `Public*` et `Platform*`

Idem PR-07 pour les autres préfixes. Découper en 1 PR par préfixe si
nécessaire (4 PRs ?).

**Effort :** 2-3 jours.
**Risque :** Modéré.
**Dépend de :** PR-07.

> Une fois ces PR mergées, le fichier `apis/views.py` doit être réduit
> à ~50 lignes (juste des `from views_package... import *`). À ce moment
> on peut renommer en `views.py.legacy` et faire de `views_package/`
> le nouveau `views/`.

---

## Sprint 4 — V7 : décision Channels/WebSockets

### PR-09a — Option A : retirer la mention Channels de la doc

**Si l'UX temps réel n'est PAS un besoin produit :**
- Retirer `Channels/WebSockets` de la doc d'architecture (README, audit).
- Documenter clairement que toutes les notifications sont in-app + email
  (notifications app, V_FIN.B).
- 30 min.

### PR-09b — Option B : installer Channels effectivement

**Si l'UX temps réel EST un besoin :**

1. `pip install channels[daphne]==4.1 channels-redis==4.2.1`
2. `requirements.txt` :
   ```
   channels==4.1.0
   channels-redis==4.2.1
   daphne==4.1.2
   ```
3. `best_epargne/asgi.py` :
   ```python
   from channels.routing import ProtocolTypeRouter, URLRouter
   from channels.auth import AuthMiddlewareStack
   from channels.security.websocket import AllowedHostsOriginValidator
   from best_epargne import routing

   application = ProtocolTypeRouter({
       "http": get_asgi_application(),
       "websocket": AllowedHostsOriginValidator(
           AuthMiddlewareStack(URLRouter(routing.websocket_urlpatterns))
       ),
   })
   ```
4. Créer `best_epargne/routing.py` avec un consumer test.
5. Settings : `CHANNEL_LAYERS = {"default": {"BACKEND": "channels_redis.core.RedisChannelLayer", "CONFIG": {"hosts": [settings.REDIS_URL]}}}`
6. Docker : passer `bestweb` à `daphne best_epargne.asgi:application --bind 0.0.0.0:8000`
7. Utilisation : un consumer `NotificationConsumer` pour pousser les
   `notifications.Notification` en temps réel côté frontend Alpine.

**Effort :** 2-3 jours (incluant tests + branchement frontend Alpine).
**Risque :** Modéré (changement de runtime ASGI).

---

## Sprint 5 — Polish

### PR-10 — Coverage 60%

**Périmètre :** ajouter des tests pour les apps les moins couvertes :
- `compte/middleware.py` (OnboardingRequiredMiddleware)
- `compte/adapters.py` (allauth adapter)
- `organizations/views.py` (vues OrganizationCourse*)
- `formations/Rolemixin.py`
- `commerce/services.refund_order`

**Effort :** 2 jours.
**Risque :** Faible.
**Dépend de :** PR-00.

---

### PR-11 — Nettoyage final + bump deps

**Périmètre :**
- Supprimer les imports inutilisés signalés par audit
  (FORMATIONS-28 : ~10 imports dans views.py).
- Supprimer le code commenté restant
  (COMPTE-30 : ancien CustomSignupForm, etc.).
- Bump `django-axes`, `cryptography`, `qrcode`, etc. aux dernières
  versions stables.
- Activer Renovate / Dependabot.

**Effort :** 1 jour.
**Risque :** Faible.

---

## Récapitulatif effort global

| Sprint | Effort estimé |
|---|---|
| 0 — Application | 1 j |
| 1 — UI migrations (4 PRs) | 4-6 j |
| 2 — A11y formulaires | 2 j |
| 3 — Splitter (3 PRs) | 4-5 j |
| 4 — Channels (option binaire) | 0,5-3 j |
| 5 — Polish (2 PRs) | 1-2 j |
| **TOTAL** | **12-19 j** |

---

## Convention de PR

Pour chaque PR :

1. **Branche** : `feat/audit-XX-<description-courte>` ou
   `chore/audit-XX-<...>`.
2. **Commit message** : référence l'ID audit traité.
   ```
   feat(reviews): require enrollment before review (REV-01)

   Closes REV-01 (audit_best_epargne_2026.docx §A.4).
   Adds Enrollment.exists() check in perform_create.
   ```
3. **PR description** : lien vers la section concernée de l'audit + tests
   ajoutés + capture d'écran si UI.
4. **Tests** : exigés pour toute modification de logique métier.
5. **Reviewer** : exiger 1 reviewer senior + 1 reviewer UI si template
   touché.
6. **CI** : doit passer (ruff + pytest + pip-audit + Trivy si build image).

---

## Convention de testing

- Tests unitaires dans `tests/` (avec `pytest --reuse-db`).
- Coverage cible : 60 % à terme.
- Tests d'intégration via `pytest -m integration` (à introduire en PR-10).
- Smoke tests post-deploy :
  - `/healthz/` retourne 200
  - `/api/docs/` charge sans erreur
  - `/certifications/verify/<test_uuid>/` retourne 404 propre
  - Login → switch_workspace → redirect dashboard fonctionne

---

## Quand cette roadmap sera-t-elle terminée ?

À la fin du Sprint 5 :

- 100 % des **critiques** audit fermés.
- > 90 % des **importants** audit fermés.
- > 75 % des **mineurs** audit fermés.
- Toutes les UI sur le même design system.
- Coverage tests à 60 %.
- Channels décision prise et implémentée (ou retirée).
- CI/CD verte sur main + déploiement automatisé.

Le projet sera alors **production-ready dans son intégralité**, sans
dette technique structurante.

— Audit & remediation team, mai 2026.
