/**
 * training-domains.ts — Les 8 domaines de formation de l'espace entreprise,
 * et les formations réelles qui les composent.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROVENANCE DU CONTENU — à lire avant de modifier
 * ─────────────────────────────────────────────────────────────────────
 *
 * `title`, `description` et `image` proviennent du tableau qui vivait en dur
 * dans `EnterprisePage.tsx` ; ils sont inchangés.
 *
 * `trainings` a été relevé sur https://formation.bestepargne.com/works/
 * (3 pages, 27 entrées dont 2 doublons). Ce sont de VRAIES formations du
 * catalogue historique, pas du contenu rédigé pour la circonstance.
 *
 * ⚠️ La RÉPARTITION des formations entre les 8 domaines est une proposition
 * déduite des intitulés, pas une donnée reprise du site : le WordPress ne
 * porte aucune taxonomie exploitable (sa liste de catégories est le jeu de
 * démonstration du thème — « Business plans », « Franchising »,
 * « Uncategorized »). Elle est donc À VALIDER par l'équipe métier. Deux
 * formations restent volontairement non rattachées, faute de rattachement
 * évident (voir UNASSIGNED en bas de fichier).
 *
 * Ce fichier ne contient AUCUN objectif pédagogique, prérequis ni programme
 * inventé. La page de détail affiche ce qui existe et renvoie vers la fiche
 * d'origine pour le reste.
 */

export interface DomainTraining {
  /** Intitulé tel qu'il apparaît sur le site d'origine. */
  title: string;
  /** Fiche détaillée sur le site historique. */
  href: string;
}

export interface TrainingDomain {
  /** Identifiant d'URL — `/entreprise/domaines/<slug>`. */
  slug: string;
  title: string;
  description: string;
  image: string;
  trainings: DomainTraining[];
}

const WORKS = 'https://formation.bestepargne.com/works';

export const TRAINING_DOMAINS: TrainingDomain[] = [
  {
    slug: 'banque-de-detail',
    title: 'Banque de détail',
    description:
      'Maîtrisez les produits bancaires, la relation client et les fondamentaux de la banque de proximité.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/dmytro-demidko-eBWzFKahEaU-unsplash-255x182.jpg',
    trainings: [
      { title: 'Masterclass bancaire', href: `${WORKS}/masterclass-bancaire` },
      {
        title: 'Connaissance client (KYC)',
        href: `${WORKS}/connaissance-client-kyc`,
      },
    ],
  },
  {
    slug: 'banque-et-operations',
    title: 'Banque et opérations',
    description:
      'Renforcez les compétences opérationnelles indispensables au fonctionnement efficace d’un établissement financier.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/cdc-_XLJy3h77cw-unsplash-255x182.jpg',
    trainings: [
      {
        title: 'Gestion de la trésorerie',
        href: `${WORKS}/gestion-de-la-tresorerie`,
      },
      { title: 'Prévention de la fraude', href: `${WORKS}/prevention-de-la-fraude` },
    ],
  },
  {
    slug: 'finance-entreprise-analyse-financiere',
    title: 'Finance d’entreprise et analyse financière',
    description:
      'Analysez la performance, les états financiers et les décisions de financement de l’entreprise.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/stephen-dawson-qwtCeJ5cLYs-unsplash-255x182.jpg',
    trainings: [
      {
        title: 'Analyse des états financiers',
        href: `${WORKS}/analyse-des-etats-financiers`,
      },
      { title: 'Finance pour non financier', href: `${WORKS}/finance-pour-non-financier` },
      {
        title: 'Évaluation des entreprises dans les marchés émergents',
        href: `${WORKS}/evaluation-des-entreprises-dans-les-marches-emergents`,
      },
    ],
  },
  {
    slug: 'gestion-des-risques-et-gouvernance',
    title: 'Gestion des risques et gouvernance',
    description:
      'Identifiez, mesurez et pilotez les risques grâce à des pratiques de gouvernance adaptées.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/Comming-Soon-CG-255x182.jpg',
    trainings: [
      {
        title: 'Les fondements du risque financier',
        href: `${WORKS}/les-fondements-du-risque-financier`,
      },
      {
        title: 'Gouvernance d’entreprise stratégique',
        href: `${WORKS}/gouvernance-dentreprise-strategique`,
      },
      {
        title: 'Maîtrise des risques de non-conformité',
        href: `${WORKS}/maitrise-des-risques-de-non-conformite`,
      },
    ],
  },
  {
    slug: 'gestion-d-actifs',
    title: 'Gestion d’actifs',
    description:
      'Développez une approche structurée de l’allocation, du suivi de portefeuille et de la performance.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/asset-m-255x182.jpg',
    trainings: [
      {
        title: 'Allocation stratégique d’actifs et gestion de portefeuille',
        href: `${WORKS}/allocation-strategique-dactifs-et-gestion-de-portefeuille`,
      },
      {
        title: 'Principes fondamentaux de la mesure de la performance',
        href: `${WORKS}/principes-fondamentaux-de-la-mesure-de-la-performance`,
      },
      {
        title: 'Attribution de performance',
        href: `${WORKS}/attribution-de-performance`,
      },
    ],
  },
  {
    slug: 'investissement-et-gestion-de-fonds',
    title: 'Investissement et gestion de fonds',
    description:
      'Approfondissez l’analyse des opportunités, la construction de fonds et les décisions d’investissement.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/asset-m-255x182.jpg',
    trainings: [
      {
        title: 'Réglementation et conformité opérationnelle pour les fonds',
        href: `${WORKS}/reglementation-et-conformite-operationnelle-pour-les-fonds`,
      },
      { title: 'Comprendre les actions', href: `${WORKS}/comprendre-les-actions` },
    ],
  },
  {
    slug: 'marches-des-capitaux-banque-investissement',
    title: 'Marchés des capitaux et banque d’investissement',
    description:
      'Comprenez le fonctionnement des marchés, des instruments et des métiers de la banque d’investissement.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/stephen-dawson-qwtCeJ5cLYs-unsplash-255x182.jpg',
    trainings: [
      {
        title: 'Introduction aux marchés financiers et à la banque d’investissement',
        href: `${WORKS}/introduction-aux-marches-financiers-et-a-la-banque-dinvestissement`,
      },
      {
        title: 'Comprendre le marché obligataire',
        href: `${WORKS}/comprendre-le-marche-obligataire`,
      },
      {
        title: 'Le marché obligataire et les contrats à terme sur obligations',
        href: `${WORKS}/le-marche-obligataire-et-les-contrats-a-terme-sur-obligations`,
      },
    ],
  },
  {
    slug: 'reglementation-et-conformite',
    title: 'Réglementation et conformité',
    description:
      'Sécurisez vos opérations en intégrant les exigences réglementaires et les dispositifs de conformité.',
    image:
      'https://formation.bestepargne.com/wp-content/uploads/2016/01/Comming-Soon-CG-255x182.jpg',
    trainings: [
      {
        title: 'Basel III & nouvelles avancées dans la réglementation',
        href: `${WORKS}/basel-iii-nouvelles-avancees-dans-la-reglementation`,
      },
      {
        title: 'Conformité et lutte contre le blanchiment des capitaux / FT',
        href: `${WORKS}/conformite-et-lutte-contre-le-blanchiment-des-capitaux-ft-ref-m02`,
      },
      { title: 'La conformité RGPD', href: `${WORKS}/la-conformite-rgpd` },
      {
        title: 'Conformité, éthique et déontologie',
        href: `${WORKS}/conformite-ethique-et-deontologie`,
      },
      { title: 'Conformité anti-corruption', href: `${WORKS}/conformite-anti-corruption` },
      {
        title: 'FATCA et CRS — les fondamentaux',
        href: `${WORKS}/fatca-etcrs-les-fondamentaux`,
      },
    ],
  },
];

/**
 * Formations relevées sur le site d'origine qu'aucun des 8 domaines ne couvre
 * de façon évidente. Conservées ici pour que l'arbitrage soit visible plutôt
 * que perdu : soit les rattacher, soit créer un neuvième domaine.
 *
 * (Vide à ce jour — les 25 formations uniques sont toutes rattachées. Le
 * doublon « Introduction aux marchés financiers » et la seconde occurrence de
 * « Comprendre les actions » ont été écartés.)
 */
export const UNASSIGNED_TRAININGS: DomainTraining[] = [];

export function findDomain(slug: string | undefined): TrainingDomain | undefined {
  return TRAINING_DOMAINS.find((d) => d.slug === slug);
}
