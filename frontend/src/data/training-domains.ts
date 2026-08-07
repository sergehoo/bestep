/**
 * training-domains.ts — Les 8 domaines de formation de l'espace entreprise,
 * les formations qui les composent, et le contenu de chaque formation.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROVENANCE DU CONTENU — à lire avant de modifier
 * ─────────────────────────────────────────────────────────────────────
 *
 * Tout ce fichier est un RELEVÉ de https://formation.bestepargne.com,
 * recopié tel quel. Rien n'y est rédigé pour la circonstance : aucun
 * objectif, prérequis ni programme n'est inventé. Une formation dont la
 * fiche d'origine ne porte pas de contenu exploitable a `content: null`,
 * et la page de détail l'affiche alors sans programme plutôt que d'en
 * fabriquer un.
 *
 * • Le RATTACHEMENT domaine ↔ formation vient de la taxonomie réelle du
 *   site (`stm_works_category`, relevée sur les archives de catégorie).
 *   Ce n'est pas une déduction à partir des intitulés.
 *
 * • Le site ne publie que 6 catégories. « Banque de détail » et « Banque
 *   et opérations » n'en ont aucune : ces deux domaines existent sur la
 *   landing mais n'ont, à ce jour, aucune formation au catalogue.
 *
 * • Sur les 28 fiches publiées, 6 seulement portent un contenu réel ; les
 *   autres sont vides ou affichent encore le texte de démonstration anglais
 *   du thème WordPress (« Pharm Ltd. », « S&OP »), écarté ici.
 *
 * • Sur ces 6, TROIS ont un contenu qui ne correspond pas à leur intitulé
 *   (voir les commentaires « Écartée » plus bas) : elles sont publiées ici
 *   sans programme. Il reste donc 3 fiches réellement exploitables. Corriger
 *   la source puis relancer le relevé suffira à les réintégrer.
 *
 * • Écartés également : les doublons `…-2`, et `finance-pour-non-financier`
 *   qui renvoie une 404. La fiche « Finance pour non financier » est en
 *   réalité publiée sous le slug `evaluation-dentreprise`.
 *
 * Les puces du site commencent par « • » ; elles sont conservées dans le
 * texte et détectées au rendu.
 */

/** Bloc titré d'une fiche (« Objectifs », « JOUR 1 », …). */
export interface TrainingSection {
  title: string;
  lines: string[];
}

/** Contenu relevé sur la fiche d'origine, onglet par onglet. */
export interface TrainingContent {
  /** Description, Objectifs, Public concerné, Niveau, Prérequis. */
  course: TrainingSection[];
  /** Déroulé, un bloc par journée. */
  programme: TrainingSection[];
  /** Biographie du formateur, un paragraphe par entrée. */
  trainer: string[];
}

export interface DomainTraining {
  /** Identifiant d'origine, utilisé comme clé de rendu. */
  slug: string;
  title: string;
  /** `null` quand la fiche d'origine ne porte aucun contenu exploitable. */
  content: TrainingContent | null;
}

export interface TrainingDomain {
  /** Identifiant d'URL — `/entreprise/domaines/<slug>`. */
  slug: string;
  title: string;
  description: string;
  image: string;
  trainings: DomainTraining[];
}

const UPLOADS = 'https://formation.bestepargne.com/wp-content/uploads/2016/01';

export const TRAINING_DOMAINS: TrainingDomain[] = [
  {
    slug: 'banque-de-detail',
    title: 'Banque de détail',
    description:
      'Maîtrisez les produits bancaires, la relation client et les fondamentaux de la banque de proximité.',
    image: `${UPLOADS}/dmytro-demidko-eBWzFKahEaU-unsplash-255x182.jpg`,
    trainings: [
    ],
  },
  {
    slug: 'banque-et-operations',
    title: 'Banque et opérations',
    description:
      'Renforcez les compétences opérationnelles indispensables au fonctionnement efficace d’un établissement financier.',
    image: `${UPLOADS}/cdc-_XLJy3h77cw-unsplash-255x182.jpg`,
    trainings: [
    ],
  },
  {
    slug: 'finance-entreprise-analyse-financiere',
    title: 'Finance d’entreprise et analyse financière',
    description:
      'Analysez la performance, les états financiers et les décisions de financement de l’entreprise.',
    image: `${UPLOADS}/stephen-dawson-qwtCeJ5cLYs-unsplash-255x182.jpg`,
    trainings: [
      {
        slug: 'analyse-des-etats-financiers',
        title: 'Analyse des états financiers',
        content: {
          course: [
            {
              title: 'Description',
              lines: [
                'Cette formation offre une compréhension approfondie des états financiers et des outils d’analyse permettant d’évaluer la situation économique et financière d’une entreprise. Elle combine des apports théoriques avec des cas pratiques pour permettre aux participants d’acquérir les réflexes d’un analyste financier. À travers l’étude du bilan, du compte de résultat, et du tableau des flux de trésorerie, les participants apprendront à diagnostiquer la performance, détecter les signaux d’alerte, interpréter les ratios clés et formuler un jugement global sur la santé financière d’une organisation.',
                'L’analyse des états financiers est conçue pour renforcer les capacités d’interprétation et d’aide à la décision à partir des documents comptables.',
              ],
            },
            {
              title: 'Objectifs',
              lines: [
                'Comprendre le rôle de l’information financière dans la prise de décision',
                '• Eclairer les choix stratégiques, opérationnels et financiers des parties prenantes grâce à des données fiables, comparables et pertinentes issues des états financiers.',
                'Comprendre l’information financière de l’entreprise',
                '• Lecture d’un bilan, d’un compte d’exploitation et d’un tableau de trésorerie.',
                'Comprendre la structure des états financiers',
                '• Bilan, Compte d’exploitation et tableau de trésorerie.',
                'Comprendre la valorisation des éléments d’un bilan',
                '• Méthode de valorisation des Stocks, Immobilier, etc',
                'Comprendre les types de charges et produits non décaissables et leurs comptabilisation',
                '• Provisions pour créances douteuses, Provisions pour pertes latentes, Dotations d’exploitation, Reprises, etc.',
                'Maitriser l’approche et les méthodes d’analyse financière',
                '• Utiliser des outils tels que les ratios, les tableaux de flux et l’analyse des équilibres financiers pour évaluer la performance, la rentabilité et la solidité de l’entreprise.',
                'Emettre un avis sur la santé financière de l’entreprise.',
                '• Liquidité, solvabilité, effet de levier, etc.',
                'Analyser la création de valeur pour les parties prenantes',
                '• Mesurer la valeur durable en conciliant performance économique, attentes des actionnaires.',
              ],
            },
            {
              title: 'Public concerné',
              lines: [
                'Directeur Général des TPME',
                'Directeur Financier',
                'Analyste financier',
                'Contrôleur de gestion',
                'Chargés d’affaires',
                'Banques',
                'Industriels',
              ],
            },
            {
              title: 'Niveau',
              lines: [
                'Intermédiaire',
                'Avancé',
              ],
            },
            {
              title: 'Prérequis',
              lines: [
                'Connaissance en comptabilité générale.',
              ],
            },
          ],
          programme: [
            {
              title: 'JOUR 1',
              lines: [
                'INTRODUCTION SUR L’ANALYSE DES ÉTATS FINANCIERS',
                '• A quoi sert les états financiers et leur analyse ?',
                '• Comprendre le revenu modèle de l’entreprise en faisant le lien avec les états financiers.',
                'PRÉSENTATION DES 3 ÉTATS FINANCIERS : LE BILAN, LE COMPTE D’EXPLOITATION ET LE TABLEAU DE TRÉSORERIE',
                '• Présentation des principaux éléments de chacun des états financiers.',
                '• Méthode de valorisation des Stocks.',
                '• Détermination des Provisions (Créance, …)',
              ],
            },
            {
              title: 'JOUR 2',
              lines: [
                'ANALYSE DU CHIFFRE D’AFFAIRES',
                '• Détecter des situations de croissance trompeuse.',
                '• Analyse des autres composants du compte d’exploitation.',
                'ANALYSE DU BILAN',
                '• Immobilisation',
                '• Détecter des situation de déphasage sectoriel des investissements',
                '• Détecter la vétusté de l’outil industriel',
                'ANALYSE FINANCIÈRE PAR LES RATIOS',
                '• Évaluer la rentabilité économique et financière à travers les ratios de performance (ROE, ROA, marge nette).',
                '• Analyser la solvabilité et la structure financière avec les ratios d’endettement et d’autonomie financière.',
                'ANALYSE FINANCIÈRE VERTICALE',
                '• Apprécier la répartition des charges et produits en pourcentage du chiffre d’affaires.',
                '• Identifier les postes à forte contribution ou à risque dans la structure des coûts.',
                'ANALYSE FINANCIÈRE HORIZONTALE',
                '• Comparer l’évolution des postes financiers sur plusieurs exercices (croissance, stagnation, recul).',
                '• Détecter des tendances anormales ou incohérentes entre les postes liés.',
              ],
            },
          ],
          trainer: [
            'Norbert bénéficie de plus de 10 ans d’expérience dans les domaines de la finance d’entreprise, de l’analyse financière et de la stratégie d’entreprise, acquise dans des environnements multiculturels au Maroc, en Côte d’Ivoire. Sa maîtrise approfondie des sujets liés à la gestion financière, la fiscalité, le juridique, et les processus internes lui permet d’adopter une vision transversale et stratégique au sein des organisations.',
            'Au cours de sa carrière, Norbert a développé une expertise pointue en modélisation financière, valorisation d’entreprise, due diligence et négociation contractuelle, intervenant aussi bien sur le conseil en investissement que sur la gestion opérationnelle et stratégique. Son approche pragmatique s’appuie sur l’accompagnement concret des entreprises et entrepreneurs dans leurs levées de fonds, la structuration de business models et la mise en place de systèmes de pilotage performants.',
            'Son expérience récente à la tête de la direction financière et support d’une filiale africaine d’un groupe marocain diversifié lui confère une compréhension fine des enjeux liés à la gestion multisectorielle et transfrontalière. Norbert s’appuie sur une forte capacité à fédérer les équipes autour des objectifs financiers et opérationnels, en intégrant les dimensions réglementaires, fiscales et humaines.',
            'Son parcours professionnel est marqué par des missions variées, combinant conseil, analyse stratégique et gestion de projets complexes, auprès d’acteurs majeurs du secteur financier et immobilier en Afrique.',
          ],
        },
      },
      {
        slug: 'evaluation-dentreprise',
        title: 'Finance pour non financier',
        // Écartée : titre et H1 d’origine annoncent « Finance pour non financier », le contenu traite de l’évaluation d’entreprise.
        content: null,
      },
      {
        slug: 'evaluation-des-entreprises-dans-les-marches-emergents',
        title: 'Évaluation des entreprises dans les marchés émergents',
        content: null,
      },
    ],
  },
  {
    slug: 'gestion-des-risques-et-gouvernance',
    title: 'Gestion des risques et gouvernance',
    description:
      'Identifiez, mesurez et pilotez les risques grâce à des pratiques de gouvernance adaptées.',
    image: `${UPLOADS}/Comming-Soon-CG-255x182.jpg`,
    trainings: [
      {
        slug: 'gouvernance-dentreprise-strategique',
        title: 'Gouvernance d’entreprise stratégique',
        content: null,
      },
      {
        slug: 'les-fondements-du-risque-financier',
        title: 'Les fondements du risque financier',
        // Écartée : la fiche d’origine contient intégralement le contenu d’« Attribution de performance ».
        content: null,
      },
    ],
  },
  {
    slug: 'gestion-d-actifs',
    title: 'Gestion d’actifs',
    description:
      'Développez une approche structurée de l’allocation, du suivi de portefeuille et de la performance.',
    image: `${UPLOADS}/asset-m-255x182.jpg`,
    trainings: [
      {
        slug: 'comprendre-les-actions',
        title: 'Comprendre les actions',
        content: null,
      },
    ],
  },
  {
    slug: 'investissement-et-gestion-de-fonds',
    title: 'Investissement et gestion de fonds',
    description:
      'Approfondissez l’analyse des opportunités, la construction de fonds et les décisions d’investissement.',
    image: `${UPLOADS}/asset-m-255x182.jpg`,
    trainings: [
      {
        slug: 'allocation-strategique-dactifs-et-gestion-de-portefeuille',
        title: 'Allocation stratégique d’actifs et gestion de portefeuille',
        // Écartée : la fiche d’origine contient intégralement le contenu d’« Attribution de performance ».
        content: null,
      },
      {
        slug: 'attribution-de-performance',
        title: 'Attribution de performance',
        content: {
          course: [
            {
              title: 'Description',
              lines: [
                'L’attribution de performance est un outil clé pour analyser et expliquer la rentabilité d’un portefeuille par rapport à son benchmark. Cette formation vous apportera une compréhension approfondie des méthodologies et des techniques utilisées pour évaluer les décisions d’investissement, identifier les sources de rendement excédentaire et mesurer l’impact des choix stratégiques du gestionnaire.',
                'Grâce à une approche pragmatique, basée sur des études de cas et des données réelles, vous apprendrez à interpréter les résultats d’attribution et à les utiliser pour suivre et optimiser vos décisions d’investissement. La formation mettra également en lumière les différentes méthodes d’attribution selon le type de gestion (active, passive, multi-actifs) et les perspectives d’analyse (performance absolue, ajustée au risque, allocation stratégique).',
              ],
            },
            {
              title: 'Objectifs',
              lines: [
                'Concepts attribution des performances',
                '• Comprendre les concepts fondamentaux de l’attribution et comment ils sont appliqués.',
                '• Apprenez les critères pour choisir des systèmes d’attribution de performance.',
                'Attribution Action',
                '• Etudier les différences entre les deux modèles de “Brinson”.',
                '• Comprendre les différents effets et comment ils sont calculés.',
                'Attribution multidevise',
                '• Comprendre les principales différences entre l’attribution naïve des devises et le modèle de Karnosky-Singer.',
                '• Apprécier les exigences de base du Karnosky-Singer.',
                'Attribution multi-périodes',
                '• Comprendre pourquoi l’attribution arithmétique nécessite l’utilisation d’un modèle de liaison pour avoir des résultats sur une longue période.',
                '• Explorez les modèles les plus courants.',
                'Attribution arithmétique ou géométrique',
                '• Apprécier les différences entre ces deux approches, ainsi que des avantages et des inconvénients de chacune.',
                'Attribution basée sur positions vs Attribution basée sur les transactions',
                '• Apprenez les principales différences entre ces deux approches.',
                '• Se familiariser avec les inconvénients souvent négligés du modèle basé sur les Positions.',
                'Applicabilité',
                '•Comprendre le rôle fondamental de l’attribution et comment sa mise en œuvre peut varier, en fonction du type de gestion.',
              ],
            },
            {
              title: 'Public concerné',
              lines: [
                'Opérations Gestionnaires de fonds',
                'Gestion de portefeuille',
                'Responsable des investissements',
                'Ventes et recherche d’actions',
                'Les fonds de pension',
                'Assurance',
                'Banque',
                'Investisseurs institutionnels',
              ],
            },
            {
              title: 'Niveau',
              lines: [
                'Intermédiaire',
                'Avancé',
              ],
            },
            {
              title: 'Prérequis',
              lines: [
                'Il n’y a pas de prérequis pour ce cours (bien que nous vous recommandons de suivre le cours les Principes fondamentaux de la mesure de la performance), et aucune préparation n’est requise.',
              ],
            },
          ],
          programme: [
            {
              title: 'JOUR 1',
              lines: [
                'CONCEPTS D’ATTRIBUTION DE PERFORMANCE',
                '• Qu’est-ce que l’attribution de performances et comment est-elle utilisée ?',
                'CONTRIBUTION',
                '• Une forme d’attribution absolue.',
                'ATTRIBUTION ACTION',
                '• Les deux premières lois d’attribution.',
                '• Une revue des modèles actions les plus courants : Brinson Hood Beebower et Brinson-Fachler.',
                'GÉOMÉTRIQUE VS. ARITHMÉTIQUE',
                '• Quelle est la différence?',
                '• Application avec le modele de Brinson-Fachler.',
                'POSITIONS VS. TRANSACTIONS',
                '• En quoi diffèrent-elles ?',
                '• Avantages et inconvénients de chacune.',
                'ATTRIBUTION OBLIGATAIRE',
                '• Concepts des produits de taux, pourquoi les modèles actions ne fonctionnent pas pour les obligations.',
                '• Revoir les différents modèles sur les produits de taux.',
                'ATTRIBUTION MULTI PRODUITS',
                '• Mettre ensemble Action et Produits de taux.',
              ],
            },
            {
              title: 'JOUR 2',
              lines: [
                'ATTRIBUTION DE DEVISES',
                '• Revoir les differentes approches d’attribution, y compris le model de Karnosky-Singer.',
                'ATTRIBUTION MULTI NIVEAUX',
                '• Revoir les approches courantes.',
                'AUTRES TYPE D’ ATTRIBUTION',
                '• Autres moyens d’obtenir des informations sur les sources de rendement.',
                'ATTRIBUTION MULTI PERIODES',
                '• La troisième loi d’attribution',
                '• Approches combiner des effets dans le temps, y compris les approches Cariño (logarithmique) et Menchero (optimisée).',
                'ATTRIBUTION POUR SPONSORS DE PLANS',
                '• Attribution Macro et Multi niveaux.',
                'AUTRES FACTEURS A CONSIDERER',
                '• Quotidien vs Mensuel /Secteurs vs. Titres.',
                'ATTRIBUTION DES HEGDE FUNDS',
                '• Pourquoi c’est différent et comment la produire.',
                'UTILISATION DES RÉSULTATS',
                '• Comment utiliser ce que les modèles fournissent.',
                'TROUVER UN SYSTÈME D’ATTRIBUTION',
                '• Les besoins particuliers de l’attribution.',
                'L’AVENIR DE L’ATTRIBUTION',
                '• À quoi s’attendre ?',
              ],
            },
          ],
          trainer: [
            'Stéphane possède plus de 15 ans d’expérience dans le secteur de la gestion d’actifs, de la gestion des risques, ainsi que dans la mesure et l’attribution de performance. Il a débuté sa carrière en tant qu’analyste de performance sur les actions chez BNP Paribas à Paris, avant de se spécialiser dans les produits de taux à Édimbourg chez Aegon Asset Management, puis dans les produits multi-actifs chez Columbia Threadneedle Investments à Londres. Par la suite, il s’est orienté vers la gestion des risques et occupe actuellement un poste de gestionnaire de risque en investissement au sein d’une banque d’investissement à Londres.',
            'Les modules de formation qu’il propose reposent sur une approche pédagogique unique, enrichie par son expérience professionnelle. Il met l’accent sur l’utilisation d’études de cas basées sur des données réelles et brutes, des conseils pratiques sur les systèmes, ainsi qu’une approche bienveillante, adaptée aux besoins et au niveau d’expérience des participants, dans des domaines souvent complexes.',
            'Stéphane a principalement dispensé ses formations auprès de sociétés de gestion. Il a notamment animé le séminaire de formation en finance de marché du CRRAE UMOA, axé sur la mesure et l’attribution de performance, en utilisant aussi bien des salles de classe physiques que des formats virtuels.',
          ],
        },
      },
      {
        slug: 'principes-fondamentaux-de-la-mesure-de-la-performance',
        title: 'Principes fondamentaux de la mesure de la performance',
        content: {
          course: [
            {
              title: 'Description',
              lines: [
                'La mesure de la performance des investissements est la quantification des résultats obtenus après l’exécution d’une stratégie de gestion. La mesure de la performance aide ainsi les investisseurs à suivre le processus de réalisation des objectifs d’investissement fixés, mais aussi de le modifier en cas d’écart par rapport à la stratégie initiale.',
                'Face à la compétition de plus en plus accrue dans l’industrie de l’investissement, savoir mesurer la performance de ses actifs permet de facilement les comparer entre eux, avec d’autres actifs et par rapport à d’autres acteurs.',
                'La mesure de performance est essentielle pour les gestionnaires de portefeuille, les analystes et les investisseurs.',
              ],
            },
            {
              title: 'Objectifs',
              lines: [
                'Concepts de la mesure de performance',
                '• Développer une base solide sur ce qu’est la mesure de la performance.',
                'Calculs du taux de rendement',
                '• Apprendre les différentes formules pour calculer la performance, comprendre l’impact des flux entrants et sortant sur le taux de rendement.',
                '• Apprendre les liaisons géométriques et l’annualisation.',
                'Indice de référence',
                '• Obtenez des informations sur les principaux Indices de référence en mesure de performances (indices, peer groupe, absolu, et customisé) et leur importance.',
                'Mesure du risque',
                '• Apprenez l’importance de la mesure du risque et les différentes formules disponibles.',
                'Attribution de performance',
                '• Développer et une comprendre l’attribution de performance.',
                'Présentation des performances – (GIPS)',
                '• Acquérir des connaissances fondamentales sur les normes internationales de mesure de performance des investissements, son histoire, ses nombreux concepts et exigences.',
              ],
            },
            {
              title: 'Public concerné',
              lines: [
                'Opérations',
                'Gestionnaires de fonds',
                'Gestion de portefeuille',
                'Responsable des investissements',
                'Ventes et recherche d’actions',
                'Les fonds de pension',
                'Assurance – Banque',
                'Investisseurs institutionnels',
              ],
            },
            {
              title: 'Niveau',
              lines: [
                'Débutant',
              ],
            },
            {
              title: 'Prérequis',
              lines: [
                'Il n’y a pas de prérequis pour cette formation et aucune préparation n’est requise.',
                'Cette Formation est enseignée au niveau basique.',
              ],
            },
          ],
          programme: [
            {
              title: 'JOUR 1',
              lines: [
                'RAPPEL',
                '• Qu’est-ce que la mesure de performance ?',
                '• Histoire brève de la mesure de performance',
                'RENDEMENTS',
                '• Pondération temporelle et pondération monétaire',
                '• Taux de rendement interne',
                '• Mi période et Dietz modifiée',
                '• Méthode de la valeur unitaire',
                '• Rendements quotidiens',
                '• Liaison géométrique',
                '• Annualisation',
                'BENCHMARKS',
                '• Absolu, Indice de marché et peer groups',
                '• Avantages et inconvénients',
                'RISQUE',
                '• Qu’est-ce que le risque ?',
                '• Révisons des indicateurs de risques les plus utilisés, y compris l’écart type, le ratio de Sharpe, le ratio de Treynor, le ratio d’information, le Tracking Error, et la VAR',
                '• Surveillance et gestion des risques',
              ],
            },
            {
              title: 'JOUR 2',
              lines: [
                'ATTRIBUTION',
                '• Les trois lois d’attribution',
                '• Les modèles Brinson Hood Beebower et BrinsonFachler',
                '• Attribution de devise',
                '• Arithmétique vs. Géométrique',
                '• Attribution multi-périodes',
                '• Attribution de produits de taux',
                'PERFORMANCE PRESENTATION STANDARDS',
                '• Revue des Normes (GIPS) Global Investment Performance Standards',
                '• Construction composite',
                '• Calculs',
                '• Discrétion',
                '• Points de confusion',
                'L’ORGANISATION DES EQUIPE DE MESURE DE LA PERFORMANCE',
                '• Caractéristiques du personnel/de l’organisation/tendances/Métier',
              ],
            },
          ],
          trainer: [
            'Stéphane possède plus de 15 ans d’expérience dans le secteur de la gestion d’actifs, de la gestion des risques, ainsi que dans la mesure et l’attribution de performance. Il a débuté sa carrière en tant qu’analyste de performance sur les actions chez BNP Paribas à Paris, avant de se spécialiser dans les produits de taux à Édimbourg chez Aegon Asset Management, puis dans les produits multi-actifs chez Columbia Threadneedle Investments à Londres. Par la suite, il s’est orienté vers la gestion des risques et occupe actuellement un poste de gestionnaire de risque en investissement au sein d’une banque d’investissement à Londres.',
            'Les modules de formation qu’il propose reposent sur une approche pédagogique unique, enrichie par son expérience professionnelle. Il met l’accent sur l’utilisation d’études de cas basées sur des données réelles et brutes, des conseils pratiques sur les systèmes, ainsi qu’une approche bienveillante, adaptée aux besoins et au niveau d’expérience des participants, dans des domaines souvent complexes.',
            'Stéphane a principalement dispensé ses formations auprès de sociétés de gestion. Il a notamment animé le séminaire de formation en finance de marché du CRRAE UMOA, axé sur la mesure et l’attribution de performance, en utilisant aussi bien des salles de classe physiques que des formats virtuels.',
          ],
        },
      },
    ],
  },
  {
    slug: 'marches-des-capitaux-banque-investissement',
    title: 'Marchés des capitaux et banque d’investissement',
    description:
      'Comprenez le fonctionnement des marchés, des instruments et des métiers de la banque d’investissement.',
    image: `${UPLOADS}/stephen-dawson-qwtCeJ5cLYs-unsplash-255x182.jpg`,
    trainings: [
      {
        slug: 'comprendre-le-marche-obligataire',
        title: 'Comprendre le marché obligataire',
        content: null,
      },
      {
        slug: 'comprendre-les-actions',
        title: 'Comprendre les actions',
        content: null,
      },
      {
        slug: 'gestion-de-la-tresorerie',
        title: 'Gestion de la trésorerie',
        content: null,
      },
      {
        slug: 'introduction-aux-marches-financiers-et-a-la-banque-dinvestissement',
        title: 'Introduction aux marchés financiers et à la banque d’investissement',
        content: null,
      },
      {
        slug: 'le-marche-obligataire-et-les-contrats-a-terme-sur-obligations',
        title: 'Le marché obligataire et les contrats à terme sur obligations',
        content: null,
      },
      {
        slug: 'masterclass-bancaire',
        title: 'Masterclass bancaire',
        content: null,
      },
      {
        slug: 'reglementation-des-operations-de-financement-des-valeurs-mobilieres',
        title: 'Réglementation des opérations de financement des valeurs mobilières',
        content: null,
      },
    ],
  },
  {
    slug: 'reglementation-et-conformite',
    title: 'Réglementation et conformité',
    description:
      'Sécurisez vos opérations en intégrant les exigences réglementaires et les dispositifs de conformité.',
    image: `${UPLOADS}/Comming-Soon-CG-255x182.jpg`,
    trainings: [
      {
        slug: 'basel-iii-nouvelles-avancees-dans-la-reglementation',
        title: 'Basel III & nouvelles avancées dans la réglementation',
        content: null,
      },
      {
        slug: 'conformite-anti-corruption',
        title: 'Conformité anti-corruption',
        content: null,
      },
      {
        slug: 'conformite-et-lutte-contre-le-blanchiment-des-capitaux-ft-ref-m02',
        title: 'Conformité et lutte contre le blanchiment des capitaux / FT',
        content: null,
      },
      {
        slug: 'conformite-ethique-et-deontologie',
        title: 'Conformité, éthique et déontologie',
        content: null,
      },
      {
        slug: 'connaissance-client-kyc',
        title: 'Connaissance client (KYC)',
        content: null,
      },
      {
        slug: 'fatca-etcrs-les-fondamentaux',
        title: 'FATCA et CRS — les fondamentaux',
        content: null,
      },
      {
        slug: 'la-conformite-rgpd',
        title: 'La conformité RGPD',
        content: null,
      },
      {
        slug: 'maitrise-des-risques-de-non-conformite',
        title: 'Maîtrise des risques de non-conformité',
        content: null,
      },
      {
        slug: 'prevention-de-la-fraude',
        title: 'Prévention de la fraude',
        content: null,
      },
      {
        slug: 'reglementation-et-conformite-operationnelle-pour-les-fonds',
        title: 'Réglementation et conformité opérationnelle pour les fonds',
        content: null,
      },
    ],
  },
];

export function findDomain(slug: string | undefined): TrainingDomain | undefined {
  return TRAINING_DOMAINS.find((d) => d.slug === slug);
}
