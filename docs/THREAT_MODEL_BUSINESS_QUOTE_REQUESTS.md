# Modèle de menace — demandes de devis entreprise

## Périmètre

Le formulaire public de la page Entreprise transmet des coordonnées
professionnelles et un besoin de formation à l’API
`POST /api/public/business-interest-requests/`. Les demandes sont consultables
et modifiables uniquement dans l’espace administrateur plateforme.

## Données sensibles

- identité et fonction du contact ;
- e-mail et téléphone professionnels ;
- organisation, localisation, effectif, budget indicatif et besoin exprimé ;
- notes de suivi internes et identité de l’administrateur ayant traité la
  demande.

## Menaces et contrôles

| Menace | Risque | Contrôle implémenté | Preuve |
| --- | --- | --- | --- |
| Cookie de session déjà présent | rejet CSRF injustifié d’un formulaire volontairement public | aucune classe d’authentification sur la seule vue de création publique ; la session éventuelle est ignorée | test avec contrôle CSRF actif et session existante |
| Soumission automatisée / spam | saturation de la file | limite de 5 soumissions anonymes par heure et champ leurre invisible | réglage `business_quote`, tests de rejet |
| Payload invalide ou surdimensionné | données incohérentes, abus de stockage | validation stricte des formats, longueurs et bornes ; consentement obligatoire | tests paramétrés API |
| Lecture des prospects par un visiteur ou utilisateur standard | fuite de données personnelles | aucun endpoint public de lecture ; endpoints admin protégés par `IsPlatformAdmin` | tests 401/403/200 |
| Modification du statut par un acteur non autorisé | corruption du suivi commercial | même permission sur le détail et le `PATCH` | test de permission et sérialiseur limité |
| Exposition des notes dans la réponse publique | fuite d’informations internes | réponse publique réduite à référence, état de réception et confirmation | assertion exacte sur les clés |
| Perte de traçabilité | traitement non attribuable | statut à choix fermé, `processed_by`, `processed_at`, `updated_at` et notes internes | test de traitement admin |
| Demande silencieuse | absence de traitement | notification interne créée pour chaque administrateur plateforme actif | test d’intégration notification |

## Risques résiduels

- Le throttling limite les abus simples mais ne remplace pas un dispositif
  anti-spam distribué. Une protection WAF/CAPTCHA pourra être ajoutée si le
  volume d’abus le justifie.
- Les données sont conservées sans politique d’expiration automatisée dans ce
  lot. La durée de conservation doit être alignée sur la politique de
  confidentialité de l’organisation.
- L’envoi d’e-mail aux administrateurs n’est pas activé : la notification est
  interne à la plateforme afin d’éviter un effet externe non demandé.

## Retour arrière

Retirer les routes API et les écrans ajoutés, puis inverser la migration
`organizations.0006_business_interest_workflow`. Les anciennes colonnes du
modèle `BusinessInterestRequest` restent compatibles, ce qui permet un retour à
l’ancien fonctionnement sans supprimer les demandes historiques.
