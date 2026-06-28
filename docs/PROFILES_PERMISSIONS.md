# Profils utilisateurs & permissions Best Épargne

> Phase 3 de la refonte. Documentation des rôles, permissions, page profil
> et redirections post-login.

---

## Les 6 rôles

| Rôle | Source | Vérification |
|---|---|---|
| **Public** (anonyme) | Pas authentifié | `request.user.is_authenticated == False` |
| **Apprenant** | Tout utilisateur authentifié actif | `user.is_authenticated and user.is_active` |
| **Formateur** | A un `InstructorProfile` OU rôle `INSTRUCTOR` dans une org | `user.is_instructor` |
| **Admin organisation** | Membre `OWNER`/`ADMIN` actif d'une org | `user.is_org_admin` |
| **Admin plateforme** | `is_superuser` OU `platform_role = PLATFORM_ADMIN` | `is_platform_admin(user)` |
| **Staff Django** | `is_staff = True` (accès `/admin/`) | `user.has_django_admin_access` |

Un utilisateur peut cumuler plusieurs rôles (ex: instructor + admin
plateforme). Les badges sont affichés sur la page profil pour clarté.

---

## Décorateurs de protection

Tous dans `core/decorators.py`.

| Décorateur | Garde | Bypass admin |
|---|---|---|
| `@platform_admin_required` | Admin plateforme strict | — |
| `@platform_admin_otp_required` | Idem + OTP vérifié | — |
| `@org_admin_required` | OWNER/ADMIN ≥ 1 org active | ✓ |
| `@org_admin_required_for_id("organization_id")` | Idem scoped sur URL param | ✓ |
| `@org_role_required("OWNER", "ADMIN", "MANAGER")` | Factory paramétrable | ✓ |
| `@instructor_required` | A `is_instructor=True` | ✓ |
| `@learner_required` | Tout user actif | — |

Comportement commun :
- Anonyme → redirect vers `account_login` avec `?next=<path>`
- Refusé → `PermissionDenied` (403) + log WARNING
- Admin plateforme → passe toujours (bypass) sauf cas où c'est explicite

Exemples :

```python
from core.decorators import instructor_required, org_role_required

@instructor_required
def my_instructor_view(request):
    ...

@org_role_required("OWNER", "ADMIN")
def org_admin_settings(request):
    ...

# Class-based view
@method_decorator(platform_admin_otp_required, name="dispatch")
class PlatformAdminDashboard(TemplateView):
    ...
```

---

## Helpers de permissions

Tous dans `core/permissions.py`.

| Helper | Signature | Usage |
|---|---|---|
| `is_platform_admin(user)` | `→ bool` | Source de vérité admin plateforme |
| `has_org_role(user, *, organization_id, roles)` | `→ bool` | Test rôle org spécifique |
| `user_organization_ids(user, *, roles=None)` | `→ list[int]` | Liste orgs accessibles |
| `can_view_course(user, course)` | `→ bool` | published + (non company_only OU membership) |
| `can_edit_course(user, course)` | `→ bool` | Auteur OU OWNER/ADMIN/MANAGER de Course.company |
| `can_manage_org(user, organization)` | `→ bool` | OWNER/ADMIN actif de l'org |
| `can_invite_to_org(user, organization)` | `→ bool` | OWNER/ADMIN/MANAGER |
| `can_view_org_content(user, organization)` | `→ bool` | Tout membership actif |
| `can_access_media(user, asset)` | `→ bool` | Owner ou membership org |
| `can_modify_media(user, asset)` | `→ bool` | Owner ou OWNER/ADMIN/MANAGER |
| `can_view_enrollment(user, enrollment)` | `→ bool` | User propriétaire ou admin |
| `can_modify_progress(user, lesson_progress)` | `→ bool` | User propriétaire |

---

## Modèle `User` — champs profil

```python
email                # PK + identifiant login
phone                # téléphone
full_name            # nom complet (peut être vide)
avatar               # P3.1 : ImageField upload_to=avatars/ (5 Mo max)
platform_role        # USER | PLATFORM_ADMIN
is_active            # désactive le compte sans le supprimer
is_staff             # accès /admin/ Django (support technique)
created_at / updated_at

# Properties / cached_properties
display_name             # full_name OR email
is_platform_admin        # is_superuser OR platform_role==PLATFORM_ADMIN
has_django_admin_access  # is_platform_admin OR is_staff
active_memberships       # queryset organization_memberships filtrés
is_org_owner / is_org_admin / is_org_instructor / is_org_learner
is_instructor            # has InstructorProfile OR is_org_instructor
is_learner               # has LearnerProfile OR is_org_learner
```

---

## Modèle `UserPreferences` (P3.1)

OneToOne avec User. Créé auto via signal `post_save` à l'inscription.

```python
theme                          # system | light | dark
language                       # fr | en
notifications_email            # bool (défaut True)
notifications_marketing        # bool (défaut False)
notifications_course_reminders # bool (défaut True)
public_profile                 # bool (défaut False)
```

Helper safe pour comptes legacy :
```python
prefs = UserPreferences.get_or_create_for(user)
```

---

## Redirections post-login

Source : `compte/adapters.py:resolve_user_dashboard_url(user)`.

Ordre de priorité :
1. **Org admin/manager** (OWNER/ADMIN/MANAGER) → `business_dashboard`
   (ou `org:dashboard` si une seule org)
2. **Admin plateforme** → `admin_dashboard` (PAS `/admin/` Django)
3. **Formateur** (`is_instructor`) → `instructor:dashboard`
4. **Staff Django pur** → `admin:index`
5. **Apprenant** (par défaut) → `learner:dashboard`

Le paramètre `?next=` est honoré s'il est relativé et valide
(`url_has_allowed_host_and_scheme`).

L'`active_workspace` est persisté en session pour que le bon sidebar
soit affiché.

---

## Page profil unifiée (P3.4)

**URL** : `/account/profile/?tab=<section>`
**Template** : `templates/compte/profile.html`
**Vue** : `compte.views.UserProfileView`
**JS** : `static/src/js/profile-tabs.js`

### 4 onglets

| Onglet | URL | Form | Action |
|---|---|---|---|
| **Informations** | `?tab=info` | `UserProfileForm` | full_name, phone, email |
| **Photo** | `?tab=avatar` | `AvatarUploadForm` | Upload/supprimer avatar |
| **Préférences** | `?tab=preferences` | `UserPreferencesForm` | Theme, lang, notifs |
| **Sécurité** | `?tab=security` | (liens) | → password + 2FA setup |

### Dispatch POST

Le POST contient un champ caché `form_section` qui dispatche vers le
handler approprié :

```python
class UserProfileView(LoginRequiredMixin, UpdateView):
    def post(self, request, *args, **kwargs):
        section = self._section()  # info | avatar | preferences
        if section == "avatar":
            return self._post_avatar(request)
        if section == "preferences":
            return self._post_preferences(request)
        return self._post_info(request)
```

Après chaque submit : redirect vers `?tab=<section>` pour préserver
l'onglet actif (PRG pattern).

### Validations Avatar

`AvatarUploadForm.clean_avatar()` :
- Taille ≤ 5 Mo
- Content-type ∈ {JPEG, PNG, WebP} (refuse SVG = XSS vector)
- Dimensions ≤ 4000×4000 px (anti pixel bomb)
- Vérification Pillow que c'est bien une image valide

---

## Sécurité

### Page profil

- `LoginRequiredMixin` : redirige anonymous vers login
- CSRF token sur tous les forms
- Avatar : validation stricte taille/format/dimensions (Pillow)
- Mot de passe : délégué à allauth (`/account/password/change/`)
- 2FA : django-two-factor-auth (`/account/two-factor/setup/`)

### Audit

Tous les décorateurs de protection loggent en WARNING :

```python
logger.warning(
    "decorator.instructor_required.denied",
    extra={"user_id": user.id, "path": request.path},
)
```

Avec `RequestIdMiddleware` (V_OBS.B), chaque log est corrélé à un
`request_id` unique pour tracer les tentatives.

### RGPD

- Préférences `notifications_marketing` opt-in par défaut (False)
- Suppression de compte : par demande au support (archive cours, préserve
  inscriptions des apprenants)
- Avatar : stocké dans MEDIA_ROOT, supprimable via UI

---

## Tests

Tests Phase 3 dans `tests/test_p3_profiles_permissions.py` (20 tests) :

```bash
pytest tests/test_p3_profiles_permissions.py -v
```

Couvre :
- Création auto UserPreferences via signal
- `get_or_create_for` (rattrapage legacy)
- Les 4 nouveaux décorateurs (allow / deny / anon / inactif / admin bypass)
- Smoke test `@platform_admin_required`
- Champ avatar optionnel

---

## Migration progressive

Plan de migration pour les pages existantes vers le design system Phase 2 :

1. ✓ Profil utilisateur (P3.4) — fait
2. Pages auth (login, signup, password reset)
3. Dashboards apprenant
4. Dashboards formateur
5. Dashboards organisation
6. Admin plateforme

À chaque page : remplacer les classes ad-hoc par les classes `.be-*` du
design system + utiliser les partials `partials/ds/*.html`.
