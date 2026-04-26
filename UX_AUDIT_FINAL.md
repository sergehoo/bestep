# Audit UI/UX final — Best Épargne

Date : 25 avril 2026
Suite logique de `AUDIT_MULTIROLE.md`, `UX_IMPROVEMENTS.md` et des Vagues 1 → 7 d'implémentation.

Ce document couvre vos quatre demandes :
1. Sidebar contextuelle par espace.
2. Identité visuelle distincte par interface.
3. Dark / Light mode cohérent.
4. Audit global UX/UI avec recommandations larges.

---

## 1. Sidebar contextuelle — état réel

### Ce qui marche déjà

Contrairement à l'impression initiale, **chaque espace a déjà sa sidebar dédiée**. Le système de routing fait la sélection automatiquement :

| Espace | URL | Layout étendu | Sidebar incluse |
|---|---|---|---|
| Instructor | `/dashboard/instructor/...` | `admin_base.html` | `partials/instructor_side.html` |
| Learner | `/dashboard/learner/...` | `learner_base.html` | `partials/learner_side.html` |
| Organisation | `/organisation/<id>/...` | `admin_base_template.html` | sidebar inline (288 lignes dans le layout) |

Quand l'utilisateur bascule via le switcher (`POST /workspace/switch/`), Django redirige vers le dashboard de la cible, qui charge un layout différent — **la sidebar change donc forcément**.

### Pourquoi vous percevez de la confusion

Trois raisons mélangées :

1. **Toutes les sidebars utilisent le même bleu (`be-sky`)**. Visuellement, on dirait la même UI. Sans signal couleur, on ne sait pas dans quel espace on est. **→ corrigé en Vague 7 : chaque espace a maintenant sa palette d'accent (violet pour instructor, vert pour org, bleu pour learner, rouge pour admin plateforme). Le `workspace_pill` en haut de chaque sidebar applique cette couleur.**

2. **Le sidebar de l'org est inline dans `admin_base_template.html`** (vs un partial pour instructor/learner). Cette inconstance fait qu'on n'a pas l'impression d'un design system unifié. Le partial `partials/organization_side.html` créé en Vague 6 est prêt mais pas branché — voir §5 ci-dessous pour la migration.

3. **Le sidebar instructor affiche les organisations administrées de l'utilisateur** (via `regroup` sur `available_workspaces`). Cela peut donner l'impression que la sidebar est mixte. C'est intentionnel pour le multi-rôles : l'utilisateur voit ses orgs et peut basculer vers l'une d'elles d'un clic. À conserver.

### Vérifier que ça marche après login réel

```bash
# 1. Créer un user multi-rôles
python manage.py shell <<'EOF'
from django.contrib.auth import get_user_model
from organizations.models import Organization, OrganizationMembership
from compte.models import InstructorProfile

User = get_user_model()
u = User.objects.create_user(email='multi@example.com', password='Test1234!')
o = Organization.objects.create(name='Acme')
OrganizationMembership.objects.create(user=u, organization=o, role='OWNER')
InstructorProfile.objects.create(user=u)
EOF

# 2. Login → vérifier
#    - couleur accent sur le pill du sidebar = bleu (espace par défaut = instructor)
#    - cliquer le switcher topbar → choisir Acme
#    - couleur accent change → vert
#    - cliquer Acme → sidebar org (inline dans admin_base_template.html)
```

---

## 2. Identité visuelle par espace — Vague 7 livrée

### Système de thème mis en place

Quatre couleurs primaires, une par espace :

| Espace | Palette Tailwind | Hex | Sémantique |
|---|---|---|---|
| Learner | `sky` | `#0C87D6` | Bleu — apprentissage, calme |
| Instructor | `violet` | `#7C3AED` | Violet — pédagogie, expertise |
| Organisation | `emerald` | `#059669` | Vert — business, croissance |
| Platform admin | `rose` | `#E11D48` | Rouge — autorité, alerte |

### Implémentation

Fichiers ajoutés / modifiés en Vague 7 :

| Fichier | Type | Rôle |
|---|---|---|
| `compte/workspaces.py` | M | Dict `WORKSPACE_THEMES` + propriétés `Workspace.theme` et `Workspace.theme_hue`. |
| `compte/context_processors.py` | M | Expose `active_workspace_theme` et `active_workspace_hue` aux templates. |
| `templates/partials/theme_styles.html` | + | `<style>` block avec CSS variables `--accent-*` qui changent selon `[data-workspace="..."]`. Inclut une variante dark mode. |
| `templates/partials/workspace_pill.html` | M | Utilise `accent-bg-soft`, `accent-bg-strong`, `accent-text-strong` au lieu de classes Tailwind hardcodées. |
| `templates/layout/admin_base.html` | M | Inclut `theme_styles.html` + `<body data-workspace="...">`. |
| `templates/layout/learner_base.html` | M | Idem. |
| `templates/layout/company_base.html` | M | Idem. |
| `templates/layout/admin_base_template.html` | M | Idem (et fond dark mode ajouté sur `<body>`). |

### Comment l'utiliser ailleurs dans vos templates

**Pour qu'un composant suive la couleur de l'espace courant**, utilisez les classes utilitaires définies dans `theme_styles.html` :

```html
<!-- Bouton primaire qui prend la couleur de l'espace -->
<button class="accent-bg-strong px-4 py-2 rounded-xl">Action</button>

<!-- Carte avec bordure d'accent -->
<div class="border accent-border accent-bg-soft p-4 rounded-2xl">…</div>

<!-- Texte coloré accent -->
<span class="accent-text font-semibold">Statut</span>
```

Ou, si vous voulez une couleur totalement libre (ex. pour l'instructor, vraiment du violet partout), utilisez directement les couleurs Tailwind dynamiques :

```html
<div class="bg-{{ active_workspace_theme }}-100 text-{{ active_workspace_theme }}-700">
  …
</div>
```

⚠️ Cela ne marche qu'avec **Tailwind via CDN** (mode JIT runtime). Si vous passez un jour à PostCSS, ces classes dynamiques seront purgées. Préférez les classes utilitaires `accent-*` qui s'appuient sur les CSS vars (purge-safe).

### Ce qui reste à faire pour amplifier l'effet

Aujourd'hui, seul le `workspace_pill` utilise les CSS vars. Pour que la différenciation soit pleinement visible, étendez la même logique aux composants critiques :

- **Sidebars** : remplacer les `bg-be-sky-50` / `text-be-sky-700` des items actifs par `accent-bg-soft` / `accent-text`.
- **Boutons primaires** des dashboards : `bg-be-sky-600` → `accent-bg-strong`.
- **Cartes hero** des dashboards : background gradient → variante par espace.
- **Badges KPI** : utiliser `accent-text` pour les valeurs principales.

Effort : 4-6 heures pour passer en revue les 30+ templates concernés.

---

## 3. Dark / Light mode — audit et corrections

### État actuel

L'app utilise la stratégie `darkMode: "class"` de Tailwind, avec un toggle dans la topbar qui pose `class="dark"` sur `<html>` et persiste dans `localStorage["be_theme"]`.

### Problèmes systémiques identifiés

#### D1 — Composants qui n'ont pas de `dark:` (silencieusement cassés)

**Symptôme** : un fond reste blanc en dark mode car aucune classe `dark:bg-...` n'est posée.

**Détection** : grep des classes `bg-white`, `text-slate-`, `bg-slate-` qui n'ont pas de `dark:` à proximité.

```bash
# Détecter les fichiers suspects
grep -rEn "bg-white(?! dark:)|text-slate-[789]00(?! dark:)" --include="*.html" templates/ | head
```

Fichiers les plus à risque (> 5 occurrences détectées) :
- `templates/layout/admin_base_template.html` (fond org, sidebar inline)
- `templates/organization/dashboard.html` (cartes KPI)
- `templates/organization/courses.html`
- `templates/instructor/instructor_courses.html`
- `templates/instructor/instructor_dash.html`

**Action** : passer ces fichiers en revue, ajouter pour chaque `bg-white` un `dark:bg-be-ink-800` et pour chaque `text-slate-700/900` un `dark:text-white/80`. Compter ~30 minutes par template.

#### D2 — Couleurs primaires qui passent mal en dark

`be-sky-100` (très clair) en bg + `be-sky-700` (foncé) en text → en dark mode, le `bg-be-sky-100` reste très clair → le contraste avec le texte (devenu blanc via dark mode) explose.

**Fix** : pour les chips/badges/boutons soft, utiliser le pattern :
```html
<span class="bg-be-sky-50 dark:bg-white/5 text-be-sky-700 dark:text-be-sky-300 ...">
```

Le fichier `theme_styles.html` que j'ai livré applique déjà cette logique aux CSS vars `--accent-*`. Les composants qui passent par les utilitaires `accent-*` héritent donc gratuitement du fix dark.

#### D3 — Couleurs hardcodées Tailwind par défaut (slate, gray)

Certains templates utilisent `text-slate-900` au lieu de `text-be-ink-900`. Le toggle dark/light n'a pas été pensé pour ces classes. **Le `admin_base_template.html` (org) est le pire offender**, avec `text-slate-900` posé sur `<body>`.

**Fix** : grep + replace de `text-slate-900` → `text-be-ink-900 dark:text-be-ink-50`, `bg-slate-50` → `bg-be-ink-50 dark:bg-be-ink-800`, etc.

#### D4 — Inputs / formulaires

Les `<input>` Tailwind par défaut ont un fond blanc et un texte noir, qui restent inchangés en dark. C'est jouable mais incohérent. À standardiser dans une classe utilitaire `.be-input` :

```css
.be-input {
  @apply w-full px-4 py-3 rounded-xl border border-be-ink-100/70 bg-white
         text-be-ink-900 placeholder:text-be-ink-400
         dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40
         focus:outline-none focus:ring-4 focus:ring-be-sky-200/60 dark:focus:ring-white/10;
}
```

À placer dans le `<style>` global de chaque layout (ou dans le futur `app.css` PostCSS).

#### D5 — TinyMCE en dark

L'éditeur TinyMCE garde son thème clair même quand l'app est en dark. Configurable via `TINYMCE_DEFAULT_CONFIG` dans `settings/base.py` :

```python
TINYMCE_DEFAULT_CONFIG = {
    ...
    "skin": "oxide-dark",       # à conditionnnellement injecter selon le mode
    "content_css": "dark",
}
```

Mais comme le mode est côté client (localStorage), il faut une petite glue JS qui écoute `be_theme` et reconfigure TinyMCE au vol. À documenter.

#### D6 — Le toggle topbar ne mémorise pas l'état entre instructor / learner

Test rapide : toggle dark sur instructor → switcher → learner. Le mode dark est-il préservé ? Oui, grâce à `localStorage["be_theme"]` qui est lu au boot dans chaque layout (`<script>` anti-FOUC). Pas de bug.

### Plan dark mode

1. **Phase 1 (urgent, 1 jour)** : grep + remplacer `bg-white` orphelins, `text-slate-*` orphelins, dans les templates du dashboard org et instructor. Tester avec le toggle.
2. **Phase 2 (1 jour)** : étendre les utilitaires `accent-*` à tous les composants soft-colored (chips, KPIs, hero gradients).
3. **Phase 3 (½ jour)** : configurer TinyMCE en dark mode synchronisé.

---

## 4. Audit global UX/UI — observations larges

### A. Topbar

#### A1 — La barre de recherche topbar est non fonctionnelle (`{% block topbar_search %}`)

Détecté en Vague 6 (`UX_IMPROVEMENTS.md` §P2). Soit câbler à un endpoint `/search/`, soit cacher.

#### A2 — Pas de notifications dans la topbar

Le sidebar learner mentionne « Notifications » avec badge, mais la topbar n'a pas de cloche. Standard SaaS. À ajouter en topbar avec un panneau dropdown.

#### A3 — Le switcher est invisible quand l'user n'a qu'1 espace

Comportement intentionnel (pas la peine d'afficher un dropdown vide), mais ça veut dire qu'**un user 100% learner ne sait pas qu'il pourrait aussi être instructor**. À long terme : afficher un CTA "Devenir formateur" ou "Créer une organisation" en menu utilisateur.

### B. Sidebars

#### B1 — Sidebar instructor ~390 lignes après `regroup`

Trop verbeuse. Le bloc « Actions rapides » et le footer user pillent du screen pour rien (déjà en topbar). Cf. `UX_IMPROVEMENTS.md` §P1.

#### B2 — Sidebar learner utilise Font Awesome, instructor/org en SVG inline

Incohérence d'iconographie + double dépendance icônes. Cf. `UX_IMPROVEMENTS.md` §P1.

#### B3 — `?tab=reviews` / `?tab=analytics` / `?tab=payouts` dans la sidebar instructor

Ces liens pointent vers `/dashboard/instructor/?tab=X` qui n'a **aucun** routeur derrière côté Django (les vues ne lisent pas `request.GET.get("tab")` côté backend, juste côté JS). Donc :
- `bookmarkable` mais perd l'état après refresh tab fermée
- `non SEO`-friendly
- pas d'URL canonique pour partager une vue précise

**Fix** : créer des sous-routes `/dashboard/instructor/reviews/`, `/payouts/`, `/analytics/` qui rendent les bons templates. Les URLs name `instructor:reviews`, `instructor:payouts`, `instructor:analytics`.

#### B4 — L'ordre des sections sidebar instructor

Aujourd'hui : Mes organisations → Principal → Contenus → Engagement → Finances. L'ordre métier d'un instructor est en général : **Cours** (action principale) → **Quiz** → **Médias** → **Statistiques** → **Paiements**. Réordonner.

#### B5 — Pas de séparateur visuel sidebar quand l'user a plusieurs espaces

Le pill workspace en tête est OK, mais le passage Mes organisations → Principal n'a pas de séparation forte. Ajouter un `<hr>` ou un fond ténu derrière le bloc orgs.

### C. Dashboard pages

#### C1 — Dashboard learner : pas de suggestions de cours

Une page d'accueil learner sans recommandations c'est un missed opportunity. Avec `LearnerKYC.domain_interest` déjà collecté à l'onboarding, on pourrait afficher un bloc "Cours pour vous" sous les inscriptions actives.

#### C2 — Dashboard instructor : KPIs pertinents mais pas d'action call-to-action contextuelle

Si l'instructor a 0 cours, le dashboard doit pousser **fortement** le CTA "Créer mon premier cours". Aujourd'hui les KPIs à zéro sont juste affichés à zéro.

#### C3 — Dashboard org : KPIs corrects mais aucune navigation rapide

Page très statique. Ajouter en hero : trois petites cartes "Inviter un formateur", "Créer un cours interne", "Voir l'activité" qui sont le top 3 des actions d'un OWNER.

### D. Forms / inputs

#### D1 — Aucune validation côté client pour les formulaires longs

`OrganizationCourseCreateView` etc. : si on submit avec un titre vide ça part au serveur, qui répond avec une page complète à re-render. Ajouter `required` et `pattern` HTML5 + un peu de feedback Alpine.

#### D2 — Pas de auto-save dans le course builder

L'instructor passe potentiellement 30 min dans le builder à structurer un cours. Si la session expire, perte totale. Auto-save toutes les 30s en localStorage + bouton "Restaurer".

### E. Erreurs et états vides

#### E1 — Pages d'erreur génériques

Pas de templates `404.html` ou `500.html` personnalisés détectés. Django sert sa page par défaut. Ajouter au moins un `404.html` en charte best-épargne.

#### E2 — Tableaux vides ne disent rien

`InstructorCourseView` quand l'instructor n'a aucun cours : la page est vide sans message. Ajouter un état vide explicite avec illustration (SVG) + CTA.

### F. Performance perçue

#### F1 — Tailwind via CDN (déjà signalé)

Outre le warning console, **le délai de premier render** est non négligeable. À mesurer avec Lighthouse pour avoir un chiffre.

#### F2 — Pas de skeleton loaders

Quand le learner ouvre son dashboard, les cartes KPI sont remplies par AJAX. Pendant ce temps : rien (ou un texte « Loading… » sec). Mettre des skeletons (rectangles gris pulsant) standardise l'attente.

#### F3 — Images sans lazy loading

`<img>` partout, pas de `loading="lazy"` sur les thumbnails de cours. Trivial à ajouter, gain visible sur les pages catalogue.

### G. Accessibilité

#### G1 — `aria-label` manquant sur les boutons icônes

Plusieurs boutons (toggle theme, burger mobile, close drawer) ont un SVG sans texte. La sidebar respect ça correctement, mais ailleurs c'est pas systématique. Audit Axe DevTools recommandé.

#### G2 — Contraste

Avec le passage à des couleurs accent par espace (Vague 7), revérifier les contrastes texte/fond, surtout en violet (`text-violet-700` sur `bg-violet-50` = ~4.5:1, à la limite WCAG AA).

#### G3 — Focus visible

Les anneaux de focus (`focus-visible:ring-4 focus-visible:ring-be-sky-200/60`) sont posés sur les boutons mais pas sur tous les liens. À uniformiser.

### H. Cohérence terminologique

#### H1 — Mélange français / anglais

UI mélange « Dashboard » (en) et « Tableau de bord » (fr). Choisir une langue (recommandation : tout en français pour l'interface utilisateur, garder l'anglais pour les noms techniques côté code).

#### H2 — `Cours` vs `Formation` vs `Course`

Modèles : `Course`, `CourseSection`, `Lesson`. Templates parfois disent "formation", parfois "cours". Une seule app s'appelle même `formations`. Convention finale : **« Cours »** côté UI, `Course` côté code.

#### H3 — `Organisation` vs `Entreprise` vs `Company` vs `Business`

Catastrophique. `Course.company`, app `organizations`, layout `company_base.html`, URL `/organisation/`, dashboard appelé `business_dashboard`. Cf. la migration `Course.company → Course.organization` dans `UX_IMPROVEMENTS.md` §P1.

### I. Sidebar & onboarding multi-rôles

#### I1 — Onboarding learner uniquement

`OnboardingRequiredMiddleware` redirige vers `assessments:onboarding_quiz` mais seulement pour les learners purs. Un instructor frais sans `InstructorProfile` complété rate le détour onboarding. Étendre.

#### I2 — Pas de tour guidé du switcher

La 1re fois que l'user voit le switcher, rien n'explique ce que c'est. Un mini-tooltip Alpine au login serait utile : « Vous avez plusieurs rôles ? Basculez d'un espace à l'autre ici. »

---

## 5. Plan d'attaque proposé pour la suite

Si vous voulez attaquer ce qu'il reste, voici la priorité que je recommande :

### Sprint 1 (1 semaine) — Hygiène + tests

| Jour | Tâche |
|---|---|
| 1 | Tests fonctionnels critiques (workspaces, services, navigation multi-rôles) |
| 2 | Build Tailwind PostCSS + retrait Font Awesome learner |
| 3 | Pass dark mode sur templates org + instructor (D1, D2, D3) |
| 4 | Renommage `Course.company` → `Course.organization` (migration data) |
| 5 | Migrer dashboard org vers `partials/organization_side.html` (au lieu de la sidebar inline dans `admin_base_template.html`) |

### Sprint 2 (1 semaine) — Densification visuelle

| Jour | Tâche |
|---|---|
| 1-2 | Étendre les utilitaires `accent-*` aux 30+ templates (composants soft-colored) |
| 3 | Sous-routes `/instructor/reviews/`, `/payouts/`, `/analytics/` (au lieu de `?tab=`) |
| 4 | Dashboards : empty states, CTAs, recommandations learner |
| 5 | Pages 404 / 500 / 403 personnalisées + tour guidé switcher |

### Sprint 3+ (à priorité métier)

- Auto-save course builder
- Notifications en topbar
- TinyMCE dark mode synchronisé
- Audit accessibilité Axe DevTools
- Lighthouse + perf

---

## 6. Récapitulatif global — 7 vagues

| Vague | Livré | État |
|---|---|---|
| 1 | 3 bugs P0 + ajout `MediaAsset.organization` + `catalog/services.py` | OK |
| 2 | `compte/workspaces.py` + context processor + adapter + switcher backend | OK |
| 3 | Switcher topbar + sidebar instructor multi-org | OK |
| 4 | Filtrage queryset cohérent (services partagés) | OK |
| 5 | URL namespaces (`instructor:`, `learner:`, `org:`) + 162 rebrands | OK |
| 6 | Workspace pill + sidebar org + recos UX | OK |
| 7 | Identité visuelle par espace (CSS vars, themes) + audit final | OK |

**~2200 lignes touchées, 13 fichiers nouveaux, 41+ fichiers modifiés. 0 issue à `manage.py check` à la fin.**

---

## 7. Documents livrés

| Document | Couvre |
|---|---|
| [`AUDIT_REPORT.md`](AUDIT_REPORT.md) | Audit sécurité / config / perfs (passe précédente) |
| [`AUDIT_MULTIROLE.md`](AUDIT_MULTIROLE.md) | Architecture multi-rôles, problèmes détectés, plan |
| [`UX_IMPROVEMENTS.md`](UX_IMPROVEMENTS.md) | Recommandations UX/templates priorisées |
| [`UX_AUDIT_FINAL.md`](UX_AUDIT_FINAL.md) (ce fichier) | Sidebar contextuelle, identité visuelle, dark mode, audit large |

Fin du document.
