# Design System Best Épargne — Référence rapide

> Phase 2 du chantier de refonte. Identité visuelle **bleu / jaune**
> cohérente sur tous les écrans (apprenant, formateur, organisation,
> admin, public).

---

## Palette

### Couleurs marque

| Token | Hex | Usage |
|---|---|---|
| `be-sky-600` / `primary-600` | `#0C87D6` | **Bleu primaire** — boutons d'action, liens, focus |
| `be-sun-500` / `accent-500` | `#F7A600` | **Jaune accent** — highlights, CTAs secondaires, badges |
| `be-ink-900` / `neutral-900` | `#121827` | Texte fort, titres |
| `be-ink-500` / `neutral-500` | `#5B6783` | Texte secondaire |
| `be-ink-100` / `neutral-100` | `#EEF2F7` | Bordures, fonds neutres |

### Couleurs sémantiques

| Variant | Couleur | Usage |
|---|---|---|
| **success** | emerald-600 `#059669` | Confirmation, publication, complétion |
| **warning** | amber-500 `#F59E0B` | Avertissement, dépublication, attention |
| **danger** | rose-600 `#E11D48` | Suppression, erreur, action destructrice |
| **info** | be-sky-600 | Information neutre, conseils |

### Aliases sémantiques

`primary-X`, `accent-X`, `neutral-X` pointent vers les hex de `be-sky-X`,
`be-sun-X`, `be-ink-X` respectivement. Préférer les noms sémantiques
dans les NOUVEAUX templates :

```html
<!-- ✅ Recommandé -->
<button class="bg-primary-600 hover:bg-primary-700">Action</button>

<!-- 🔄 Legacy (toujours OK, équivalent) -->
<button class="bg-be-sky-600 hover:bg-be-sky-700">Action</button>
```

---

## Classes composantes

Toutes les classes commencent par `.be-*` et sont définies dans
`static/src/app.css` (layer `components`, via `@apply`).

### Boutons

| Classe | Apparence | Usage |
|---|---|---|
| `.be-btn-primary` | Bleu plein, ombre légère | Action principale ("Publier", "Enregistrer", "Soumettre") |
| `.be-btn-secondary` | Jaune plein, texte foncé | Action accent ("Découvrir", "Se former") |
| `.be-btn-outline` | Bordure neutre, fond blanc | Action tertiaire ("Annuler", "Retour") |
| `.be-btn-ghost` | Pas de fond, juste texte | Navigation tabs, links discrets |
| `.be-btn-danger` | Rouge plein | Suppression, action destructrice |
| `.be-btn-success` | Vert plein | Confirmation (publish, mark complete) |

**Tailles** : `.be-btn-xs`, `.be-btn-sm`, (rien=md), `.be-btn-lg`
**Bouton icône** : ajouter `.be-btn-icon` (carré 36×36)

```html
<button class="be-btn-primary">Publier le cours</button>
<button class="be-btn-outline be-btn-sm">Annuler</button>
<button class="be-btn-danger be-btn-icon" aria-label="Supprimer">
  <i class="fa-solid fa-trash"></i>
</button>
```

### Cards

```html
<article class="be-card-elevated">
  <header class="be-card-header">
    <div>
      <h3 class="be-card-title">Mon titre</h3>
      <p class="be-card-subtitle">Sous-titre optionnel</p>
    </div>
  </header>
  <div class="be-card-body">…</div>
  <footer class="be-card-footer">…</footer>
</article>
```

Variantes : `.be-card` (sans ombre), `.be-card-elevated` (ombre soft),
`.be-card-flat` (sans ombre, alias).

### Formulaires

```html
<div class="space-y-1.5">
  <label class="be-label be-label-required" for="id_email">Email</label>
  <input id="id_email" name="email" type="email" class="be-input" required>
  <p class="be-help-text">Nous ne partagerons jamais cette adresse.</p>
</div>

<select class="be-select">…</select>
<textarea class="be-textarea">…</textarea>
```

Tailles : `.be-input-sm`, `.be-input-lg` (idem pour select).

### Badges

```html
<span class="be-badge-success">
  <i class="fa-solid fa-check"></i> Publié
</span>
<span class="be-badge-warning be-badge-lg">En attente</span>
<span class="be-badge-neutral be-badge-xs">Brouillon</span>
```

Variants : `primary`, `accent`, `success`, `warning`, `danger`, `info`, `neutral`.
Tailles : `.be-badge-xs`, (md par défaut), `.be-badge-lg`.

### Alerts

```html
<div class="be-alert-success" role="status">
  <i class="fa-solid fa-circle-check"></i>
  <div class="flex-1">Le cours a été publié avec succès.</div>
</div>
```

Variants : `success`, `warning`, `danger`, `info`.

### Tables

```html
<table class="be-table">
  <thead>
    <tr><th>Titre</th><th>Statut</th></tr>
  </thead>
  <tbody>
    <tr><td>Mon cours</td><td>…</td></tr>
  </tbody>
</table>
```

Variante : `.be-table-compact` (cells plus serrées).

---

## Partials Django paramétrables

Tous dans `templates/partials/ds/`. Utiliser plutôt qu'écrire le HTML
direct pour garantir la cohérence visuelle.

### `partials/ds/button.html`

```django
{% include "partials/ds/button.html" with
    label="Publier"
    variant="primary"
    icon="rocket"
    href="/some/path/" %}
```

Paramètres : `label`, `variant`, `size`, `icon`, `icon_right`, `href`,
`type`, `disabled`, `aria_label`, `extra_class`, `extra_attrs`.

### `partials/ds/badge.html`

```django
{% include "partials/ds/badge.html" with
    label="Nouveau"
    variant="accent"
    icon="star" %}
```

### `partials/ds/card.html`

```django
{% include "partials/ds/card.html" with
    title="Mon titre"
    subtitle="Description"
    body=html_content
    elevated="1" %}
```

### `partials/ds/input.html`

```django
{% include "partials/ds/input.html" with
    name="email"
    label="Adresse email"
    type="email"
    required="1"
    help="Format : nom@exemple.com" %}
```

### `partials/ds/empty_state.html`

```django
{% include "partials/ds/empty_state.html" with
    icon="graduation-cap"
    title="Aucun cours pour le moment"
    message="Créez votre premier cours pour commencer."
    cta_label="Créer un cours"
    cta_url="/instructor/courses/create/" %}
```

### `partials/ds/alert.html`

```django
{% include "partials/ds/alert.html" with
    variant="success"
    title="Action réussie"
    message="Le cours a été publié." %}
```

---

## Partials métier réutilisables

### `partials/course_status_badge.html` (P1.3)

Badge spécifique pour le statut d'un cours (DRAFT/REVIEW/PUBLISHED/ARCHIVED).

```django
{% include "partials/course_status_badge.html" with status=course.status size="md" %}
```

### `partials/course_lifecycle_actions.html` (P1.3)

Boutons d'action contextuels selon le statut + modales de confirmation.

```django
{% include "partials/course_lifecycle_actions.html" with course=course layout="stack" %}
```

---

## Rebuild du CSS

Après toute modification de `tailwind.config.js` ou `static/src/app.css` :

```bash
npm run build:css     # production minifiée → static/dist/app.min.css
npm run watch:css     # dev avec hot reload
```

En prod, après git pull :

```bash
docker compose exec -T bestweb npm run build:css
docker compose exec -T bestweb python manage.py collectstatic --noinput
docker compose restart bestweb
```

---

## Migration de l'existant

Les classes legacy (`.btn`, `.card`, `.input`, `.badge`, etc.) restent
fonctionnelles. Pour les nouveaux templates ou refontes, préférer
`.be-*` qui sont :

- documentés ici
- harmonisés avec la palette bleu/jaune
- testés sur les espaces apprenant + formateur + organisation
- résistants au dark mode

Plan de migration progressive :
1. Templates publiques (landing, catalogue, fiche cours) ✓ (en cours)
2. Auth (login, signup, mot de passe)
3. Espace apprenant
4. Espace formateur
5. Espace organisation
6. Admin plateforme

---

## Accessibilité

Tous les composants `.be-*` respectent :

- Contraste WCAG AA (texte sur fond)
- Focus visible (`focus-visible:ring-4`)
- `aria-label` requis sur boutons icon-only
- `aria-describedby` pour les help-text / error-text
- Tailles touch-friendly mobile (min 44×44 sur `.be-btn`)

---

## Dark mode

Toutes les classes `.be-*` ont des variantes dark mode auto-appliquées
via le préfixe `dark:` Tailwind. Le toggle est géré par
`static/src/js/theme-init.js` (mis à `class="dark"` sur `<html>`).
