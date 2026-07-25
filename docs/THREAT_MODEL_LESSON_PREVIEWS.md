# Modèle de menace — aperçus multiples de leçons

## Périmètre

Ce modèle couvre uniquement l'activation de plusieurs leçons en aperçu dans un
même cours. Il n'ajoute ni endpoint, ni rôle, ni type de donnée. Le changement
supprime la désactivation automatique des autres aperçus lors de la création ou
de la mise à jour d'une leçon.

Acteurs :

- formateur ou administrateur autorisé à modifier le cours ;
- visiteur public consultant une leçon explicitement marquée `is_preview` ;
- utilisateur authentifié non propriétaire du cours.

Actifs protégés :

- contenu des leçons privées ;
- contenu des cours internes `company_only` ;
- intégrité du programme et des indicateurs `is_preview`.

Frontières de confiance :

- API instructeur authentifiée vers la base de données ;
- API publique d'aperçu vers les seules leçons explicitement publiques ;
- isolation entre cours et entre propriétaires.

## Menaces et contrôles vérifiés

| Menace | Impact | Contrôle en place | Preuve |
|---|---|---|---|
| Modification d'un aperçu par un autre formateur | Divulgation ou altération de contenu | `IsAuthenticated`, `IsInstructor` et résolution du cours par `_course_owned` | Le test `test_other_instructor_cannot_change_preview` obtient 404 et vérifie l'absence de mutation |
| Accès public à une leçon privée | Divulgation de contenu payant | L'endpoint public refuse toute leçon dont `is_preview` est faux | Le test `test_public_preview_contract_remains_per_lesson` vérifie 200 pour chaque aperçu et 403 pour la leçon privée |
| Contournement par un identifiant de leçon d'un autre cours | IDOR | La leçon est recherchée dans la section, elle-même recherchée dans le cours autorisé | Les vues instructeur conservent les filtres `section=section` et `_course_owned` |
| Publication d'un cours interne | Divulgation de contenu d'entreprise | Le contrat public existant exclut les cours `company_only`; le changement ne modifie pas cette règle | Aucun endpoint public ou contrôle `company_only` n'est modifié |
| Publication accidentelle d'autres leçons | Divulgation involontaire | Chaque leçon garde son propre booléen `is_preview`; seule la cible reçue est sauvegardée | Les tests de création, activation et désactivation vérifient l'indépendance des indicateurs |
| Saturation due à l'activation d'un aperçu | Charge base de données | Aucun nouvel endpoint ni appel externe; les deux mises à jour massives ont été supprimées | Le diff retire les `UPDATE` sur toutes les autres leçons |

## Risque résiduel

Le nombre de contenus volontairement accessibles sans inscription peut
augmenter. Ce risque est attendu par la fonctionnalité et reste sous le contrôle
explicite du formateur, leçon par leçon. Une validation visuelle authentifiée
doit être effectuée après déploiement sur un cours de test.

Les mécanismes d'authentification, de journalisation et de limitation de débit
restent ceux de la plateforme existante ; aucune nouvelle surface réseau n'est
introduite.
