# Recommandations UX & templates — Best Épargne

Date : 25 avril 2026
Suite logique de `AUDIT_MULTIROLE.md` et des Vagues 1 → 6 d'implémentation.
Ce document liste les améliorations UX/templates **non encore appliquées**, classées par priorité et par effort.

---

## 1. État actuel après les Vagues 1 → 6

Ce qui a été livré et qui marche :

- Switcher topbar dans les 3 layouts (`admin_base.html`, `learner_base.html`, `company_base.html`)
- Workspace pill dans les sidebars instructor et learner (repère visuel de l'espace actif)
- Sidebar `org` dédié disponible (`partials/organization_side.html`) — pas encore branché car l'org space utilise `admin_base_template.html` qui contient son propre sidebar inline
- Sidebars instructor/learner utilisent maintenant `available_workspaces` depuis le context processor
- Tous les `{% url %}` rebrandés sur les namespaces `instructor:`, `learner:`, `org:`
- `request.resolver_match.url_name` peut servir d'auto-active state

---

## 2. Anomalies UI restantes (priorité décroissante)

### P1 — `cdn.tailwindcss.com` en production

**Symptôme** : warning console `cdn.tailwindcss.com should not be used in production`. Performance dégradée (download + JIT runtime à chaque page) et impossible de purger les classes inutilisées.

**Action** : compiler Tailwind via PostCSS. Étapes :
1. `npm init -y && npm i -D tailwindcss postcss autoprefixer`
2. `npx tailwindcss init -p` dans la racine du projet
3. Configurer `content: ['./templates/**/*.html', './**/*.py']` dans `tailwind.config.js`
4. `npm run build:css` produit `static/css/app.css`
5. Dans tous les layouts : remplacer `<script src="https://cdn.tailwindcss.com"></script>` par `<link rel="stylesheet" href="{% static 'css/app.css' %}">`
6. Mettre la config Tailwind (couleurs `be-sky`, `be-sun`, `be-ink`) dans `tailwind.config.js` au lieu d'inline `tailwind.config = {...}` dans chaque layout

**Effort** : 1 demi-journée (incluant CI/CD pour rebuild auto).

### P1 — `instructor_side.html` : ~390 lignes, 5 sections décoratives

**Constat** : la sidebar contient au moins 4 blocs ornementaux (gradient sun/ink, "Actions rapides", footer user) qui dupliquent ce que la topbar fait déjà. Surtout depuis qu'on a le switcher.

**Action proposée** :
- Supprimer la carte "Actions rapides" du bas de sidebar (gradient be-sun/be-sky-50). Le `+ Nouveau cours` est déjà dans le header sidebar et la topbar contient les actions de page (`topbar_actions`).
- Supprimer le footer user (avatar + boutons Profil / Déconnexion). Le user pill est déjà en topbar via `{% block topbar_user %}`.
- Conserver les 4 sections principales (Principal, Contenus, Engagement, Finances).

Gain estimé : 390 → ~220 lignes. Sidebar plus lisible, pas de duplication.

### P1 — `learner_side.html` utilise Font Awesome, instructor utilise SVG inline

**Constat** : double dépendance d'icônes (FA via CDN dans learner, SVG inline dans instructor + org). Coût de chargement et incohérence visuelle.

**Action** : convertir `learner_side.html` en SVG inline (icônes lucide ou heroicons), retirer le `<link>` font-awesome dans `learner_base.html`.

**Effort** : 2-3 heures.

### P2 — Active state dépend d'une variable `side_active` passée par chaque vue

**Constat actuel** : chaque `{% include "partials/instructor_side.html" with side_active="dashboard" %}` se passe un `side_active`. C'est verbeux et facile à oublier.

**Action** : remplacer par `request.resolver_match.url_name` qui est disponible automatiquement (Django l'expose via le `context_processor.request`). Le sidebar org partiel le fait déjà. Pour instructor :

```django
{% with current=request.resolver_match.url_name|default:"" %}
{% if current == 'dashboard' %}...active...{% endif %}
{% endwith %}
```

Plus aucune vue n'a besoin de passer `side_active`.

**Effort** : 1 heure (refonte sidebars + suppression de tous les `with side_active=...` dans les pages instructor/learner).

### P2 — Topbar : recherche globale jamais branchée

**Constat** : `{% block topbar_search %}` contient un input `<input type="search" placeholder="Rechercher…">` qui ne fait absolument rien (pas de form action, pas de JS).

**Action** : soit câbler à un endpoint `/search/?q=...` (avec un module `search` dédié), soit supprimer le bloc pour ne pas suggérer une fonctionnalité fantôme.

**Effort** : 4h pour câbler proprement (élargir la portée à un projet à part), 5 minutes pour cacher.

### P2 — `admin_base_template.html` — couches dupliquées

**Constat** : il existe 5 layouts pour 3 espaces métier :
- `admin_base.html` (premium shell, instructor)
- `admin_base_template.html` (autre shell, organization)
- `learner_base.html` (apprenant)
- `company_base.html` (jamais référencé ?)
- `base.html` (public)

**Action** :
1. Faire pointer `templates/organization/dashboard.html` vers une nouvelle base `org_base.html` qui réutilise `partials/organization_side.html` (déjà créé).
2. Supprimer `admin_base_template.html` ET `company_base.html` une fois les vues migrées.
3. Garder `base.html` (public/landing) et `admin_base.html` renommé en `instructor_base.html`.

État cible :
- `instructor_base.html` (ex `admin_base.html`)
- `learner_base.html`
- `org_base.html` (nouveau)
- `base.html` (public)

**Effort** : 1 journée (migration template org + suppression progressive).

### P2 — Sidebars : pas de "Retour à l'espace apprenant"

**Constat** : depuis instructor ou org, on ne peut pas revenir à l'espace learner facilement. Le switcher topbar est la seule sortie.

**Action** : ajouter dans chaque sidebar (sauf learner) un lien permanent en bas : "Retourner sur mon parcours d'apprentissage" — un POST vers `/workspace/switch/` avec `kind=learner`.

**Effort** : 30 minutes.

### P3 — Sidebars : pas de pastille "nouveau"

**Constat** : si un instructeur reçoit un nouveau review, ou un org admin un nouveau membre en attente de validation, rien ne le signale dans la sidebar.

**Action** : badge numérique sur les items `Avis & notes` (instructor), `Membres` (org), `Notifications` (learner). Calculé via context processor avec un cache court (60s).

**Effort** : 1 journée (avec cache, signaux d'invalidation).

### P3 — Onboarding visuel pour user multi-rôles

**Constat** : un user créé via `OrganizationInstructorCreateView` qui se connecte la 1re fois reçoit le switcher mais ne sait pas par où commencer.

**Action** : carte d'onboarding dans le dashboard de chaque espace, qui propose 3-4 micro-étapes (créer ton 1er cours, ajouter un media, inviter un learner). Stocké en `learner_kyc.onboarding_profile` ou nouvelle `OnboardingState`.

**Effort** : 2 journées pour le système complet, 1 jour pour une version statique.

### P3 — Recherche globale dans la topbar

**Constat** : voir P2 sur l'input fantôme. À implémenter proprement avec un endpoint dédié et un panneau de résultats.

**Effort** : 2-3 jours.

---

## 3. Améliorations DX (developer experience)

### P1 — Tests manquants

`AUDIT_REPORT.md` (point 4 des points ouverts) et l'audit multi-rôles convergent : 0 tests fonctionnels. **Risque énorme** vu l'agressivité du rebrand de Vague 5.

**Action** : `pytest-django` + `factory_boy` sont déjà dans requirements. Écrire :
- `tests/test_workspaces.py` — 8 cas que j'ai déjà smoke-tested manuellement
- `tests/test_catalog_services.py` — visibility/scoping cours et médias par rôle
- `tests/test_navigation.py` — 1 user multi-rôles fait login → switche → vérifie que chaque espace renvoie la bonne page
- `tests/test_permissions.py` — owner/admin/instructor/learner croisé sur les actions API critiques

**Effort** : 2-3 jours pour 30-40 tests qui couvrent le critical path.

### P1 — Migration manquante `MediaUploadLog`

Détecté par `makemigrations --dry-run` pendant Vague 1. Le modèle existe dans `catalog/models.py` mais aucune migration ne le crée.

**Action** : `python manage.py makemigrations catalog` puis vérifier le contenu du fichier généré, puis `migrate`.

**Effort** : 30 minutes.

### P1 — Migration `Course.company` → `Course.organization`

Renommage planifié dans `AUDIT_MULTIROLE.md` mais pas exécuté. Le code utilise encore `company`/`company_id`/`company_only` dans Course alors que tout le reste parle d'organization.

**Action** :
1. `Course.organization = ForeignKey("organizations.Organization", ...)` ajouté
2. Migration data : copier `company_id` dans `organization_id`
3. Switcher tous les usages (vues, services, serializers) vers le nouveau champ
4. Une release plus tard, supprimer `company`

**Effort** : 1 journée + un cycle de release.

### P2 — Type hints manquants

`compte/services.py`, `formations/Rolemixin.py` ont des fonctions sans annotations. `catalog/services.py` que j'ai écrit en a — modèle à propager.

**Effort** : 2-3 heures.

### P2 — DEAD CODE

Repérés pendant l'audit :
- `formations/views.py` lignes 41-54 : commentaire de 14 lignes sur l'ancien `_redirect_by_role`. À supprimer.
- `formations/views.py` lignes 56-80 : `resolve_user_dashboard_url` duplique `compte.adapters.resolve_user_dashboard_url`. Garder un seul.
- `compte/services.py` `AccessService` : aucune des méthodes n'est appelée ailleurs dans le codebase. À supprimer ou à câbler dans les vues.
- `formations/Rolemixin.py` : `admin_dashboard` URL n'existe pas, mais `_redirect_by_role` essaie de reverse() ça → `NoReverseMatch` silencieux pour un admin plateforme.

**Action** : passe de cleanup dédiée. Test: `manage.py check` + grep pour `from compte.services` et `AccessService`.

**Effort** : demi-journée.

### P2 — Logging des accès cross-org

L'audit recommandait : "Logger en WARNING toute tentative de cross-org access". Pas implémenté.

**Action** : dans `OrganizationScopedMixin.dispatch`, si `test_func()` retourne False et que l'user est authentifié, faire un `logger.warning("user %s tried to access org %s", user.id, org_id)`. Idem pour `can_modify_media` qui retourne False.

**Effort** : 2 heures.

### P3 — Mesures perf

Le dashboard formateur a été optimisé de 18 → 6 requêtes (`AUDIT_REPORT.md`). Le dashboard learner et le dashboard org devraient subir le même traitement avec `django-debug-toolbar` ou `silk`.

**Effort** : 1 journée.

---

## 4. Améliorations métier (à confirmer avec vous)

### Q1 — `Course.company_only` vs `Course.organization` : la sémantique du flag

Aujourd'hui `company_only=True` signifie "cours interne entreprise". Mais le scoping de visibilité ne dépend QUE de `company` (FK). Le flag `company_only` n'est lu que dans les listes publiques (catalog).

**Question** : doit-on traiter un cours avec `company` non null mais `company_only=False` comme un cours visible aussi en marketplace public ? Aujourd'hui oui (et c'est probablement bizarre).

### Q2 — Permissions des `MANAGER` org

Actuellement, MANAGER a accès au dashboard org (lecture) mais ne peut **rien modifier** (`can_modify_media` exige ADMIN/OWNER, idem côté `OrganizationAdminRequiredMixin`).

**Question** : un MANAGER doit-il pouvoir créer des cours ? créer des medias et les rattacher à l'org ? gérer les inscriptions des apprenants à un cours ? Si oui, étendre les permissions. Si non, supprimer le rôle MANAGER de la liste des accès au dashboard (sinon il se retrouve dans une UI où il ne peut que regarder).

### Q3 — Onboarding instructor

`compte.adapters.get_signup_redirect_url` redirige les nouveaux instructors vers `instructor:dashboard` directement. Mais beaucoup d'instructors n'ont pas de bio / photo / payout configuré. Une mini-page d'onboarding serait pertinente (1er cours, profil instructeur, paiement).

### Q4 — Apprenant qui consomme un cours d'org

Un apprenant rattaché à une org via membership LEARNER : voit-il automatiquement les cours de cette org dans son dashboard learner ? Aujourd'hui `LearnerOrganizationCoursesAPIView` existe déjà — vérifier qu'il est bien câblé sur la home apprenant.

### Q5 — Bibliothèque média : preview vidéo dans l'espace org

L'espace `org` n'a aujourd'hui pas d'item "Bibliothèque média" dans sa sidebar (cf. `admin_base_template.html` ou `partials/organization_side.html` que j'ai créé). Pourtant les médias org sont partagés. À ajouter : un onglet `Médias` qui liste les médias de l'organisation courante, à parité avec celui de l'instructor.

---

## 5. Risques / dette technique repérés

### R1 — Le rebrand `{% url %}` n'a pas été testé en navigation réelle

Les 162 remplacements ont été faits sans tests fonctionnels. Si un template a un `{% url %}` dans une condition rarement exercée (modal, drawer, ajax response), il peut planter en runtime. Le `manage.py check` ne détecte PAS les `{% url %}` invalides — ils ne sont évalués qu'au rendu.

**Mitigation** : navigation manuelle complète (login → instructor → courses → builder → media → quiz → switch org → dashboard org → courses → members → switch learner → dashboard) avec onglet Network ouvert pour repérer les 500.

### R2 — `MediaAsset.organization` backfill incomplet

Migration 0008 ne rattache que les users mono-org. Pour les users multi-org, leurs médias restent NULL → invisibles aux autres membres jusqu'à un rattachement manuel.

**Mitigation** : interface admin qui permet à un OWNER d'org de "réclamer" les médias de ses membres, ou commande de management `python manage.py rattach_media --user X --org Y`.

### R3 — `is_instructor` retourne True via `hasattr(self, "instructor_profile")` qui déclenche une requête SQL

Pour un user actif sur 100 pages d'instructor, ça fait 100 SELECT. À optimiser via cache de session ou property avec memoization.

**Mitigation** : dans le modèle User, transformer `is_instructor` en `cached_property` ou ajouter un flag persistant `is_instructor_active`.

### R4 — `compte.adapters.resolve_user_dashboard_url` redirige vers `admin_dashboard` qui n'existe pas

Pour un user `is_platform_admin=True`, le `_safe_reverse("admin_dashboard")` retourne le fallback `/`. **Donc en pratique, un admin plateforme atterrit sur la page publique au login**. C'est un bug UX mineur mais réel.

**Mitigation** : créer une route `admin_dashboard` (ou rediriger vers `admin:index` qui existe), ou retirer cette branche du code de redirection.

### R5 — `cdn.tailwindcss.com` en prod = warning visible utilisateur

Cf. P1 ci-dessus. Tant que ce n'est pas corrigé, **tout utilisateur ouvre la console et voit un warning Anthropic-style**, ça donne une impression d'app "amateur".

### R6 — Cache CSS du switcher

Les classes Tailwind utilisées dans le switcher (couleurs sky/sun/rose/emerald) doivent être présentes dans le purge. Avec le CDN runtime ça marche mais après build PostCSS, il faudra valider que ces classes ne sont pas supprimées par le purge.

---

## 6. Plan d'attaque recommandé pour la suite

Si vous avez 1 sprint (5 jours) à dédier à ce projet, voici l'ordre que je recommande :

| Jour | Tâche | Bénéfice |
|---|---|---|
| 1 | Tests fonctionnels critiques (workspaces, services, navigation 1 user multi-rôles) | Filet de sécurité avant toute autre modif |
| 2 | Migration manquante `MediaUploadLog` + cleanup dead code (P2 §3) + R4 redirection admin | Hygiène, supprime les surprises |
| 3 | Build Tailwind PostCSS (P1 §2) + retrait Font Awesome learner | Perf prod, cohérence visuelle |
| 4 | Migration `Course.company` → `Course.organization` + tests | Élimine la confusion sémantique majeure |
| 5 | Page d'onboarding instructeur + sidebar org branchée sur partial dédié + lien "Retour learner" | UX visible, valeur utilisateur |

---

## 7. Annexe — fichiers nouveaux livrés en Vague 6

| Fichier | Rôle |
|---|---|
| `templates/partials/workspace_pill.html` | Carte d'identification de l'espace courant. Réutilisée en tête de chaque sidebar. |
| `templates/partials/organization_side.html` | Sidebar dédié pour l'espace org. Pas encore branché (admin_base_template.html garde sa version inline). |

| Fichier modifié | Changement |
|---|---|
| `templates/partials/instructor_side.html` | `workspace_pill` ajouté en tête de la zone navigation. |
| `templates/partials/learner_side.html` | `workspace_pill` ajouté en tête de la zone navigation. |

Vérifié : `manage.py check` 0 issue ; les 5 partials rendent OK.

---

Fin du document. Pour toute question ou priorité différente, contactez-moi.
