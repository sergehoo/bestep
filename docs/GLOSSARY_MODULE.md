# Module Lexique pédagogique (GLOSS)

Version : **1.0.0** — Livrée GLOSS-1 à GLOSS-12.

Le module lexique est un **dictionnaire interne** de Best-Épargne. Il
permet aux formateurs et à l'équipe éditoriale d'enrichir progressivement
un corpus de définitions pédagogiques, et aux apprenants de comprendre le
vocabulaire technique **directement dans les leçons** grâce à une
détection automatique et une infobulle contextuelle.

---

## 1. Architecture

### Backend — app Django `glossary`

```
glossary/
├── models.py               # 11 entités relationnelles
├── admin.py                # Django admin complet
├── serializers.py          # 3 représentations Term (mini/list/detail/detect)
├── views.py                # 20+ endpoints DRF
├── urls.py                 # /api/glossary/*
├── io_service.py           # Import/export CSV + JSON
├── migrations/
│   ├── 0001_initial.py     # Schéma complet
│   └── 0002_pg_fts.py      # PostgreSQL FTS + GinIndex
└── apps.py
```

### Frontend — module React

```
frontend/src/
├── lib/
│   ├── glossary-types.ts      # Types miroirs des serializers
│   └── glossary-detector.ts   # Moteur regex → wrapping DOM
├── hooks/glossary.ts          # 15+ hooks TanStack Query
├── components/glossary/
│   ├── GlossaryTooltip.tsx        # Popover accessible
│   ├── GlossaryContent.tsx        # Wrapper HTML annoté
│   └── GlossaryQuickAddDialog.tsx # Modal "Ajouter au lexique"
└── pages/
    ├── GlossaryPage.tsx                     # /lexique
    ├── GlossaryTermPage.tsx                 # /lexique/:slug
    ├── learner/LearnerGlossaryPage.tsx      # /mon-lexique
    ├── instructor/InstructorGlossaryPage.tsx # /formateur/lexique
    └── admin/AdminGlossaryPage.tsx           # /admin/lexique
```

---

## 2. Modèle de données

| Modèle                | Rôle                                                              |
| --------------------- | ----------------------------------------------------------------- |
| `GlossaryCategory`    | Arborescence de catégories (parent optionnel).                    |
| `GlossaryTerm`        | Entrée principale : word, definitions, scope, status, statistiques.|
| `GlossaryVariant`     | Synonyme / acronyme / pluriel / orthographe alternative.          |
| `GlossaryExample`     | Exemple d'utilisation.                                            |
| `GlossaryAssociation` | Rattache un terme à un `Course`/`Section`/`Lesson` + définition custom prioritaire.|
| `GlossaryRelation`    | Relations sémantiques (related/synonym/antonym/broader/narrower). |
| `GlossarySuggestion`  | Proposition apprenant/formateur (kind + review workflow).         |
| `GlossaryFavorite`    | Favori apprenant.                                                 |
| `GlossaryUserNote`    | Note personnelle privée (compris / à revoir).                     |
| `GlossaryView`        | Historique de consultation (analytics + "récemment consultés").   |
| `GlossaryRevision`    | Audit trail JSON par version.                                     |

### Cycle de vie d'un terme (`GlossaryTerm.status`)

```
draft → pending → validated ↔ archived
              ↘ rejected (terminal)
```

- `draft` : brouillon formateur, invisible publiquement.
- `pending` : soumis pour validation admin.
- `validated` : publié — apparaît sur `/lexique` + détection auto.
- `rejected` : refusé (visible du créateur uniquement).
- `archived` : retiré (peut être restauré).

### Priorisation d'une définition dans un cours

Ordre de résolution (plus prioritaire d'abord) :

1. `GlossaryAssociation(course=X, lesson=Y)` avec `custom_short_definition` non vide.
2. `GlossaryAssociation(course=X)` avec `custom_short_definition`.
3. `GlossaryTerm.short_definition` (globale).

---

## 3. API REST

Racine : **`/api/glossary/`**. Tous les endpoints retournent JSON.

### Public (AllowAny)

| Méthode | URL                                | Description                              |
| ------- | ---------------------------------- | ---------------------------------------- |
| GET     | `terms/`                           | Liste paginée + filtres (`q`, `letter`, `category`, `domain`, `level`, `course`, `ordering=alpha|recent|popular`).|
| GET     | `terms/:slug/`                     | Détail complet (+ related, associations, favorite, user_note). Incrémente `view_count`.|
| GET     | `terms/search/?q=...`              | Autocomplétion (max 20 résultats, PG FTS si dispo).|
| GET     | `terms/alphabet/`                  | `{total, by_letter: {A:12, B:5, ...}}` pour nav A-Z. |
| GET     | `terms/popular/`                   | Top 12 par `view_count`.                 |
| GET     | `terms/recent/`                    | 12 derniers créés/mis à jour.            |
| GET     | `categories/`                      | Catégories actives + `terms_count`.      |
| GET     | `courses/:slug/terms/`             | Payload compact pour détection frontend d'un cours.|
| GET     | `lessons/:id/terms/`               | Idem pour une leçon (backend résout le cours parent).|

### Apprenant (IsAuthenticated)

| Méthode          | URL                          | Description                     |
| ---------------- | ---------------------------- | ------------------------------- |
| POST/DELETE      | `terms/:slug/favorite/`      | Toggle favori.                  |
| PUT/DELETE       | `terms/:slug/note/`          | Upsert note personnelle privée. |
| GET              | `my/favorites/`              | Mes favoris (ordre récent).     |
| POST             | `suggestions/`               | Signaler / proposer.            |

### Instructor (rôle instructor ou admin)

| Méthode | URL                                  | Description                           |
| ------- | ------------------------------------ | ------------------------------------- |
| GET     | `instructor/terms/`                  | Mes termes (filtres q, status).       |
| POST    | `instructor/terms/`                  | Créer un terme (variants nested).     |
| GET     | `instructor/terms/:id/`              | Détail.                               |
| PATCH   | `instructor/terms/:id/`              | Modifier (mes termes uniquement).     |
| DELETE  | `instructor/terms/:id/`              | Archiver (soft delete).               |
| POST    | `instructor/terms/:id/submit/`       | Soumettre pour validation (draft → pending).|

### Admin (platform_admin uniquement)

| Méthode | URL                              | Description                              |
| ------- | -------------------------------- | ---------------------------------------- |
| GET     | `admin/terms/`                   | Tous les termes, filtres q/status/scope. |
| POST    | `admin/terms/:id/validate/`      | Publier (status=validated + published_at).|
| POST    | `admin/terms/:id/reject/`        | Rejeter + désactiver.                    |
| POST    | `admin/terms/:id/merge/`         | Fusionner dans un autre terme (payload `{target_id}`).|
| POST    | `admin/import/`                  | Import CSV/JSON (multipart, `dry_run` par défaut).|
| GET     | `admin/export/?format=csv|json`  | Téléchargement (CSV avec BOM UTF-8).     |

---

## 4. Détection automatique dans les leçons

### Frontend `lib/glossary-detector.ts`

Stratégie :

1. **Fetch** — au chargement d'une leçon, `useGlossaryLessonTerms(lessonId)` récupère le payload compact.
2. **Compile** — les mots + variantes sont dédupliqués et triés **par longueur descendante** (assure que « assurance vie » match avant « assurance »).
3. **Regex Unicode** — construite une seule fois avec des lookarounds sur `\p{L}\p{N}` pour respecter les frontières de mots accentués.
4. **Walk DOM détaché** — parse le HTML dans un fragment détaché, traverse les nodes texte hors zones interdites (`<a>`, `<code>`, `<pre>`, `<script>`, `<button>`, headings optionnel).
5. **Wrap** — chaque match devient `<button class="glossary-term" data-glossary-slug="…">`.
6. **Tooltip** — event listener délégué sur le container React affiche le popover accessible.

### Points clés

- **Le contenu source en base n'est JAMAIS modifié** — le wrapping est purement visuel au moment du rendu.
- **Performances** : cache TanStack 10 min par cours, regex construite une fois, borne anti-perf `maxMatchesPerBlock=500`.
- **Accessibilité** : boutons focusables, Esc ferme, ARIA `role="dialog"`, mobile clic vs desktop clic/focus.
- **Préférence utilisateur** : toggle « Afficher les termes du lexique » mémorisé dans `localStorage` (`be-glossary-detection`).

### Styles CSS

```css
.glossary-term {
  border-bottom: 1px dashed rgb(2 132 199 / 0.6);
  cursor: help;
}
.glossary-term:focus-visible {
  outline: 2px solid rgb(2 132 199);
}
```

---

## 5. Intégration Best-AI

### Tool `analyze_content_for_glossary`

Permet à l'IA de proposer des termes à partir du contenu d'un cours/leçon.

- **Paramètres** : `course_id`/`lesson_id`, `scope` (global|course), `proposed_terms[]`.
- **Sécurité** : chaque proposition est créée en `status=PENDING`, jamais publiée sans validation admin.
- **Dédoublonnage** : `search_key` normalisé, les doublons sont skippés.
- **RBAC** : `allowed_roles=["instructor", "platform_admin"]`, `confirmation_level=1` (aperçu obligatoire).

Voir `ai/tools/analyze_content_for_glossary.py`.

---

## 6. Import / Export

### Import CSV/JSON

Endpoint : `POST /api/glossary/admin/import/`

Colonnes CSV attendues (accents et casse tolérés, mapping multilingue) :

```
Terme | Définition courte | Définition complète | Catégorie
Synonymes (séparés par | ou ,) | Acronymes | Exemple
Portée (global|course) | Statut (draft|pending|validated)
Domaine | Niveau (beginner|intermediate|advanced)
```

Format JSON alternatif :

```json
{
  "terms": [
    {
      "word": "BRVM",
      "short_definition": "Bourse Régionale des Valeurs Mobilières",
      "category": "Bourse",
      "variants": ["Bourse régionale"]
    }
  ]
}
```

**Flow d'import**

1. Upload du fichier → analyse `dry_run=true`.
2. Backend retourne un rapport ligne par ligne :
   - `created` : sera créé.
   - `skipped_duplicate` : `search_key` déjà présent.
   - `error` : validation échouée (avec détail).
3. L'admin voit le tableau détaillé + les compteurs.
4. Clic « Importer réellement » → même endpoint avec `dry_run=false` et transaction atomique.

Bornes : 5 Mo max, UTF-8 (fallback latin-1), sniff automatique du délimiteur.

### Export

- CSV UTF-8 avec BOM (Excel FR compatible), séparateur `;`, quotes `"`.
- JSON structuré `{terms: [...], count: N}` pretty-printed.
- Filtres possibles : `?status=validated`.

---

## 7. PostgreSQL Full-Text Search

Migration `0002_pg_fts` :

- Extensions `pg_trgm` + `btree_gin` activées.
- Colonne générée `search_vector tsvector` (config `french`, pondération A/B/C/D).
- `GinIndex` sur `search_vector` → O(log n) sur mot + définition.
- `GinIndex` avec `gin_trgm_ops` sur `search_key` → recherche fuzzy prefix/substring.

**Requête FTS** (dans `GlossaryTermSearchView`) :

```python
SearchQuery(q, config="french", search_type="websearch")
SearchRank(SearchVector("word", "short_definition"), sq)
.order_by("-rank", "search_key")
```

**Fallback SQLite** : `icontains` (dev only) — automatique via `settings.DATABASES` sniff.

---

## 8. Sécurité & permissions

| Rôle             | Actions autorisées                                                        |
| ---------------- | ------------------------------------------------------------------------- |
| Public (AllowAny)| Consulter le lexique validé, chercher, voir détail.                       |
| Apprenant        | + Favoris, notes privées, suggestions.                                    |
| Instructor       | + Créer/modifier ses termes, soumettre pour validation, ajouter au lexique depuis l'éditeur Tiptap.|
| Platform admin   | + Valider/rejeter, fusionner les doublons, import/export.                 |

**Audit** — `GlossaryRevision` conserve le diff JSON à chaque modification (branché sur signals à venir).

---

## 9. Frontend UX

### Routes

| Route                | Cible               | Description                                    |
| -------------------- | ------------------- | ---------------------------------------------- |
| `/lexique`           | Public              | Hero + recherche + A-Z + filtres + grid + rail.|
| `/lexique/:slug`     | Public              | Détail : définition complète, variantes, exemples, termes connexes, cours associés, favoris + note (si authed).|
| `/mon-lexique`       | Apprenant           | Favoris + termes récents.                      |
| `/formateur/lexique` | Instructor          | Table CRUD + modal édition + soumission.       |
| `/admin/lexique`     | Admin               | Modération + import/export.                    |

### Composants réutilisables

- `<GlossaryContent html={…} lessonId={…} />` — wrapper d'un HTML avec détection + tooltip.
- `<GlossaryTooltip containerRef={…} />` — popover accessible délégué.
- `<GlossaryQuickAddDialog open initialWord courseId onClose />` — modal d'ajout rapide (utilisé par l'éditeur Tiptap et partout où on veut proposer d'ajouter un terme).

### Hook clef

```typescript
const { data } = useGlossaryLessonTerms(lesson.id);
// → { terms: GlossaryTermDetect[], count: 42, ... }
```

---

## 10. Tests

Fichier : `tests/test_glossary.py` (250+ assertions).

Couverture :

- Modèle : normalisation search_key, unicité slug, resync automatique.
- Public API : liste (statuts filtrés), détail, search (accents/case/variants), alphabet, catégories.
- Favoris : auth requise, toggle, isolation par user.
- Notes personnelles : upsert.
- Instructor CRUD : RBAC strict, ne voit que ses termes, submit draft→pending.
- Admin moderation : validate/reject/merge (avec transfert de favoris), self-merge interdit.
- Import : dry_run avec rapport correct (created/skipped_duplicate/error), effective création, RBAC.

**Exécution** :

```bash
docker compose exec backend pytest tests/test_glossary.py -v
```

---

## 11. Déploiement

```bash
# Migrations
docker compose exec backend python manage.py migrate glossary

# Rebuild frontend
cd frontend && npm run build && bestfront restart

# Restart backend (nouveaux endpoints + tool AI)
docker compose restart backend
```

## 12. Roadmap ultérieure

- Export PDF imprimable (weasyprint).
- Historique de révisions branché sur `pre_save` signals.
- Filtre « termes des formations que je suis » sur `/mon-lexique`.
- Suggestions IA temps-réel pendant la rédaction d'une leçon.
- Traduction multilingue (`language` déjà présent en base).
- Tests Playwright E2E : parcours instructor → admin validate → learner voit dans player.

---

*Livré par les tâches GLOSS-1 à GLOSS-12.*
