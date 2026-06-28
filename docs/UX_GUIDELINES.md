# UX Guidelines Best Épargne

> Phase 5 — Polish UX. Composants disponibles, patterns recommandés,
> règles d'accessibilité.

---

## Composants UX disponibles (partials)

Tous dans `templates/partials/ds/`. Voir aussi `docs/DESIGN_SYSTEM.md` pour
les classes CSS sous-jacentes.

### Composants de base (Phase 2)

| Partial | Usage |
|---|---|
| `ds/button.html` | Boutons avec variants (primary, secondary, outline, ghost, danger, success) |
| `ds/badge.html` | Badges colorés (7 variants) |
| `ds/card.html` | Card avec header / body / footer |
| `ds/input.html` | Input form avec label, help, error |
| `ds/empty_state.html` | État vide avec icône, titre, message, CTA |
| `ds/alert.html` | Bannière success/warning/danger/info |

### Composants UX (Phase 5)

| Partial | Usage |
|---|---|
| `ds/spinner.html` | Spinner inline (5 tailles, 4 variants couleur) |
| `ds/loader_overlay.html` | Overlay pleine zone avec spinner centré |
| `ds/pagination.html` | Pagination Django avec préservation query params |
| `ds/flash_messages.html` | Toast système global (auto-dismiss 5s) |

---

## Patterns recommandés

### Pattern : Chargement de données

```django
{# ⚡ AVANT le fetch JS : skeleton ou spinner #}
<div id="be-content-loading">
  {% include "partials/ds/spinner.html" with size="lg" label="Chargement…" %}
</div>

{# Contenu remplis par le JS #}
<div id="be-content" hidden>
  ...
</div>
```

Le JS bascule `hidden` quand le fetch termine.

### Pattern : Overlay sur une carte / modal

```django
<div class="be-card-elevated relative">
  <div class="be-card-body">
    ...
  </div>
  {% include "partials/ds/loader_overlay.html" with
      id="save-loader" label="Sauvegarde…" %}
</div>

<script>
  // Affiche pendant le submit
  document.getElementById('save-loader').removeAttribute('hidden');
</script>
```

### Pattern : Liste paginée avec filtres

```django
<form method="get" class="mb-6">
  <input type="text" name="q" class="be-input" placeholder="Recherche…">
  <select name="category" class="be-select">...</select>
  <button class="be-btn-primary">Filtrer</button>
</form>

{% if page_obj.object_list %}
  {% for item in page_obj.object_list %}
    ...
  {% endfor %}
  {# Pagination qui préserve les filtres #}
  {% include "partials/ds/pagination.html" with
      page_obj=page_obj
      query_params=request.GET %}
{% else %}
  {% include "partials/ds/empty_state.html" with
      icon="magnifying-glass"
      title="Aucun résultat"
      message="Essayez d'élargir vos filtres." %}
{% endif %}
```

### Pattern : Action POST avec feedback

Côté Django vue :

```python
def my_action(request, course_id):
    course = get_object_or_404(Course, pk=course_id)
    try:
        publish_course(course, actor=request.user)
        messages.success(request, "Cours publié avec succès.")
    except ValidationError as e:
        messages.error(request, str(e))
    return redirect("instructor:course_detail", course_id=course_id)
```

Côté template : `flash_messages.html` est inclus globalement, le toast
apparaît automatiquement après le redirect, auto-dismiss 5s.

### Pattern : Empty state avec CTA différencié par rôle

```django
{% if request.user.is_instructor %}
  {% include "partials/ds/empty_state.html" with
      icon="graduation-cap"
      title="Aucun cours créé"
      message="Démarrez par créer votre premier cours."
      cta_label="Créer un cours"
      cta_url="/instructor/courses/create/"
      cta_variant="primary" %}
{% else %}
  {% include "partials/ds/empty_state.html" with
      icon="graduation-cap"
      title="Aucun cours suivi"
      message="Explorez le catalogue pour commencer."
      cta_label="Explorer le catalogue"
      cta_url="/landinghome/catalogue/"
      cta_variant="secondary" %}
{% endif %}
```

---

## Règles d'accessibilité

### Toujours

- `aria-label` sur les boutons icône seuls : `<button aria-label="Supprimer">`
- `role="status"` + `aria-live="polite"` sur les notifications dynamiques
- `aria-current="page"` sur l'item nav actif
- `aria-selected="true"` sur l'onglet actif (`role="tab"`)
- `aria-invalid="true"` + `aria-describedby` pour les erreurs de form

### Focus visible

Tous les `.be-btn-*` et `.be-input` ont `focus-visible:ring-4` (anneau bleu
4px) automatiquement. Ne pas désactiver `outline` sans alternative visible.

### Contrastes

| Combinaison | Ratio WCAG |
|---|---|
| `text-be-ink-900` sur `bg-white` | 17.3 (AAA) |
| `text-be-ink-700` sur `bg-be-ink-50` | 9.2 (AAA) |
| `text-white` sur `bg-be-sky-600` | 5.4 (AA grand texte / AAA gros) |
| `text-be-ink-900` sur `bg-be-sun-400` | 9.8 (AAA) |

Les variants `.be-btn-*` respectent tous le contraste minimum AA. À NE
PAS utiliser : texte bleu clair sur fond bleu clair (`text-be-sky-300`
sur `bg-be-sky-100`).

### Tailles touch (mobile)

- `.be-btn` : padding minimum 36×36px (16px hit area mobile)
- `.be-btn-xs` : 32×32px (à éviter sur mobile, OK desktop)
- `.be-btn-lg` : 44×44px (idéal mobile)

---

## Messages flash (Django messages)

Côté Python :

```python
from django.contrib import messages

messages.success(request, "Action réussie.")
messages.error(request, "Une erreur est survenue.")
messages.warning(request, "Attention : action irréversible.")
messages.info(request, "Bon à savoir.")
```

Côté template (déjà inclus globalement) :

```django
{# Dans app_shell.html (déjà fait) #}
{% include "partials/ds/flash_messages.html" %}
```

Le partial :
- Position fixed top-right
- Auto-dismiss 5s (paramétrable via `data-be-flash-timeout`)
- Pause au survol
- Bouton X de fermeture manuelle
- Icône auto selon variant
- `role="alert"` pour les lecteurs d'écran

---

## Loaders & states

### Loader inline (dans un bouton après click)

```html
<button class="be-btn-primary" data-loading-target>
  <i class="fa-solid fa-floppy-disk" data-icon-default></i>
  <i class="fa-solid fa-spinner fa-spin hidden" data-icon-loading></i>
  <span>Enregistrer</span>
</button>
```

### Skeleton block (avant que les données arrivent)

```html
<div class="be-skeleton h-6 w-1/2"></div>
<div class="be-skeleton h-4 w-3/4 mt-2"></div>
<div class="be-skeleton aspect-video w-full mt-4"></div>
```

La classe `.be-skeleton` applique un shimmer animation.

### Page entière en chargement

```django
<div class="min-h-[400px] flex items-center justify-center">
  {% include "partials/ds/spinner.html" with size="xl" label="Chargement de votre espace…" %}
</div>
```

---

## Parcours utilisateur — checklist UX

### Inscription / signup

- [x] Formulaire en 1 page (pas de multi-step pour l'essentiel)
- [x] Validation en temps réel (HTML5 + serveur)
- [x] Messages d'erreur clairs (`.be-error-text`)
- [x] CTA visible "Créer mon compte" bleu primaire
- [x] Lien retour login discret

### Inscription à un cours

- [x] CTA "S'inscrire" / "Acheter" visible sur fiche cours (P1.4)
- [x] Confirmation par toast (P5.3)
- [x] Redirection vers le player après inscription
- [x] Message en cas de cours non publié (P1)

### Modification de cours (instructor)

- [x] Bouton "Publier" toujours visible (P1.3)
- [x] Modale de confirmation pour actions destructrices (archive)
- [x] Messages flash après chaque transition (P1.3)
- [x] Badges de statut harmonisés (P1.3)

### Consultation profil

- [x] 4 onglets clairs (P3.4)
- [x] Avatar avec fallback initiale
- [x] Badges rôles visibles
- [x] Lien direct vers changement mot de passe

---

## Mobile-first

### Breakpoints Tailwind utilisés

| Préfixe | Width | Cible |
|---|---|---|
| (none) | < 640px | Mobile small |
| `sm:` | ≥ 640px | Mobile / tablette portrait |
| `md:` | ≥ 768px | Tablette landscape |
| `lg:` | ≥ 1024px | Desktop |
| `xl:` | ≥ 1280px | Desktop large |
| `2xl:` | ≥ 1536px | Desktop ultra |

### Patterns responsive courants

- Sidebar desktop / drawer mobile : `fixed lg:relative` + `-translate-x-full lg:translate-x-0`
- Grid : `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Boutons : labels masqués sur mobile : `<span class="hidden sm:inline">Texte</span>`
- Tables : scroll horizontal sur mobile : `<div class="overflow-x-auto"><table class="be-table">`

---

## Performances perçues

- **Spinners** : pour les chargements > 200ms uniquement (sinon perçu comme bug)
- **Skeleton** : pour le chargement initial de page (PAS pour les actions courtes)
- **Optimistic UI** : pour les actions rapides (like, follow) → MAJ DOM immédiate, rollback si erreur serveur
- **Loader overlay** : pour les soumissions de formulaires longues uniquement

---

## Évolutions futures (TODO)

- Toast queue : limiter à 3 toasts max simultanés
- Mode sombre toggle dans le profil utilisateur (UserPreferences.theme déjà en place P3)
- Animations de transition entre pages (View Transitions API)
- Détection de la préférence `prefers-reduced-motion` pour désactiver les animations
