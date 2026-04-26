# Audit multi-rôles — Best Épargne

Date : 25 avril 2026
Périmètre : architecture des rôles, navigation entre interfaces (Learner / Instructor / Organisation), permissions, partage des contenus, redirections, sidebars, templates, URLs.

Ce document complète `AUDIT_REPORT.md` (qui couvrait sécurité / config / perfs). Il se concentre **uniquement** sur les incohérences de la couche multi-rôles.

---

## 1. Résumé exécutif

Votre couche métier des rôles est **mieux pensée que la moyenne** : `User.platform_role` + `OrganizationMembership.role` + profils (`LearnerProfile` / `InstructorProfile`) forment une base saine ; la classe `PermissionUtils` et l'ensemble des permissions DRF (`IsInstructor`, `IsOrganizationAdmin`, `IsOrganizationManagerForObject`...) sont propres et réutilisables.

Mais **les couches du dessus n'utilisent pas correctement cette base**. On y trouve :

- **3 bugs bloquants** (un dashboard qui leak les données plateforme, un mixin qui filtre sur un champ inexistant, une boucle de redirection latente),
- **1 lacune architecturale majeure** (pas de notion d'« espace actif » pour les utilisateurs multi-rôles, donc pas de switcher),
- **6 incohérences de cohérence** (vue template ≠ vue API, partage org cassé pour les médias, naming `company` vs `organization` mélangé, doubles définitions de `OrganisationDashboard`, etc.),
- **plusieurs problèmes UX** qui découlent directement du point précédent.

État synthétique :

| Axe | Note |
|---|---|
| Modèle des rôles (User, Membership, profils) | OK |
| Permissions DRF (`PermissionUtils` + classes) | OK |
| Mixins template (`RoleRequiredMixin`, `OrganizationScopedMixin`) | Partiel (bugs) |
| Redirection allauth après login | Partiel (pas de switcher) |
| Sidebars conditionnelles | Cassé (pas de contexte d'espace) |
| Filtrage queryset par scope | Cassé (Course/MediaAsset) |
| Cohérence URL (namespaces) | Mauvais |
| Partage org instructor → org members | Cassé (Media) / faux (Course) |

---

## 2. Architecture cible recommandée

Avant de lister les bugs, voici l'architecture qu'il faut viser. Tous les correctifs convergent vers ça.

### 2.1 Trois espaces, un switcher

Un utilisateur a 0..N **rôles métier** :

- `LEARNER` (toujours implicite — tout user authentifié peut apprendre)
- `INSTRUCTOR` (a un `InstructorProfile` ou est `INSTRUCTOR` dans une org)
- `ORG_MEMBER` of organization X (tout `OrganizationMembership` actif, quel que soit le rôle)
- `ORG_ADMIN` of organization X (`OWNER`/`ADMIN`/`MANAGER`)
- `PLATFORM_ADMIN` (transverse)

L'utilisateur **navigue toujours dans un seul espace à la fois**, qu'on appelle `active_workspace`. Il est stocké en session :

```python
request.session["active_workspace"] = {
    "kind": "instructor" | "learner" | "org",
    "organization_id": <int|None>,  # uniquement pour kind == "org"
}
```

La topbar contient un **switcher** qui liste les espaces auxquels l'utilisateur a droit. Cliquer sur un item écrit dans la session et redirige vers le dashboard correspondant. Le sidebar est sélectionné par cet `active_workspace`, pas par l'URL.

### 2.2 Règles de scope des données

| Ressource | Espace `learner` | Espace `instructor` | Espace `org` |
|---|---|---|---|
| Cours visibles | Cours auxquels je suis inscrit + catalogue public | Mes cours créés + cours `company=mon_org` (lecture, modif si auteur ou admin) | Tous les cours `company=current_org` |
| Médias visibles | Aucun (pas de bibliothèque côté learner) | Mes médias + médias des membres de mes orgs (si même org) | Médias des membres de current_org |
| Quiz | Quiz que je dois passer | Quiz que j'ai créés + quiz de mes orgs | Quiz de current_org |
| Modification | — | Auteur uniquement, ou admin org | Admin org sur tout objet de current_org |

### 2.3 URL namespaces

Chaque espace a son namespace, ses templates dédiés et son base layout :

```
/learner/         → app urls : namespace "learner",   layout: learner_base.html
/instructor/      → app urls : namespace "instructor", layout: instructor_base.html
/org/<org_id>/    → app urls : namespace "org",       layout: org_base.html
/admin-platform/  → namespace "platform_admin",       layout: admin_base.html
```

Plus de `/dashboard/business/`, `/dashboard/instructor/courses/`, `/instructor/courses/<id>/edit/` dispersés — un seul préfixe par espace.

### 2.4 Couches de permissions

```
┌──────────────────────────────────────────────────────────────────┐
│  Vue template (DTL)  ─── RoleRequiredMixin / WorkspaceMixin     │
│  Vue API (DRF)       ─── permissions DRF (PermissionUtils)      │
│                          ↓ s'appuient sur                        │
│  Service métier      ─── compte/services.py + scoping helpers   │
│                          ↓ s'appuient sur                        │
│  Modèle              ─── User + OrganizationMembership + profils│
└──────────────────────────────────────────────────────────────────┘
```

Les vues n'inspectent **jamais** `user.is_org_admin` directement : elles passent par les mixins/permissions. Ça centralise les décisions et facilite les tests.

---

## 3. Problèmes détectés (catégorisés et priorisés)

Code de priorité :
- **P0** : bug bloquant ou faille
- **P1** : incohérence métier visible par l'utilisateur
- **P2** : dette ou problème UX

### P0-1 — `OrganisationDashboard` (formations) leak les données plateforme et boucle

`formations/views.py:931` : la classe `OrganisationDashboard` bindée sur l'URL `business_dashboard` (donc cible de la redirection allauth pour tout admin/owner d'org) :

```python
class OrganisationDashboard(LoginRequiredMixin, OrganizationAdminRequiredMixin, TemplateView):
    template_name = "instructor/admin_dash.html"

    def dispatch(self, request, *args, **kwargs):
        if not (user.is_staff or user.is_superuser):
            return redirect(_redirect_by_role(user))   # ← danger
        return super().dispatch(...)

    def get_context_data(...):
        total_courses = Course.objects.count()           # ← TOUTE la plateforme
        total_users = User.objects.count()               # ← TOUTE la plateforme
        ...
```

Trois problèmes simultanés :

1. **Data leak** : un admin plateforme voit ici `Course.objects.count()`, `Enrollment.objects.count()`, `User.objects.count()` — il devrait voir des KPIs de **son** organisation. Pour un owner d'org non staff, le dispatch le rejette mais l'URL `business_dashboard` reste sa cible de redirection — donc il atterrit dans une vue qui le rejette, qui le redirige vers `business_dashboard`, qui le rejette… **boucle de redirection**.
2. **Le dispatch contredit le mixin** : `OrganizationAdminRequiredMixin` autorise OWNER/ADMIN d'org, mais le dispatch exige ensuite `is_staff or is_superuser`. C'est mort pour tout user qui n'est pas super-admin Django.
3. **Le template `instructor/admin_dash.html`** est utilisé pour deux dashboards de natures différentes (admin plateforme et admin org).

**Action :** supprimer cette classe. La redirection `business_dashboard` doit pointer vers `organizations:dashboard` (l'autre, qui marche) ou un nouveau dashboard org dédié dans le namespace `org`.

### P0-2 — `InstructorBaseMixin.get_instructor_course` filtre sur un champ inexistant

`formations/Rolemixin.py:250` :

```python
qs = Course.objects.select_related("category", "instructor", "organization")
return get_object_or_404(
    qs.filter(
        Q(instructor=user) |
        Q(organization_id__in=org_ids)
    ).distinct(),
    id=cid,
)
```

Or dans `catalog/models.py`, **`Course` n'a PAS de champ `organization`**. Il a `company` (FK vers `Organization`). Le `select_related("organization")` lèvera `FieldError` ; le `Q(organization_id__in=...)` lèvera `FieldError`.

Conséquence : dès qu'un instructeur d'organisation tente d'éditer un cours qui n'est pas le sien (et qu'il devrait pouvoir éditer parce que membre de la même org), Django plante. Le code s'en sort tant que personne n'utilise effectivement la voie « org admin gère un cours d'un de ses formateurs ».

**Action :** remplacer `organization` par `company` partout dans `Rolemixin.py` et utiliser `Q(company_id__in=org_ids)`.

### P0-3 — `compte/services.py` importe le mauvais User

`compte/services.py:1` :

```python
from django.contrib.auth.models import User   # ← faux User
```

Le projet a `AUTH_USER_MODEL = "compte.User"`. Cet import n'est pas utilisé dans le module donc ça ne casse rien aujourd'hui, mais c'est une **bombe à retardement** dès que quelqu'un complète le service. À supprimer.

### P0-4 — `MediaAsset` n'a pas de FK organisation, donc le partage est mort

`catalog/models.py:133` : `MediaAsset` a uniquement un `owner` (FK User). Pas d'`organization`/`company`.

`best_epargne/apis/views.py:1152` (`InstructorMediaListView`) inclut un branchement défensif :

```python
if hasattr(MediaAsset, "organization") and org_ids:
    query |= Q(organization_id__in=org_ids)
```

Le `hasattr` retourne **False** (le champ n'existe pas), donc cette branche n'est jamais prise. **Un membre d'organisation ne voit jamais les médias des autres membres**, en contradiction directe avec votre cahier des charges.

**Action :** ajouter `MediaAsset.organization = ForeignKey("organizations.Organization", null=True, blank=True)`. À la création (vues `MediaUploadFinalizeView` et `MediaMultipartCompleteView`), pré-remplir avec l'organisation principale de l'utilisateur (ou laisser explicite via paramètre). Migrer les médias existants en backfill : pour chaque `MediaAsset`, si l'`owner` n'a qu'une seule org active, on rattache.

### P1-1 — Pas de notion d'« espace actif » (root cause UX)

C'est **la** cause racine de la confusion que vous décrivez.

`HomeView` est un `TemplateView` neutre, `LOGIN_REDIRECT_URL = "/"`. Après login allauth utilise `AccountAdapter.get_login_redirect_url` qui résout strictement par priorité (`platform_admin > org_admin > org_manager > instructor > learner`). Donc un user `instructor + org_member` part toujours sur `business_dashboard` après login, sans choix. Une fois là-dedans, **rien dans l'UI ne lui permet de naviguer vers son espace `instructor`** sauf en tapant l'URL.

Aujourd'hui :

- `templates/partials/instructor_side.html` ajoute un lien « Admin organisation » si `can_access_org_admin` est vrai (calculé dans `InstructorBaseMixin.get_context_data`),
- mais l'inverse n'existe pas : pas de lien retour vers l'espace instructor depuis l'espace organisation,
- aucune des sidebars ne propose un retour vers l'espace `learner`,
- `InstructorBaseMixin.get_org_admin_membership` ne retourne que la **première** organisation : si l'user est admin de 2 orgs, la 2e est invisible.

**Action :** introduire un `ActiveWorkspace` (cf. §4) et un switcher topbar.

### P1-2 — Vue template instructor ≠ vue API instructor (cours)

- `formations/views.py` (`InstructorCourseView`) → utilise `InstructorBaseMixin.get_instructor_course` qui essaie d'inclure les cours de l'org (mais cf. P0-2, ça plante).
- `best_epargne/apis/views.py` (`CourseViewSet.my_courses`) → filtre **uniquement** `instructor=request.user`, pas de partage org.

Donc la page HTML promet à l'admin org de voir les cours de ses instructeurs, mais l'API `/api/instructor/courses/` (utilisée par cette même page côté JS) ne retourne que ses propres cours. **Le rendu côté HTML est incomplet** sans qu'on s'en rende compte parce que P0-2 fait planter le chemin alternatif.

**Action :** unifier autour d'un service `formations.services.get_instructor_courses_qs(user, organizations=None)` utilisé à la fois par la vue HTML et par la vue API.

### P1-3 — `OrganisationDashboard` existe deux fois

- `formations/views.py:931` (cassé, cf. P0-1)
- `organizations/views.py:204` (correct, scopé par org)

Les deux importent depuis le même fichier dans les URLs. Le 1er gagne car il est référencé par `business_dashboard` dans `best_epargne/urls.py:86`, le 2e par `organization_dashboard` dans `organizations/urls.py`.

**Action :** supprimer la version `formations/`, faire pointer `business_dashboard` vers une vue dédiée qui choisit la bonne org pour l'utilisateur (ou propose un sélecteur si plusieurs).

### P1-4 — `RoleRequiredMixin.test_func` insuffisant pour le partage org

Dans `formations/Rolemixin.py:114`, `test_func` retourne `True` dès qu'**un seul** flag autorisé est satisfait. Donc `InstructorRequiredMixin` (`allow_instructor=True, allow_platform_admin=True`) laisse passer un user qui a juste un `InstructorProfile` mais zéro `OrganizationMembership`. C'est correct pour l'instructeur indépendant. **Mais il manque** `allow_org_member` pour les vues qui doivent être lisibles par tout membre actif de l'org (pas juste admin).

**Action :** ajouter `allow_org_member` (n'importe quel rôle org actif) et `allow_org_instructor` (rôle INSTRUCTOR au sein d'une org).

### P1-5 — `is_instructor` propriété trop fuzzy

`compte/models.py:165` :

```python
@property
def is_instructor(self) -> bool:
    return hasattr(self, "instructor_profile") or self.is_org_instructor
```

`hasattr(self, "instructor_profile")` déclenche un `SELECT` à chaque appel (cache via `_state` parfois mais pas toujours). Et le mélange OR avec `is_org_instructor` fait que :

- un user qui a un `InstructorProfile` historique mais qui n'est plus actif comme instructeur reste éternellement « instructeur »,
- un user qui rejoint une org en tant que `LEARNER` mais avait un vieux `InstructorProfile` continue à apparaître comme instructeur.

**Action :** dans `is_instructor`, ne plus regarder `hasattr` mais `InstructorProfile.objects.filter(user=self, is_active=True).exists()` si on ajoute un flag `is_active`. À court terme, garder le comportement actuel mais documenter le mélange OR.

### P1-6 — Onboarding middleware exempte `/api/`

`compte/middleware.py:50` exempte tous les chemins `/api/`. C'est correct pour les API d'auth, mais ça veut dire qu'un learner peut consommer l'intégralité de l'API REST sans avoir complété l'onboarding. Si le quiz d'onboarding est un **gate métier** (collecte profil/niveau pour la recommandation), ce trou doit être documenté.

**Action :** soit assumer (et documenter), soit ajouter une permission DRF `OnboardingCompleted` à appliquer sur les endpoints learner.

### P2-1 — URLs sans namespace

`best_epargne/urls.py` mélange :

- `path("dashboard/instructor/", ...)`, `path("dashboard/learner/", ...)`, `path("dashboard/business/", ...)`,
- `path("instructor/courses/<id>/edit/", ...)`,
- `path("organisation/", include("organizations.urls"))`.

Aucun `app_name` dans les `include`s. Conséquence : noms d'URL globaux, collisions potentielles, et impossibilité d'utiliser `{% url 'org:dashboard' %}` propre.

**Action :** déplacer toutes les routes instructor dans `formations/urls.py` (ou nouveau `formations/instructor_urls.py`), même chose pour learner. Ajouter `app_name = "instructor"` etc.

### P2-2 — Doubles définitions et imports croisés

- `_redirect_by_role` est défini dans `formations/Rolemixin.py:14` ET dans `formations/views.py:56` (`resolve_user_dashboard_url`) ET dans `compte/adapters.py:79` (`resolve_user_dashboard_url`). Trois implémentations légèrement différentes de la même logique.
- `organizations/views.py` importe `_redirect_by_role` depuis `formations.views` (couplage inverse : `organizations` ne devrait pas dépendre de `formations`).

**Action :** centraliser dans `compte.services` (ou `compte.access`) une seule fonction `resolve_default_workspace_url(user)`. Tout le reste l'utilise.

### P2-3 — Template `home/index.html` ne propose pas d'onglet par rôle

Si un user multi-rôles arrive à `/`, il voit la page publique. Logique pour un visiteur, mais pour un user connecté multi-rôles c'est manqué — il devrait voir un sélecteur d'espace ou être redirigé.

**Action :** dans `HomeView`, si `request.user.is_authenticated`, redirect vers `resolve_default_workspace_url(user)` (en respectant `active_workspace` si déjà choisi).

### P2-4 — Sidebar instructor : le bloc « Organisation » saute des cas

Dans `templates/partials/instructor_side.html`, le bloc « Admin organisation » s'affiche si `can_access_org_admin` est vrai. Mais :

- il n'affiche que **la première** org admin (cf. P1-1),
- pour un membre `MANAGER` (pas admin), rien n'apparaît alors qu'il pourrait avoir une page de gestion légère,
- pas de retour vers l'espace learner si l'instructor est aussi inscrit à des cours.

**Action :** remplacer ce bloc ad-hoc par un **switcher topbar** générique alimenté par un context processor `available_workspaces`.

### P2-5 — `InstructorBaseMixin.get_org_admin_membership` ne renvoie que 1 org

`formations/Rolemixin.py:191` : `.first()` renvoie une seule org, alors qu'un user peut être admin de plusieurs.

**Action :** changer la méthode pour retourner un queryset, et adapter le template pour itérer.

### P2-6 — `compte/views.py` est vide

3 lignes (`from django.shortcuts import render`). Pas un bug mais souligne qu'on n'a pas de vue dédiée pour les pages "compte" (profil, mes paramètres...). Si vous prévoyez une page "Mon profil" cross-espace, c'est ici qu'elle ira.

### P2-7 — Naming `company` vs `organization` mélangé

- Dans `Course` : `company` FK Organization + `company_only` flag.
- Dans `Order` (commerce) : `company` FK Organization.
- Partout ailleurs : `organization`.
- `OrganisationDashboard` (FR) vs `organizations` (EN) vs `business_dashboard` (autre EN).

**Action :** prendre une convention. Recommandation : tout renommer `organization` (cohérent avec le label Django, le nom de l'app, et la majorité du code). Migration zero-downtime classique : ajouter `organization = ForeignKey(...)`, copier les valeurs, switcher les usages, supprimer `company` dans une seconde release. À planifier indépendamment des correctifs urgents.

---

## 4. Implémentation cible — `ActiveWorkspace`

### 4.1 Module `compte.workspaces`

Nouveau fichier `compte/workspaces.py` qui centralise la notion d'espace actif :

```python
from dataclasses import dataclass
from typing import Optional, List
from organizations.models import OrganizationMembership

WORKSPACE_LEARNER = "learner"
WORKSPACE_INSTRUCTOR = "instructor"
WORKSPACE_ORG = "org"
WORKSPACE_PLATFORM_ADMIN = "platform_admin"

SESSION_KEY = "active_workspace"


@dataclass(frozen=True)
class Workspace:
    kind: str
    label: str
    url_name: str
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None

    def to_session(self):
        return {"kind": self.kind, "organization_id": self.organization_id}


def list_available_workspaces(user) -> List[Workspace]:
    """Liste, dans l'ordre de pertinence, les espaces accessibles à l'user."""
    if not user or not user.is_authenticated:
        return []

    spaces: List[Workspace] = []

    if getattr(user, "is_platform_admin", False):
        spaces.append(Workspace(
            kind=WORKSPACE_PLATFORM_ADMIN,
            label="Administration plateforme",
            url_name="platform_admin:dashboard",
        ))

    # Toutes les orgs actives (admin uniquement pour la version 1)
    admin_memberships = (
        user.organization_memberships
        .filter(
            is_active=True,
            organization__is_active=True,
            role__in=[
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
                OrganizationMembership.Role.MANAGER,
            ],
        )
        .select_related("organization")
        .order_by("organization__name")
    )
    for m in admin_memberships:
        spaces.append(Workspace(
            kind=WORKSPACE_ORG,
            label=m.organization.name,
            url_name="org:dashboard",
            organization_id=m.organization_id,
            organization_name=m.organization.name,
        ))

    if user.is_instructor:
        spaces.append(Workspace(
            kind=WORKSPACE_INSTRUCTOR,
            label="Espace formateur",
            url_name="instructor:dashboard",
        ))

    # Tout user authentifié = learner (nul besoin de InstructorProfile)
    spaces.append(Workspace(
        kind=WORKSPACE_LEARNER,
        label="Espace apprenant",
        url_name="learner:dashboard",
    ))

    return spaces


def get_active_workspace(request) -> Workspace:
    """Lit l'espace actif depuis la session, avec fallback sur le 1er disponible."""
    available = list_available_workspaces(request.user)
    if not available:
        return None

    sess = request.session.get(SESSION_KEY) or {}
    kind = sess.get("kind")
    org_id = sess.get("organization_id")

    for ws in available:
        if ws.kind == kind and ws.organization_id == org_id:
            return ws

    # session vide ou stale → 1er espace
    return available[0]


def set_active_workspace(request, kind: str, organization_id: Optional[int] = None):
    """Bascule vers un espace ; vérifie qu'il est accessible."""
    available = list_available_workspaces(request.user)
    for ws in available:
        if ws.kind == kind and ws.organization_id == organization_id:
            request.session[SESSION_KEY] = ws.to_session()
            return ws
    raise PermissionDenied("Espace non accessible.")
```

### 4.2 Context processor

`compte/context_processors.py` :

```python
from compte.workspaces import list_available_workspaces, get_active_workspace

def workspaces(request):
    if not getattr(request, "user", None) or not request.user.is_authenticated:
        return {}
    return {
        "available_workspaces": list_available_workspaces(request.user),
        "active_workspace": get_active_workspace(request),
    }
```

À ajouter dans `TEMPLATES[0]["OPTIONS"]["context_processors"]`.

### 4.3 Vue de switch + URL

```python
# compte/views.py
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect
from django.urls import reverse
from compte.workspaces import set_active_workspace

@login_required
def switch_workspace(request):
    kind = request.POST.get("kind") or request.GET.get("kind")
    org_id = request.POST.get("organization_id") or request.GET.get("organization_id")
    org_id = int(org_id) if org_id else None
    ws = set_active_workspace(request, kind, org_id)
    if ws.kind == "org":
        return redirect("org:dashboard", organization_id=ws.organization_id)
    return redirect(ws.url_name)
```

### 4.4 Topbar switcher (template partial)

`templates/partials/workspace_switcher.html` rendu dans la topbar des trois layouts.

### 4.5 Adapter allauth — fallback sur `active_workspace`

`compte/adapters.py:get_login_redirect_url` consulte d'abord `request.session["active_workspace"]` ; si présent et toujours valide, redirige là. Sinon, applique la priorité actuelle.

### 4.6 Mixins template — `WorkspaceRequiredMixin`

Nouveau mixin qui vérifie qu'on est bien dans le bon `active_workspace`, et qui force le switch sinon. Évite l'écran « instructor » pour quelqu'un en mode `learner`.

```python
class WorkspaceRequiredMixin:
    required_workspace_kind = None  # "instructor" | "learner" | "org" | "platform_admin"

    def dispatch(self, request, *args, **kwargs):
        ws = get_active_workspace(request)
        if ws is None or ws.kind != self.required_workspace_kind:
            # bascule auto si l'espace est disponible
            available = list_available_workspaces(request.user)
            for w in available:
                if w.kind == self.required_workspace_kind:
                    request.session[SESSION_KEY] = w.to_session()
                    return super().dispatch(request, *args, **kwargs)
            return self.handle_no_permission()
        return super().dispatch(request, *args, **kwargs)
```

Les vues instructor utilisent `InstructorBaseMixin` qui hérite de `WorkspaceRequiredMixin(required_workspace_kind="instructor")`. Les vues learner pareil.

---

## 5. Plan d'attaque proposé (vagues)

Pour ne pas vous livrer un mégapatch fragile, je propose 5 vagues. Chaque vague est commitable indépendamment.

### Vague 1 — Bugs bloquants (P0)

1. **P0-1** : retirer la mauvaise `OrganisationDashboard` de `formations/views.py` ; faire pointer `business_dashboard` vers une vue qui redirige vers `organizations:dashboard` avec la bonne org (ou un sélecteur si plusieurs).
2. **P0-2** : `formations/Rolemixin.py` — remplacer `organization` par `company` (ou ajouter `organization` comme alias dans Course, mais c'est plus invasif).
3. **P0-3** : `compte/services.py` — supprimer l'import `User` faux.
4. **P0-4** : décision migration `MediaAsset.organization`. Soit on l'ajoute (recommandé, schéma clair), soit on tolère le sharing partiel (par owner uniquement). Si ajout, migration + backfill.

Risque : 0 (corrections directes), à condition de faire un `manage.py check` après. **Estimation : 1-2 commits.**

### Vague 2 — Fondations multi-rôles

1. Créer `compte/workspaces.py` (cf. §4).
2. Créer `compte/context_processors.py` + l'enregistrer.
3. Centraliser `resolve_default_workspace_url` dans `compte/services.py` ; supprimer les doublons.
4. Mettre à jour `AccountAdapter.get_login_redirect_url` pour utiliser `active_workspace` quand présent.
5. Vue + URL `switch_workspace`.
6. Template `partials/workspace_switcher.html`.

Pas encore de refactor des vues, juste l'infrastructure. **Estimation : 1 PR.**

### Vague 3 — Sidebars + topbar unifiées

1. Une seule topbar partagée qui inclut le switcher.
2. Sidebar par espace, sélection via `active_workspace.kind` (plus via URL).
3. Suppression des sidebars dupliquées.

Aucun changement de logique métier, uniquement template. **Estimation : 1 PR.**

### Vague 4 — Filtrage queryset cohérent

1. Service `formations.services.get_instructor_courses_qs(user, organizations=None)`, utilisé partout.
2. Service `catalog.services.get_visible_media_qs(user, current_org=None)` (après ajout `MediaAsset.organization`).
3. `CourseViewSet.my_courses` consomme le service.
4. `InstructorMediaListView` consomme le service.
5. Permissions object level pour modif/suppression : auteur OR org admin de current_org.

**Estimation : 1 PR avec tests unitaires.**

### Vague 5 — URL namespaces + nettoyage

1. `formations/instructor_urls.py` (`app_name = "instructor"`) regroupant les routes `/instructor/*`.
2. `formations/learner_urls.py` (`app_name = "learner"`).
3. `organizations/urls.py` → `app_name = "org"`.
4. Tous les `{% url %}` dans les templates basculent sur `instructor:foo`, `learner:foo`, `org:foo`.
5. Renommage progressif `company` → `organization` dans `Course` (planifiée séparément, hors de cette série).

**Estimation : 1 PR avec rebrand templates.**

---

## 6. Recommandations production-ready

### Mixins (template)

- Garder `RoleRequiredMixin` mais ajouter `allow_org_member` et `allow_org_instructor`.
- Ajouter `WorkspaceRequiredMixin(required_workspace_kind=...)` (cf. §4.6).
- Ajouter `OrgScopedQuerysetMixin` qui expose `self.current_organization` quand `active_workspace.kind == "org"`.
- Ne **jamais** réimplémenter la logique de scope dans une vue : déléguer au service.

### Permissions DRF

- Garder `PermissionUtils` + classes existantes (excellente base).
- Ajouter `IsOrgMember` (scope: organisation requise par URL ou par `?organization_id=`).
- Ajouter `IsAuthorOrOrgAdmin(BasePermission)` qui combine `IsOwnerOrReadOnly` et `IsOrganizationAdminForObject` — c'est la règle de modif que vous avez choisie pour les médias et cours.
- Préférer `permission_classes` au niveau ViewSet, et override `get_queryset` pour le scoping par rôle/org. Pas de double filtrage permission + queryset.

### Serializers

- Ajouter un champ `scope` calculé sur `MediaAssetListSerializer` : `"personal"` si `obj.owner_id == request.user.id`, `"organization"` sinon. Pareil pour `CourseSerializer`. Ça permet à l'UI de teinter la carte différemment.
- Ajouter `can_edit` / `can_delete` calculés (sur les détails seulement, pas sur la liste). Cohérent avec ce que `_serialize_course_card` fait déjà côté template.

### Vues

- Briser `best_epargne/apis/views.py` (3000+ lignes) en `views/instructor.py`, `views/learner.py`, `views/media.py`, `views/public.py` (déjà identifié dans `AUDIT_REPORT.md`).
- Pareil pour `formations/views.py`. Une vue par fichier au-delà de ~80 lignes.

### Templates

- Trois `*_base.html` (`instructor_base`, `learner_base`, `org_base`) + un `_topbar.html` partagé qui contient le switcher.
- Sidebars par espace, mais leur état actif vient de `active_workspace` + `request.resolver_match.url_name`.
- Variable `body_class` dans le base template pour permettre des nuances par espace (couleurs accent).

### Sidebars

- Un fichier par sidebar.
- Pas de logique de droits dans les sidebars : on fait confiance au context processor `available_workspaces`. Si l'item ne devrait pas être affiché, il n'apparaît pas dans `available_workspaces`.

### Routes / URLs

- `app_name` partout.
- Préfixes cohérents : `/learner/`, `/instructor/`, `/org/<organization_id>/`, `/platform-admin/`.
- Plus de `tab=...` dans les query-params pour des sous-onglets : préférer des sous-routes (ex. `/instructor/dashboard/reviews/`) qui sont navigables, bookmarkables et active-state-friendly.

### Sécurité

- Tous les endpoints API : `permission_classes` explicite (rappel du défaut `IsAuthenticated` configuré).
- Object-level permissions sur DELETE/PATCH : ne jamais se fier au queryset seul.
- Logger en `WARNING` toute tentative de cross-org access (un user qui tape un `organization_id` qu'il ne peut pas voir → log).
- Throttle plus dur pour les endpoints multipart upload (déjà partiellement en place).
- Sur le switcher : POST-only avec CSRF (pas GET, sinon CSRF-by-link).

### UX

- Toujours afficher l'espace actif en haut de la sidebar (pastille colorée + nom de l'org si applicable).
- Switcher en topbar : dropdown clair listant tous les espaces, avec sélectionné en gras.
- Préserver `?next=` après switch quand c'est sensé.
- Si un user clique sur un lien d'un autre espace, **ne pas faire un 403** : faire le switch automatique (le `WorkspaceRequiredMixin` gère ça).
- Bouton « Nouveau cours » dans la sidebar instructor : si l'user n'a pas encore d'`InstructorProfile`, proposer une mini-page d'onboarding « Devenir formateur » avant.

---

## 7. Questions ouvertes à trancher avant Vague 4

1. **Décision sur `MediaAsset.organization`** : ajout du champ ou pas ? (recommandation : oui, sinon impossible de tenir votre règle « membres d'org voient les médias des autres membres »).
2. **Scope du partage `Course` org** : est-ce que tout cours créé par un user `INSTRUCTOR` d'une org se rattache automatiquement à l'org (`company=org`), ou est-ce un choix à la création ? Aujourd'hui c'est manuel, donc dans la pratique presque aucun cours n'est rattaché.
3. **Manager d'org** : a-t-il accès au dashboard org ? Aujourd'hui oui (via `OrganizationScopedMixin`). Mais peut-il créer des cours/médias ? À clarifier dans la matrice §2.2.
4. **Convention de nommage `company` → `organization`** : on ouvre ça en parallèle ou on attend la fin des vagues 1-5 ?

---

## 8. Annexes

### A. Fichiers les plus impactés (par vague)

| Vague | Fichiers principaux | Lignes touchées (estim.) |
|---|---|---|
| 1 | `formations/views.py`, `formations/Rolemixin.py`, `compte/services.py`, `catalog/models.py`, `catalog/migrations/` | ~150 |
| 2 | `compte/workspaces.py` (nouveau), `compte/context_processors.py` (nouveau), `compte/adapters.py`, `compte/views.py`, `compte/urls.py`, `best_epargne/settings/base.py`, `best_epargne/urls.py` | ~250 |
| 3 | `templates/layout/*`, `templates/partials/*` | ~600 |
| 4 | `formations/services.py` (nouveau), `catalog/services.py` (nouveau), `best_epargne/apis/views.py`, `formations/views.py` | ~400 |
| 5 | `*/urls.py`, tous les templates pour rebrand `{% url %}` | ~500 |

### B. Points qui ne sont **pas** des bugs (souvent suspectés à tort)

- `LearnerRequiredMixin(allow_platform_admin=True)` : platform admin doit pouvoir tout voir, c'est attendu.
- `is_org_admin` propriété sur User qui ne prend pas d'org en argument : c'est un « est admin de **n'importe quelle** org », et c'est suffisant pour la sidebar — la vérif fine se fait dans `OrganizationScopedMixin.test_func`.
- `AccountAdapter` qui privilégie l'admin org sur l'instructor : c'est un défaut **par priorité**, l'utilisateur peut toujours basculer ensuite (une fois qu'on aura le switcher).

---

Fin du rapport.
