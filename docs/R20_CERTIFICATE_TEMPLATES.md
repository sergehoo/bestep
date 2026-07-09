# R20 — Certificate Template Builder

Personnalisation avancée des modèles de certificat livrée en 5 sous-tâches
(R20.1 backend, R20.2 hooks, R20.3 page éditeur, R20.4 intégration cours,
R20.5 rendu vérification).

## Modèle `CertificateTemplate`

Migration `certifications/0004_certificate_template_builder.py` — additive
safe. Enrichit la table existante.

| Groupe | Champs |
|---|---|
| Portée | `owner` (FK User, null=preset global), `is_public`, `is_default` |
| Style | `style` (classic/modern/premium/academic/enterprise/minimal/luxury), `orientation` (landscape/portrait) |
| Palette | `primary_color`, `accent_color`, `text_color` (hex `#rrggbb`), `font_family` |
| Contenu | `organization_name`, `heading_text`, `body_text` (support variables `{{...}}`), `footer_text` |
| Images | `logo_url`, `signature_image_url`, `watermark_url` |
| Signature | `signature_name`, `signature_title` (déjà présents legacy) |
| Options | `show_qr_code`, `show_serial`, `show_completion_date` |
| Timestamps | `created_at`, `updated_at` (auto) |

Contrainte d'unicité `name` retirée — plusieurs owners peuvent avoir le
même nom. 2 indexes ajoutés : `(owner, is_public)` et `(style)`.

Migration `certifications/0005_seed_certificate_presets.py` (RunPython
idempotent) — seed 7 presets globaux (owner=NULL, is_public=True).

## FK `Course.certificate_template`

Migration `catalog/0013_course_certificate_template.py` — ajoute un FK
optionnel `Course.certificate_template → CertificateTemplate` avec
`on_delete=SET_NULL`. `null=True/blank=True` signifie : template par
défaut de la plateforme.

## Endpoints

```
GET    /api/instructor/certificate-templates/[?style=<slug>]
POST   /api/instructor/certificate-templates/
GET    /api/instructor/certificate-templates/<id>/
PATCH  /api/instructor/certificate-templates/<id>/
DELETE /api/instructor/certificate-templates/<id>/
POST   /api/instructor/certificate-templates/<id>/duplicate/
```

Politique :
- Lecture : owner + `is_public=True` + `owner IS NULL` (presets).
- Écriture : owner **ou** `is_platform_admin`.
- `is_public` : seul le platform_admin peut créer/marquer un template public.
- Duplicate : n'importe quel template visible → copie owner=user, is_public=False.

`CourseSerializer` accepte `certificate_template` en écriture — la
validation vérifie que le template est visible (owner OU public OU
preset). `None` = désassigner.

## Variables dynamiques

Placeholders reconnus dans `heading_text`, `body_text`, `footer_text` :

```
{{student_name}}       Nom de l'apprenant
{{course_title}}       Titre du cours
{{instructor_name}}    Nom du formateur
{{completion_date}}    Date d'obtention (localisée)
{{certificate_number}} Numéro / code du certificat
{{organization_name}}  Organisation émettrice
{{hours}}              Durée en heures
{{score}}              Score obtenu (%)
{{verification_url}}   URL de vérification
```

Une variable inconnue est **laissée telle quelle** (permet aussi de
diagnostiquer un mauvais nom). Rendu côté frontend via
`renderCertificateText()` dans `frontend/src/hooks/certificate-templates.ts`.

## Composants frontend

| Fichier | Rôle |
|---|---|
| `hooks/certificate-templates.ts` | Types + 6 hooks TanStack + helpers |
| `components/certificates/CertificatePreview.tsx` | Rendu HTML/Tailwind d'un certificat (7 variantes visuelles, ratio A4) |
| `pages/instructor/InstructorCertificateTemplatesPage.tsx` | Liste + éditeur + preview live |
| `components/instructor/CourseCertificationSection.tsx` | Section "Certification" dans l'éditeur cours |
| `pages/CertifyPage.tsx` | Rendu public + impression PDF (window.print) |

## Roadmap R21+

Non couvert par R20 :

1. **Éditeur DnD complet type Canva/Certifier** — repositionnement libre
   des éléments, redimensionnement, alignement, verrouillage, marges
   configurables (Konva.js / Fabric.js). ~1-2 semaines de dev.
2. **Génération PDF server-side** (Weasyprint) — remplace `window.print()`,
   support meilleur des polices custom et watermarks.
3. **Endpoint public `/api/public/certificates/<code>/`** — retourne
   `{ template, student_name, course_title, issued_at }` pour permettre
   la vérification sans authentification.
4. **Vraie liaison IssuedCertificate ↔ CertificateTemplate** — snapshot
   du template au moment de la délivrance pour immuabilité.
5. **Éléments graphiques enrichis** — bordures customisables, icônes,
   médailles/badges vectoriels, rubans SVG en assets.
6. **Palette couleur & polices** — sélecteur de couleur avancé avec
   suggestions harmoniques, upload de font custom.

## Smoke test manuel

```bash
# Backend : migration
DJANGO_SETTINGS_MODULE=best_epargne.settings.dev python manage.py migrate

# 7 presets doivent apparaître
DJANGO_SETTINGS_MODULE=best_epargne.settings.dev python manage.py shell \
  -c "from certifications.models import CertificateTemplate; print(CertificateTemplate.objects.filter(owner__isnull=True).count())"
# → 7

# Frontend : typecheck
cd frontend && ./node_modules/.bin/tsc --noEmit

# UI : navigation
# 1. Login instructor → /instructor/certificate-templates
# 2. Filtrer par style, sélectionner "Moderne dégradé", vérifier preview
# 3. Cliquer "Dupliquer" → doit apparaître un template perso éditable
# 4. Modifier heading_text, ajouter variable {{score}} → preview live
# 5. Enregistrer → refetch, toast succès
# 6. Aller /instructor/courses/<id>/edit → onglet Métadonnées
# 7. Section "Certification" doit lister tous les templates visibles
# 8. Sélectionner le template dupliqué → Enregistrer
# 9. Ouvrir /certify/TEST-CODE → rendu utilise le template default
```
