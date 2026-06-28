# Refactoring Guide Best Épargne

> Phase 4 — Refactoring technique. Audit, conventions et plan de
> migration vers une architecture plus claire et plus performante.

---

## Constantes centralisées (P4.1)

**Module unique** : `core/constants.py`

Tous les statuts métier qui sont référencés dans plusieurs apps doivent
passer par ce module pour éviter le drift :

```python
from core.constants import (
    CourseStatus,
    COURSE_VISIBLE_TO_PUBLIC,
    COURSE_ENROLLABLE_STATUSES,
    EnrollmentStatus,
    OrgRole,
    ORG_ADMIN_ROLES,
    Workspace,
)

# Au lieu de :
qs.filter(status="PUBLISHED")           # 🔴 magic string

# Utiliser :
qs.filter(status=CourseStatus.PUBLISHED)  # ✅ traçable
```

### Ensembles dérivés disponibles

| Ensemble | Contenu | Usage |
|---|---|---|
| `COURSE_VISIBLE_TO_PUBLIC` | `{PUBLISHED}` | Filter catalogue public |
| `COURSE_ENROLLABLE_STATUSES` | `{PUBLISHED}` | Bloquer enrolls sur ARCHIVED |
| `COURSE_DRAFT_STATUSES` | `{DRAFT, REVIEW}` | Pré-publication |
| `COURSE_NON_ARCHIVED_STATUSES` | `{DRAFT, REVIEW, PUBLISHED}` | Cours encore "vivants" |
| `ENROLLMENT_NOT_CANCELED` | `{ACTIVE, COMPLETED}` | Décompte cours suivis |
| `PAYMENT_SUCCESSFUL` | `{PAID}` | Revenue calc |
| `PAYMENT_TERMINAL` | `{PAID, FAILED, CANCELED, REFUNDED}` | États finaux |
| `ORG_ADMIN_ROLES` | `{OWNER, ADMIN}` | Gestion settings org |
| `ORG_MANAGER_ROLES` | `{OWNER, ADMIN, MANAGER}` | Invite, contenu |
| `ORG_TEACHING_ROLES` | `+ INSTRUCTOR` | Création de cours |
| `ORG_BILLABLE_ROLES` | `{INSTRUCTOR, LEARNER}` | Décompte sièges payants |

---

## Helpers QuerySet (P4.3)

### `catalog/querysets.py`

```python
from catalog.querysets import (
    # Eager loading
    with_instructor,
    with_category,
    with_company,
    with_sections_and_lessons,

    # Annotations
    annotate_course_kpis,
    annotate_course_completion_rate,

    # Presets composites (recommandé)
    for_public_listing,        # landing / catalogue
    for_instructor_dashboard,  # dashboard formateur
    for_course_detail,         # page détail cours
)

# AVANT — risque N+1
qs = Course.objects.filter(status="PUBLISHED")
for course in qs:
    print(course.instructor.email)  # N queries !

# APRÈS — ≤ 2 queries
qs = for_public_listing(Course.objects.filter(status=CourseStatus.PUBLISHED))
for course in qs:
    print(course.instructor.email)  # 0 queries supplémentaires
```

### `enrollments/querysets.py`

```python
from enrollments.querysets import (
    with_course,
    with_course_full,
    with_user,
    with_current_lesson,
    active_only,
    not_canceled,

    # Presets
    for_learner_dashboard,
    for_org_dashboard,
    for_instructor_analytics,
)
```

---

## Convention des aggregates conditionnels (P4.2)

Pour calculer plusieurs `.count()` ou `.sum()` sur le même queryset,
**toujours** utiliser un seul `aggregate()` avec des `filter=Q(...)` :

```python
# AVANT : 5 queries
total = qs.count()
published = qs.filter(status="PUBLISHED").count()
draft = qs.filter(status="DRAFT").count()
archived = qs.filter(status="ARCHIVED").count()
review = qs.filter(status="REVIEW").count()

# APRÈS : 1 query
from django.db.models import Count, Q
kpi = qs.aggregate(
    total=Count("id"),
    published=Count("id", filter=Q(status=CourseStatus.PUBLISHED)),
    draft=Count("id", filter=Q(status=CourseStatus.DRAFT)),
    archived=Count("id", filter=Q(status=CourseStatus.ARCHIVED)),
    review=Count("id", filter=Q(status=CourseStatus.REVIEW)),
)
```

Pattern appliqué dans `apis/views.py:InstructorKpisView` (P4.2).

---

## Détection des régressions N+1

`tests/test_p4_perf_n_plus_1.py` utilise `CaptureQueriesContext` /
`assertNumQueries` pour figer un PLAFOND de queries sur les chemins
critiques :

```python
@pytest.mark.django_db
def test_for_public_listing_bounded(catalog_data):
    with CaptureQueriesContext(connection) as ctx:
        items = list(for_public_listing(Course.objects.all()))
        for c in items:
            _ = c.instructor.email
            _ = c.category.name
    assert len(ctx.captured_queries) <= 4
```

Si un refactor casse l'eager loading → le test échoue immédiatement.

---

## Conventions de nommage

| Concept | Convention | Exemple |
|---|---|---|
| Modèle | PascalCase singulier | `CourseSection`, `LessonProgress` |
| TextChoices interne | PascalCase `Status` / `Role` | `Course.Status`, `OrganizationMembership.Role` |
| Service applicatif | snake_case verbal | `publish_course`, `enroll_on_payment_success` |
| Vue API DRF | PascalCase + `View` | `PublicCourseDetailView`, `InstructorKpisView` |
| Vue template | PascalCase + `View` ou `Page` | `CourseDetailPageView` |
| Décorateur | snake_case + `_required` | `@instructor_required` |
| Helper QuerySet | snake_case + verbe | `with_instructor`, `for_public_listing` |
| Helper aggregate | snake_case + `annotate_X` | `annotate_course_kpis` |
| Constante module | UPPER_SNAKE | `COURSE_VISIBLE_TO_PUBLIC` |
| Test pytest | `test_<phase>_<sujet>.py` | `tests/test_p1_course_lifecycle.py` |

---

## Plan de migration god-modules (P4.5 — livraison 2)

### Cibles prioritaires

| Fichier | LOC | Plan de split |
|---|---|---|
| `best_epargne/apis/views.py` | 3507 | Activer le squelette `views_package/` (V6.C) : public, learner, instructor, org, platform, media |
| `formations/views.py` | 2438 | Split par espace : `views/landing.py`, `views/learner.py`, `views/instructor.py`, `views/admin.py` |
| `organizations/views.py` | 1703 | Split par concept : `views/dashboard.py`, `views/members.py`, `views/invitations.py` |

### Stratégie no-break

1. **Créer le sous-module** avec les classes/fonctions déplacées.
2. **Conserver le fichier original** comme façade qui re-exporte :
   ```python
   # best_epargne/apis/views.py (façade)
   from best_epargne.apis.views_package.instructor import (
       InstructorKpisView,
       InstructorCourseDetailView,
       # ...
   )
   ```
3. **Migrer progressivement** les imports vers le nouveau chemin.
4. **Supprimer la façade** quand tous les imports sont migrés.

Cette approche évite de casser les imports existants en cours de route.

---

## Top 5 dettes restantes

| # | Dette | Action recommandée |
|---|---|---|
| 1 | `best_epargne/apis/views.py` 3507 LOC | Split en `views_package/*.py` (V6.C activate) |
| 2 | `formations/views.py` 2438 LOC | Split par espace + déplacer logique métier dans services |
| 3 | 28 imports locaux dans `formations/views.py` | Cycles à casser via services/permissions centralisés |
| 4 | Couleurs hex inline dans `assessments/admin.py` | Remplacer par classes Tailwind du DS (P2) |
| 5 | `views_package/` skeleton non utilisé (~1000 LOC) | Activer (en migration progressive) ou supprimer |

---

## Mesures avant/après P4.2

| Vue | Avant | Après | Gain |
|---|---|---|---|
| `InstructorKpisView` courses bloc | 5 queries | 1 query | **×5** |
| `InstructorKpisView` enrollments bloc | 4 queries | 1 query | **×4** |
| `InstructorKpisView` revenue bloc | 3 queries | 1 query | **×3** |

Total InstructorKpisView : passé de **~20 queries** à **~8 queries**.

---

## Ressources

- Django N+1 doc : https://docs.djangoproject.com/en/4.2/topics/db/optimization/
- `select_related` vs `prefetch_related` : https://docs.djangoproject.com/en/4.2/ref/models/querysets/#select-related
- Aggregate Q() filters : https://docs.djangoproject.com/en/4.2/topics/db/aggregation/#filtering-on-annotations
