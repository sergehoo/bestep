# R24 — Inscription premium + Onboarding apprenant + Recommandations

Refonte de la page d'inscription et introduction d'un parcours d'onboarding
apprenant en 6 étapes, suivi d'une page de recommandations personnalisées.
Livrée en 7 sous-tâches.

## Vue d'ensemble

```
Inscription (RegisterPage split-screen)
        ↓
Création du compte via /api/auth/register/  (JWT tokens stockés Zustand)
        ↓
Redirection selon `account_type` :
  • learner       → /onboarding/learner   (si onboarding non complété)
  • instructor    → /instructor?welcome=1&pending=1
  • org_admin     → /instructor?welcome=1&org=1
  • is_platform_admin → /dashboard/admin
        ↓
6 étapes progressives sauvegardées automatiquement (localStorage)
        ↓
Génération du profil apprenant (archétype + score maturité + tags)
        ↓
/recommended-courses (moteur client-side)
        ↓
/learn (dashboard cockpit apprenant avec bandeau si profil incomplet)
```

## Architecture

### Store Zustand `learner-profile.ts`

Clé localStorage `be-learner-profile`. Persiste :

- `answers` — les 6 réponses de l'onboarding
- `currentStep` — étape en cours (reprise après refresh)
- `completed` + `completedAt` — statut de complétion
- `dismissed` — bandeau masqué par l'utilisateur

Helpers purs :

- `deriveArchetype(answers)` → `LearnerArchetype` (7 archétypes)
- `computeMaturityScore(answers)` → 0..100 (remplissage + bonus)
- `deriveTags(answers)` → tags exploitables par le recommender
- `deriveProfile(answers, completed)` → `DerivedLearnerProfile` complet

Archétypes disponibles :

| Archétype                | Déclencheur                                    |
|--------------------------|------------------------------------------------|
| `exam_taker`             | objective = exam_prep                          |
| `company_learner`        | objective = company_training                   |
| `career_switcher`        | objective = career_change                      |
| `beginner_certification` | objective=certification + niveau ≤ intermédiaire |
| `autonomous_advanced`    | niveau ≥ avancé + cert=no/later                |
| `skill_worker`           | objective = professional_skill (autre)         |
| `casual`                 | Fallback                                       |

### Composants

| Fichier | Rôle |
|---------|------|
| `pages/RegisterPage.tsx` | Split-screen, RHF+Zod, account type selector, champs dynamiques, redirection par rôle |
| `pages/onboarding/LearnerOnboardingPage.tsx` | Wizard 6 étapes, progress bar, save-and-resume |
| `pages/onboarding/RecommendedCoursesPage.tsx` | Grille cours + profil summary + CTA dashboard |
| `components/onboarding/OnboardingStep.tsx` | Wrapper question (single ou multi, avec max) |
| `components/onboarding/LearnerProfileSummary.tsx` | Carte profil (archétype, score ring, chips) |
| `components/onboarding/CourseRecommendationCard.tsx` | Card cours enrichie (score, raisons, badges) |
| `components/onboarding/OnboardingBanner.tsx` | Bannière dashboard "compléter votre profil" |
| `lib/course-recommender.ts` | Moteur de scoring pur (extensible) |

### Moteur de recommandation

Fichier `frontend/src/lib/course-recommender.ts`. Fonction pure
`recommendCourses(courses, profile, level, domains, opts)` qui score et
trie les cours publics selon :

| Critère                                  | Points |
|------------------------------------------|-------:|
| Match d'un domaine (via catégorie)       |    +30 |
| Cours certifiant + apprenant veut cert   |    +25 |
| Niveau du cours match celui de l'apprenant |  +20 |
| Cours gratuit                            |    +15 |
| Populaire (>500 apprenants)              |    +10 |
| Note ≥ 4.5                                |    +10 |

Tri final : score DESC → note DESC → popularité DESC. Cours déjà suivis
exclus via `enrolledIds`.

Le moteur est **client-side** et volontairement simple — le contrat
d'entrée reste stable pour brancher un moteur IA server-side (roadmap
R25+).

### Routing

Deux nouvelles routes protégées :

- `/onboarding/learner` — `LearnerOnboardingPage`
- `/recommended-courses` — `RecommendedCoursesPage`

La redirection post-register est décidée par `postRegisterTarget()` dans
`RegisterPage.tsx` (learner → onboarding), et le fallback post-login
reste `resolvePostLoginTarget()` (helper partagé de R23).

### Sécurité & UX

- Backend `/api/auth/register/` inchangé — n'accepte que `email/password/full_name/phone`.
  Le `account_type` + `organization_name` sont stockés client (`be-register-intent`)
  pour usage front (bandeaux instructor/org, roadmap R25 pour activation admin).
- Password strength (heuristique lettres+chiffres+longueur+symboles) affichée en temps réel.
- Confirmation mot de passe obligatoire (Zod refine).
- CGU obligatoirement acceptées.
- CGU + politique de confidentialité ouverts dans un nouvel onglet.
- Aucun blocage d'accès à la plateforme si l'onboarding est incomplet :
  seul le bandeau du dashboard change ("Complétez votre profil pour recevoir
  de meilleures recommandations").

## Champs de l'onboarding

1. **Objectif principal** (single, 6 options)
2. **Domaines d'intérêt** (multi, max 5, 14 options)
3. **Niveau actuel** (single, 4 options)
4. **Disponibilité hebdomadaire** (single, 4 options)
5. **Style d'apprentissage préféré** (multi, 7 options)
6. **Intérêt certification** (single, 3 options)

## Reprise et modification

- Progression sauvegardée automatiquement à chaque changement (Zustand persist)
- Bouton « Continuer plus tard » → dismiss + retour dashboard
- Bouton « Modifier mon profil d'apprentissage » dans `LearnerProfileSummary`
  → rouvre `/onboarding/learner` au step courant
- `useLearnerProfileStore.getState().reset()` disponible pour tests / debug

## Smoke test

```bash
# Frontend
cd frontend && ./node_modules/.bin/tsc --noEmit  # 0 erreur

# Manuel
# 1. /register → sélectionner "Apprenant" → créer compte
# 2. Redirection automatique vers /onboarding/learner
# 3. Compléter les 6 étapes → redirect /recommended-courses
# 4. Vérifier profile summary + reco cours + bouton "S'inscrire"
# 5. /learn → banner masqué (onboarding complété)
# 6. Refaire un compte → cliquer "Continuer plus tard" au step 3
# 7. Aller sur /learn → banner "Terminez votre profil" step 3/6
# 8. Cliquer "Reprendre" → reprend au step 3
```

## Roadmap R25+ (non couvert)

- **Backend `/api/learner/profile/`** — persister le profil côté serveur pour multi-device
- **Backend enrollment status enrichi** avec `course_id` direct (au lieu de `course.id`)
- **Endpoint recommandation server-side** avec moteur IA (embeddings + cosine similarity)
- **Activation formateur** — demande d'élévation de rôle depuis le compte
- **Onboarding formateur & organisation** dédié (setup équipe, catalogue initial)
- **Refaire le questionnaire** depuis un onglet Profil dédié (au lieu du bouton dans le summary)
