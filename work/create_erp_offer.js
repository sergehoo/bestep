const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Proposition préparée pour OLIVE DANAROY';
pptx.company = 'OLIVE DANAROY';
pptx.subject = 'Offre technique et financière — ERP de gestion intégré';
pptx.title = 'ERP de gestion intégré — OLIVE DANAROY';
pptx.lang = 'fr-FR';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'fr-FR'
};
pptx.defineLayout({ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'CUSTOM_WIDE';

const C = {
  green: '234E2B',
  green2: '397443',
  olive: '9DB43B',
  yellow: 'E9D928',
  ink: '17251C',
  slate: '526159',
  mist: 'F3F7F3',
  pale: 'E6EFE7',
  white: 'FFFFFF',
  line: 'D8E3D9',
  lightText: 'EAF2EB',
  amber: 'D69A22',
  red: 'C45B4D',
  teal: '2A7F78'
};

const logo = '/Users/ogahserge/Documents/best_epargne/work/source_unpacked/ppt/media/image5.png';
const coverPhoto = '/Users/ogahserge/Documents/best_epargne/work/source_unpacked/ppt/media/image2.jpg';
const restaurantPhoto = '/Users/ogahserge/Documents/best_epargne/work/source_unpacked/ppt/media/image51.png';
const constructionPhoto = '/Users/ogahserge/Documents/best_epargne/work/source_unpacked/ppt/media/image11.jpeg';

const shadow = () => ({ type: 'outer', color: '000000', blur: 2, angle: 45, distance: 1, opacity: 0.12 });

function addFooter(slide, no, dark = false) {
  const color = dark ? 'D8E5DA' : '718078';
  slide.addText('OFFRE ERP • OLIVE DANAROY • JUILLET 2026', {
    x: 0.6, y: 7.12, w: 5.3, h: 0.17, fontFace: 'Aptos', fontSize: 8.5,
    color, charSpacing: 1.2, margin: 0
  });
  slide.addText(String(no).padStart(2, '0'), {
    x: 12.2, y: 7.08, w: 0.52, h: 0.22, fontFace: 'Aptos Display', fontSize: 9,
    color, bold: true, align: 'right', margin: 0
  });
}

function addHeader(slide, kicker, title, subtitle, no, dark = false) {
  const titleColor = dark ? C.white : C.ink;
  const subColor = dark ? 'D6E5D8' : C.slate;
  slide.addText(kicker.toUpperCase(), {
    x: 0.65, y: 0.38, w: 3.7, h: 0.2, fontSize: 9.5, bold: true,
    color: dark ? C.yellow : C.green2, charSpacing: 1.8, margin: 0
  });
  slide.addText(title, {
    x: 0.65, y: 0.7, w: 12.05, h: 0.48, fontSize: 28, bold: true,
    fontFace: 'Aptos Display', color: titleColor, margin: 0, breakLine: false
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.66, y: 1.2, w: 11.8, h: 0.35, fontSize: 12.5,
      color: subColor, margin: 0
    });
  }
  addFooter(slide, no, dark);
}

function addPill(slide, text, x, y, w, fill = C.pale, color = C.green) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h: 0.34, rectRadius: 0.08,
    fill: { color: fill }, line: { color: fill }
  });
  slide.addText(text, {
    x: x + 0.08, y: y + 0.07, w: w - 0.16, h: 0.16, fontSize: 9.5,
    bold: true, color, align: 'center', margin: 0, fit: 'shrink'
  });
}

function addIcon(slide, letters, x, y, color = C.green, size = 0.52) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x, y, w: size, h: size, fill: { color }, line: { color }
  });
  slide.addText(letters, {
    x, y: y + size * 0.23, w: size, h: size * 0.28, margin: 0,
    fontSize: size * 18, bold: true, color: C.white, align: 'center', valign: 'mid'
  });
}

function addCard(slide, x, y, w, h, title, body, opts = {}) {
  const fill = opts.fill || C.white;
  const line = opts.line || C.line;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fill }, line: { color: line, width: opts.lineWidth || 0.8 },
    shadow: opts.noShadow ? undefined : shadow()
  });
  if (opts.icon) addIcon(slide, opts.icon, x + 0.22, y + 0.22, opts.iconColor || C.green, opts.iconSize || 0.5);
  const tx = opts.icon ? x + 0.86 : x + 0.24;
  const tw = opts.icon ? w - 1.08 : w - 0.48;
  slide.addText(title, {
    x: tx, y: y + 0.23, w: tw, h: 0.28, fontSize: opts.titleSize || 14.5,
    bold: true, color: opts.titleColor || C.ink, margin: 0, fit: 'shrink'
  });
  if (body) slide.addText(body, {
    x: x + 0.24, y: y + 0.68, w: w - 0.48, h: h - 0.88,
    fontSize: opts.bodySize || 11.2, color: opts.bodyColor || C.slate,
    margin: 0, breakLine: false, valign: 'top', fit: 'shrink'
  });
}

function addBullets(slide, items, x, y, w, h, opts = {}) {
  const runs = [];
  items.forEach((item, i) => {
    runs.push({ text: item, options: { bullet: { indent: 14 }, hanging: 3, breakLine: i < items.length - 1 } });
  });
  slide.addText(runs, {
    x, y, w, h, margin: 0, fontSize: opts.fontSize || 12,
    color: opts.color || C.slate, paraSpaceAfterPt: opts.spaceAfter || 6,
    breakLine: false, fit: 'shrink', valign: 'top'
  });
}

function addMetric(slide, x, y, w, value, label, color = C.green, labelColor = C.slate) {
  slide.addText(value, {
    x, y, w, h: 0.56, fontSize: 30, bold: true, color, margin: 0,
    fontFace: 'Aptos Display', fit: 'shrink'
  });
  slide.addText(label, {
    x, y: y + 0.57, w, h: 0.3, fontSize: 10.5, color: labelColor, margin: 0,
    fit: 'shrink'
  });
}

function addFlowArrow(slide, x, y, w, color = C.olive) {
  slide.addShape(pptx.ShapeType.chevron, {
    x, y, w, h: 0.38, fill: { color, transparency: 8 }, line: { color }
  });
}

// 1 — Couverture
{
  const slide = pptx.addSlide();
  slide.background = { color: C.ink };
  slide.addImage({ path: coverPhoto, x: 6.35, y: 0, w: 6.98, h: 7.5 });
  slide.addShape(pptx.ShapeType.rect, {
    x: 5.6, y: 0, w: 7.73, h: 7.5,
    fill: { color: C.ink, transparency: 48 }, line: { color: C.ink, transparency: 100 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 7.25, h: 7.5,
    fill: { color: C.ink }, line: { color: C.ink }
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.64, y: 0.46, w: 2.04, h: 1.7, rectRadius: 0.06,
    fill: { color: C.white, transparency: 6 }, line: { color: C.white, transparency: 100 }
  });
  slide.addImage({ path: logo, x: 0.76, y: 0.58, w: 1.8, h: 1.46, transparency: 0 });
  addPill(slide, 'PROPOSITION TECHNIQUE & FINANCIÈRE', 0.72, 2.18, 3.12, C.green2, C.white);
  slide.addText('ERP DE GESTION\nINTÉGRÉ', {
    x: 0.72, y: 2.78, w: 5.85, h: 1.5, fontFace: 'Aptos Display',
    fontSize: 38, bold: true, color: C.white, margin: 0, breakLine: false,
    valign: 'mid'
  });
  slide.addText('Une plateforme unique pour piloter les projets, les ventes, les opérations et la rentabilité de toutes les activités d’OLIVE DANAROY.', {
    x: 0.74, y: 4.55, w: 5.25, h: 0.82, fontSize: 16, color: C.lightText,
    margin: 0, breakLine: false, fit: 'shrink'
  });
  slide.addText('PRÉPARÉ POUR', { x: 0.74, y: 5.83, w: 1.5, h: 0.2, fontSize: 8.5, bold: true, color: C.yellow, charSpacing: 1.8, margin: 0 });
  slide.addText('OLIVE DANAROY SARLU', { x: 0.74, y: 6.1, w: 3.8, h: 0.3, fontSize: 16, bold: true, color: C.white, margin: 0 });
  slide.addText('16 juillet 2026 • Abidjan, Côte d’Ivoire', { x: 0.74, y: 6.48, w: 4.0, h: 0.25, fontSize: 10.5, color: 'BCCABD', margin: 0 });
  slide.addText('DOCUMENT DE TRAVAIL — VALIDITÉ 30 JOURS', { x: 8.35, y: 6.94, w: 4.25, h: 0.2, fontSize: 8.5, bold: true, color: C.white, align: 'right', charSpacing: 1.3, margin: 0 });
}

// 2 — Synthèse
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Décision', 'Synthèse de l’offre', 'Un ERP modulaire, déployé par étapes, avec un pilotage financier consolidé.', 2);
  addCard(slide, 0.65, 1.8, 7.1, 2.15, 'Objectif prioritaire', 'Remplacer les fichiers dispersés et les suivis manuels par une base de données commune, des circuits de validation et des tableaux de bord fiables pour chaque activité.', { icon: '01', iconColor: C.green2, titleSize: 18, bodySize: 14 });
  slide.addShape(pptx.ShapeType.roundRect, { x: 8.05, y: 1.8, w: 4.62, h: 2.15, rectRadius: 0.08, fill: { color: C.green }, line: { color: C.green }, shadow: shadow() });
  slide.addText('36,85 M FCFA', { x: 8.4, y: 2.22, w: 3.9, h: 0.62, fontSize: 31, bold: true, color: C.white, align: 'center', margin: 0 });
  slide.addText('BUDGET FORFAITAIRE INDICATIF • HT', { x: 8.37, y: 2.98, w: 4, h: 0.25, fontSize: 9.5, bold: true, color: C.yellow, align: 'center', charSpacing: 1, margin: 0 });
  slide.addText('Hors hébergement, support récurrent et services tiers.', { x: 8.45, y: 3.4, w: 3.85, h: 0.25, fontSize: 10.5, color: C.lightText, align: 'center', margin: 0 });
  const metrics = [
    ['24 semaines', 'cadrage jusqu’à la mise en production'],
    ['50 utilisateurs', 'hypothèse de dimensionnement initial'],
    ['5 sites', 'siège et implantations opérationnelles'],
    ['4 semaines', 'd’accompagnement renforcé après lancement']
  ];
  metrics.forEach((m, i) => {
    const x = 0.75 + i * 3.1;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 4.42, w: 2.82, h: 1.72, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line }, shadow: shadow() });
    addMetric(slide, x + 0.24, 4.72, 2.34, m[0], m[1], i === 0 ? C.green : C.green2);
  });
  slide.addText('RECOMMANDATION', { x: 0.75, y: 6.48, w: 1.5, h: 0.18, fontSize: 8.5, bold: true, color: C.amber, charSpacing: 1.4, margin: 0 });
  slide.addText('Lancer d’abord le socle commun et le BTP, puis activer les modules restaurant, salles et lavage auto sur la même plateforme.', { x: 2.3, y: 6.43, w: 10.1, h: 0.3, fontSize: 12.5, color: C.ink, bold: true, margin: 0 });
}

// 3 — Périmètre activités
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Périmètre', 'Toutes les activités réunies dans un seul système', 'Le socle commun évite les doubles saisies tout en conservant les processus propres à chaque métier.', 3);
  const activities = [
    ['BTP', 'Chantiers, budgets, sous-traitance', 'BT'],
    ['Communication', 'Création, production, campagnes', 'CM'],
    ['Informatique', 'Matériels, logiciels, SAV', 'IT'],
    ['Bureautique', 'Mobilier, consommables, stock', 'BU'],
    ['Transport', 'Flotte, missions, livraisons', 'TR'],
    ['Restaurant', 'Caisse, cuisine, recettes, stock', 'RE'],
    ['Salles', 'Calendrier, réservation, acomptes', 'EV'],
    ['Lavage auto', 'Tickets, files, forfaits, abonnements', 'LA'],
    ['Traiteur', 'Devis, menus, production, événement', 'TC'],
    ['Résidences', 'Réservations, séjours, facturation', 'RS']
  ];
  activities.forEach((a, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const x = 0.68 + col * 2.54, y = 1.78 + row * 2.16;
    addCard(slide, x, y, 2.27, 1.77, a[0], a[1], { icon: a[2], iconSize: 0.46, titleSize: 13.2, bodySize: 10.5, iconColor: row === 0 ? C.green : C.green2 });
  });
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.68, y: 6.2, w: 12.02, h: 0.55, rectRadius: 0.05, fill: { color: C.pale }, line: { color: C.pale } });
  slide.addText('Un référentiel partagé : clients • fournisseurs • articles • collaborateurs • caisses • banques • centres de coûts • documents', { x: 0.96, y: 6.38, w: 11.48, h: 0.18, fontSize: 11.5, bold: true, color: C.green, align: 'center', margin: 0 });
}

// 4 — Vision intégrée
{
  const slide = pptx.addSlide();
  slide.background = { color: C.ink };
  addHeader(slide, 'Cible', 'Une donnée saisie une fois, exploitée partout', 'Chaque opération métier alimente automatiquement la trésorerie, la comptabilité et les indicateurs de gestion.', 4, true);
  const left = [
    ['BT', 'Chantier'], ['RE', 'Restaurant'], ['EV', 'Événement'], ['TR', 'Transport'], ['LA', 'Lavage auto']
  ];
  left.forEach((a, i) => {
    const y = 1.82 + i * 0.93;
    addIcon(slide, a[0], 0.83, y, i % 2 ? C.green2 : C.olive, 0.54);
    slide.addText(a[1], { x: 1.55, y: y + 0.13, w: 1.55, h: 0.2, fontSize: 12.5, bold: true, color: C.white, margin: 0 });
    addFlowArrow(slide, 3.18, y + 0.08, 0.52, '6A8D6E');
  });
  slide.addShape(pptx.ShapeType.roundRect, { x: 4.05, y: 1.72, w: 4.9, h: 4.85, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.white }, shadow: shadow() });
  slide.addImage({ path: logo, x: 5.55, y: 1.98, w: 1.9, h: 1.55 });
  slide.addText('ERP OLIVE DANAROY', { x: 4.7, y: 3.65, w: 3.6, h: 0.35, fontSize: 20, bold: true, color: C.green, align: 'center', margin: 0 });
  const core = ['CRM & ventes', 'Achats & stock', 'Finance & caisses', 'RH & temps', 'Documents & validations', 'Tableaux de bord'];
  core.forEach((t, i) => {
    const x = 4.48 + (i % 2) * 2.1, y = 4.25 + Math.floor(i / 2) * 0.62;
    addPill(slide, t, x, y, 1.85, i % 2 ? 'E9F1E9' : 'EFF4DA', C.green);
  });
  const right = [
    ['DG', 'Direction'], ['FI', 'Finance'], ['OP', 'Opérations'], ['CL', 'Clients']
  ];
  right.forEach((a, i) => {
    const y = 2.15 + i * 1.05;
    addFlowArrow(slide, 9.32, y + 0.1, 0.5, '6A8D6E');
    addIcon(slide, a[0], 10.12, y, C.green2, 0.58);
    slide.addText(a[1], { x: 10.88, y: y + 0.15, w: 1.45, h: 0.2, fontSize: 12.5, bold: true, color: C.white, margin: 0 });
  });
}

// 5 — Socle fonctionnel
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Fonctionnel', 'Socle transversal de l’ERP', 'Les fonctions utilisées par toutes les branches sont livrées une seule fois et paramétrées par activité.', 5);
  const modules = [
    ['CRM & ventes', 'Prospects, opportunités, devis, commandes, factures, relances.', 'CV'],
    ['Achats', 'Demandes, validations, bons de commande, réceptions, fournisseurs.', 'AC'],
    ['Stocks', 'Multi-dépôts, lots/séries, mouvements, inventaires, seuils d’alerte.', 'ST'],
    ['Finance', 'Caisses, banques, règlements, dépenses, créances, centres de coûts.', 'FI'],
    ['RH & temps', 'Personnel, présence, congés, feuilles de temps, éléments de paie.', 'RH'],
    ['Documents', 'Contrats, pièces jointes, numérotation, visa et piste d’audit.', 'DO'],
    ['Portail & mobile', 'Accès web, PWA mobile, profils, notifications et validations.', 'MO'],
    ['Pilotage', 'Budgets, marges, objectifs, tableaux de bord et exports.', 'BI']
  ];
  modules.forEach((m, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    addCard(slide, 0.68 + col * 3.13, 1.78 + row * 2.35, 2.85, 1.95, m[0], m[1], { icon: m[2], iconColor: row === 0 ? C.green : C.green2, bodySize: 10.8 });
  });
  slide.addText('Principe de contrôle : rôles par activité + seuils d’autorisation + validation électronique + journal d’audit.', { x: 0.78, y: 6.56, w: 11.8, h: 0.24, fontSize: 11.5, bold: true, color: C.green, align: 'center', margin: 0 });
}

// 6 — BTP
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Métier 01', 'BTP : piloter chaque chantier jusqu’à la marge finale', 'Un suivi opérationnel et financier de bout en bout pour les constructions, rénovations, démolitions, voiries et canalisations.', 6);
  slide.addImage({ path: constructionPhoto, x: 8.55, y: 1.72, w: 4.15, h: 2.55, sizing: { type: 'cover', w: 4.15, h: 2.55 } });
  slide.addShape(pptx.ShapeType.roundRect, { x: 8.55, y: 3.73, w: 4.15, h: 0.54, rectRadius: 0.04, fill: { color: C.green, transparency: 4 }, line: { color: C.green } });
  slide.addText('Budget prévu  →  Engagé  →  Réalisé  →  Marge', { x: 8.75, y: 3.91, w: 3.75, h: 0.18, fontSize: 10.8, bold: true, color: C.white, align: 'center', margin: 0 });
  const steps = [
    ['1', 'Appel d’offres', 'Dossier, estimation, devis'],
    ['2', 'Planification', 'WBS, tâches, équipes, matériels'],
    ['3', 'Exécution', 'Pointage, achats, consommations'],
    ['4', 'Contrôle', 'Situations, avancement, écarts'],
    ['5', 'Clôture', 'Réception, réserves, marge finale']
  ];
  steps.forEach((s, i) => {
    const x = 0.72 + i * 1.54;
    addIcon(slide, s[0], x, 2.03, i < 3 ? C.green : C.green2, 0.55);
    if (i < 4) addFlowArrow(slide, x + 0.72, 2.11, 0.44, C.olive);
    slide.addText(s[1], { x: x - 0.06, y: 2.75, w: 1.32, h: 0.28, fontSize: 11.5, bold: true, color: C.ink, align: 'center', margin: 0, fit: 'shrink' });
    slide.addText(s[2], { x: x - 0.13, y: 3.14, w: 1.48, h: 0.48, fontSize: 9.3, color: C.slate, align: 'center', margin: 0, fit: 'shrink' });
  });
  addCard(slide, 0.72, 4.4, 3.78, 1.82, 'Contrôle des coûts', 'Budgets par lot, demandes d’achat, contrats de sous-traitance, attachements, consommations et écarts.', { icon: 'FC', iconColor: C.green, bodySize: 11.2 });
  addCard(slide, 4.72, 4.4, 3.78, 1.82, 'Pilotage du chantier', 'Planning, équipes, feuilles de temps, engins, photos, incidents, qualité, sécurité et réserves.', { icon: 'OP', iconColor: C.green2, bodySize: 11.2 });
  addCard(slide, 8.72, 4.4, 3.78, 1.82, 'Facturation & marge', 'Situations de travaux, retenues, acomptes, factures, encaissements et rentabilité consolidée.', { icon: 'MG', iconColor: C.olive, bodySize: 11.2 });
}

// 7 — Commerce, informatique, communication et bureautique
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Métiers 02–04', 'Commerce, informatique, communication & bureautique', 'Un cycle devis–commande–livraison–facture complété par la gestion des équipements et du service après-vente.', 7);
  const flow = ['Prospect', 'Devis', 'Validation', 'Approvisionnement', 'Livraison', 'Facture', 'Encaissement'];
  flow.forEach((t, i) => {
    const x = 0.7 + i * 1.78;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.86, w: 1.43, h: 0.76, rectRadius: 0.05, fill: { color: i === 6 ? C.green : C.white }, line: { color: i === 6 ? C.green : C.line }, shadow: shadow() });
    slide.addText(t, { x: x + 0.1, y: 2.13, w: 1.23, h: 0.2, fontSize: 10.5, bold: true, color: i === 6 ? C.white : C.ink, align: 'center', margin: 0, fit: 'shrink' });
    if (i < flow.length - 1) addFlowArrow(slide, x + 1.45, 2.05, 0.26, C.olive);
  });
  const areas = [
    ['Vente de matériels', ['Catalogues et tarifs', 'Numéros de série et garanties', 'Livraisons partielles', 'Marge par article et client'], 'VM'],
    ['Services informatiques', ['Contrats et abonnements', 'Tickets d’assistance', 'Temps passé et SLA', 'Renouvellements et SAV'], 'SI'],
    ['Communication', ['Brief et bon à tirer', 'Plan de charge créatif', 'Sous-traitance / impression', 'Coût et marge par campagne'], 'CO'],
    ['Bureautique', ['Stock multi-dépôts', 'Kits et nomenclatures', 'Inventaires et seuils', 'Vente, location ou installation'], 'BU']
  ];
  areas.forEach((a, i) => {
    const x = 0.72 + i * 3.14;
    addCard(slide, x, 3.12, 2.85, 2.84, a[0], '', { icon: a[2], iconColor: i % 2 ? C.green2 : C.green, titleSize: 14 });
    addBullets(slide, a[1], x + 0.25, 4.03, 2.33, 1.6, { fontSize: 10.7, spaceAfter: 5 });
  });
  slide.addText('Résultat attendu : connaître la marge réelle de chaque vente, contrat, campagne ou intervention.', { x: 0.75, y: 6.4, w: 11.75, h: 0.28, fontSize: 12.8, bold: true, color: C.green, align: 'center', margin: 0 });
}

// 8 — Transport, résidences, traiteur
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Métiers 05 & services', 'Transport, logistique, résidences & traiteur', 'Des opérations planifiées et facturées depuis la même base clients, fournisseurs et trésorerie.', 8);
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 1.75, w: 6.05, h: 4.92, rectRadius: 0.08, fill: { color: C.green }, line: { color: C.green }, shadow: shadow() });
  slide.addText('TRANSPORT & LOGISTIQUE', { x: 1.08, y: 2.13, w: 4.55, h: 0.3, fontSize: 18, bold: true, color: C.white, margin: 0 });
  slide.addText('Ordre de mission', { x: 1.08, y: 2.78, w: 1.45, h: 0.24, fontSize: 10.5, bold: true, color: C.yellow, margin: 0 });
  addFlowArrow(slide, 2.55, 2.74, 0.47, C.olive);
  slide.addText('Affectation', { x: 3.14, y: 2.78, w: 1.2, h: 0.24, fontSize: 10.5, bold: true, color: C.yellow, margin: 0 });
  addFlowArrow(slide, 4.38, 2.74, 0.47, C.olive);
  slide.addText('Livraison', { x: 4.98, y: 2.78, w: 1.15, h: 0.24, fontSize: 10.5, bold: true, color: C.yellow, margin: 0 });
  addBullets(slide, ['Véhicules, chauffeurs, documents et disponibilité', 'Carburant, péages, avances et dépenses de mission', 'Maintenance préventive, pannes et immobilisations', 'Preuve de livraison, facturation et rentabilité par trajet'], 1.08, 3.42, 5.1, 2.25, { fontSize: 12.3, color: C.lightText, spaceAfter: 8 });
  addMetric(slide, 1.08, 5.75, 2.2, 'Coût/km', 'indicateur flotte', C.yellow, C.lightText);
  addMetric(slide, 3.55, 5.75, 2.2, 'Taux d’usage', 'indicateur disponibilité', C.yellow, C.lightText);
  addCard(slide, 7.05, 1.75, 5.58, 2.25, 'Résidences', 'Disponibilités, réservation, check-in/check-out, dépôt de garantie, prestations annexes, facturation et état des chambres.', { icon: 'RS', iconColor: C.green2, titleSize: 18, bodySize: 12.5 });
  addCard(slide, 7.05, 4.27, 5.58, 2.4, 'Traiteur', 'Devis par nombre de couverts, menus, fiches techniques, besoins matières, planning de production, équipes, livraison et marge par événement.', { icon: 'TC', iconColor: C.olive, titleSize: 18, bodySize: 12.5 });
  addFooter(slide, 8, false);
}

// 9 — Restaurant
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Nouveau module 01', 'Restaurant : de la commande à la marge par plat', 'Une caisse rapide reliée à la cuisine, au stock, aux recettes et à la comptabilité.', 9);
  slide.addImage({ path: restaurantPhoto, x: 0.68, y: 1.72, w: 4.45, h: 4.95, sizing: { type: 'cover', w: 4.45, h: 4.95 } });
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.93, y: 5.72, w: 3.95, h: 0.64, rectRadius: 0.05, fill: { color: C.ink, transparency: 10 }, line: { color: C.ink, transparency: 100 } });
  slide.addText('Caisse • cuisine • stock • marge', { x: 1.18, y: 5.94, w: 3.45, h: 0.2, fontSize: 12, bold: true, color: C.white, align: 'center', margin: 0 });
  const restaurant = [
    ['Point de vente', 'Tables, comptoir, emporter, livraison, remises, annulations et clôture de caisse.', 'PV'],
    ['Cuisine', 'Tickets cuisine, priorités, statuts, temps de préparation et ruptures.', 'CU'],
    ['Recettes & stock', 'Fiches techniques, portions, consommations automatiques, pertes et inventaires.', 'ST'],
    ['Clients & fidélité', 'Réservations, historique, comptes entreprise, points et abonnements.', 'CL']
  ];
  restaurant.forEach((m, i) => {
    const x = 5.42 + (i % 2) * 3.62, y = 1.74 + Math.floor(i / 2) * 2.33;
    addCard(slide, x, y, 3.28, 2.0, m[0], m[1], { icon: m[2], iconColor: i % 2 ? C.green2 : C.green, bodySize: 10.9 });
  });
  slide.addShape(pptx.ShapeType.roundRect, { x: 5.42, y: 6.2, w: 6.9, h: 0.46, rectRadius: 0.05, fill: { color: C.pale }, line: { color: C.pale } });
  slide.addText('KPI : chiffre d’affaires/jour • ticket moyen • coût matière • pertes • marge par plat • écart de caisse', { x: 5.65, y: 6.35, w: 6.44, h: 0.18, fontSize: 10.8, bold: true, color: C.green, align: 'center', margin: 0, fit: 'shrink' });
}

// 10 — Salles
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Nouveau module 02', 'Location de salles : sécuriser le calendrier et les acomptes', 'Une vue unique des disponibilités, des options, des contrats, des prestations et des soldes à encaisser.', 10);
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 1.75, w: 7.3, h: 4.9, rectRadius: 0.08, fill: { color: C.mist }, line: { color: C.line }, shadow: shadow() });
  slide.addText('JUILLET 2026', { x: 1.03, y: 2.1, w: 2.2, h: 0.28, fontSize: 16, bold: true, color: C.green, margin: 0 });
  const days = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  days.forEach((d, i) => slide.addText(d, { x: 1.02 + i * 0.94, y: 2.65, w: 0.75, h: 0.18, fontSize: 8.5, bold: true, color: C.slate, align: 'center', margin: 0 }));
  let day = 1;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const x = 1.02 + c * 0.94, y = 3.0 + r * 0.78;
      slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 0.78, h: 0.62, rectRadius: 0.03, fill: { color: C.white }, line: { color: C.line } });
      slide.addText(String(day++), { x: x + 0.08, y: y + 0.08, w: 0.2, h: 0.15, fontSize: 8.5, bold: true, color: C.slate, margin: 0 });
      if ((r === 0 && c === 3) || (r === 1 && c === 5) || (r === 2 && c === 4) || (r === 3 && c === 1)) {
        slide.addShape(pptx.ShapeType.roundRect, { x: x + 0.08, y: y + 0.31, w: 0.62, h: 0.2, rectRadius: 0.03, fill: { color: c === 5 ? C.amber : C.green2 }, line: { color: c === 5 ? C.amber : C.green2 } });
      }
    }
  }
  slide.addText('CONFIRMÉ', { x: 1.05, y: 6.18, w: 0.78, h: 0.18, fontSize: 8, bold: true, color: C.green2, margin: 0 });
  slide.addText('OPTION', { x: 2.1, y: 6.18, w: 0.6, h: 0.18, fontSize: 8, bold: true, color: C.amber, margin: 0 });
  const hallItems = [
    ['Réservation', 'Capacité, type d’événement, créneau, option et date d’expiration.', 'R'],
    ['Devis & contrat', 'Salle, décoration, sonorisation, restauration, personnel et taxes.', 'D'],
    ['Acompte & solde', 'Échéancier, reçus, relances, dépôt de garantie et remboursement.', 'A'],
    ['Exécution', 'Checklist, plan de salle, équipements, incidents et état des lieux.', 'E']
  ];
  hallItems.forEach((m, i) => addCard(slide, 8.33, 1.75 + i * 1.16, 4.3, 1.03, m[0], m[1], { icon: m[2], iconSize: 0.42, iconColor: i % 2 ? C.green2 : C.green, titleSize: 13, bodySize: 9.6, noShadow: true }));
  slide.addShape(pptx.ShapeType.roundRect, { x: 8.35, y: 6.42, w: 4.25, h: 0.38, rectRadius: 0.04, fill: { color: C.pale }, line: { color: C.pale } });
  slide.addText('Anti-double réservation • CA prévisionnel', { x: 8.55, y: 6.54, w: 3.85, h: 0.16, fontSize: 10.5, bold: true, color: C.green, align: 'center', margin: 0 });
}

// 11 — Lavage auto
{
  const slide = pptx.addSlide();
  slide.background = { color: C.ink };
  addHeader(slide, 'Nouveau module 03', 'Lavage automobile : fluidifier le service et la caisse', 'Un ticket par véhicule, une file visible, des forfaits maîtrisés et une clôture de caisse traçable.', 11, true);
  const stages = [
    ['1', 'Arrivée', 'Plaque • client'], ['2', 'Diagnostic', 'Type • état'], ['3', 'Forfait', 'Service • prix'], ['4', 'Traitement', 'Poste • agent'], ['5', 'Contrôle', 'Qualité • reprise'], ['6', 'Paiement', 'Caisse • reçu']
  ];
  stages.forEach((s, i) => {
    const x = 0.7 + i * 2.07;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.9, w: 1.65, h: 1.6, rectRadius: 0.06, fill: { color: i === 5 ? C.green2 : '2C3D31' }, line: { color: i === 5 ? C.green2 : '4B6250' } });
    addIcon(slide, s[0], x + 0.55, 2.15, i === 5 ? C.yellow : C.olive, 0.55);
    slide.addText(s[1], { x: x + 0.12, y: 2.85, w: 1.41, h: 0.25, fontSize: 12, bold: true, color: C.white, align: 'center', margin: 0 });
    slide.addText(s[2], { x: x + 0.12, y: 3.18, w: 1.41, h: 0.2, fontSize: 9.2, color: C.lightText, align: 'center', margin: 0 });
    if (i < 5) addFlowArrow(slide, x + 1.7, 2.48, 0.27, '6A8D6E');
  });
  const washCards = [
    ['Offres', 'Lavage simple, complet, VIP, options et tarifs par catégorie de véhicule.', 'OF'],
    ['Abonnements', 'Cartes prépayées, comptes entreprises, flotte et consommation par véhicule.', 'AB'],
    ['Opérations', 'Files d’attente, affectation des postes, temps de cycle et productivité agents.', 'OP'],
    ['Contrôle', 'Annulations, remises, consommables, écarts de caisse et incidents qualité.', 'CQ']
  ];
  washCards.forEach((m, i) => addCard(slide, 0.72 + i * 3.13, 4.0, 2.85, 1.9, m[0], m[1], { icon: m[2], iconColor: i % 2 ? C.green2 : C.olive, fill: '26372B', line: '405545', titleColor: C.white, bodyColor: C.lightText, bodySize: 10.7 }));
  slide.addText('KPI : véhicules/jour • temps moyen • revenu/poste • consommables/véhicule • taux de reprise • écart de caisse', { x: 0.9, y: 6.4, w: 11.55, h: 0.27, fontSize: 11.7, bold: true, color: C.yellow, align: 'center', margin: 0 });
}

// 12 — Architecture
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Technique', 'Architecture cible, sécurité et continuité de service', 'Une application web responsive, centralisée, sécurisée et conçue pour évoluer par modules.', 12);
  const layers = [
    ['UTILISATEURS', 'Direction • Finance • Ventes • Chantiers • Restaurant • Caisses • Mobile', C.green],
    ['APPLICATION ERP', 'Modules métiers • workflows • notifications • tableaux de bord • portail', C.green2],
    ['SERVICES', 'API • génération PDF • e-mail/SMS • paiements • import/export • journal d’audit', C.olive],
    ['DONNÉES & CLOUD', 'Base centralisée • chiffrement • sauvegardes • supervision • reprise', C.ink]
  ];
  layers.forEach((l, i) => {
    const y = 1.85 + i * 1.12;
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.8 + i * 0.22, y, w: 7.4 - i * 0.44, h: 0.82, rectRadius: 0.05, fill: { color: l[2] }, line: { color: l[2] }, shadow: shadow() });
    slide.addText(l[0], { x: 1.12 + i * 0.22, y: y + 0.18, w: 1.7, h: 0.2, fontSize: 10.5, bold: true, color: i === 2 ? C.ink : C.white, margin: 0, charSpacing: 1 });
    slide.addText(l[1], { x: 3.55, y: y + 0.19, w: 3.7 - i * 0.26, h: 0.2, fontSize: 9.8, color: i === 2 ? C.ink : C.white, margin: 0, fit: 'shrink' });
  });
  const security = [
    ['Accès', 'Profils, rôles, double authentification optionnelle, verrouillage et sessions.'],
    ['Protection', 'HTTPS, chiffrement des secrets, séparation des environnements et mises à jour.'],
    ['Sauvegardes', 'Quotidiennes, rétention définie, restauration testée et copie externalisée.'],
    ['Traçabilité', 'Journal des connexions, validations, modifications sensibles et exports.']
  ];
  security.forEach((s, i) => addCard(slide, 8.55, 1.75 + i * 1.18, 4.0, 1.04, s[0], s[1], { icon: String(i + 1), iconSize: 0.42, iconColor: i % 2 ? C.green2 : C.green, titleSize: 12.5, bodySize: 9.6, noShadow: true }));
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 6.52, w: 11.75, h: 0.28, rectRadius: 0.04, fill: { color: C.pale }, line: { color: C.pale } });
  slide.addText('Disponibilité cible à confirmer au cadrage • reprise selon l’offre cloud • conservation des données à valider par le client', { x: 1.05, y: 6.6, w: 11.25, h: 0.14, fontSize: 9.2, color: C.slate, align: 'center', margin: 0 });
}

// 13 — Reporting
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Pilotage', 'Des indicateurs communs et des tableaux de bord métier', 'La direction dispose d’une vue consolidée, puis peut descendre jusqu’à la transaction source.', 13);
  const top = [
    ['Chiffre d’affaires', 'par activité, site et période', '12,4 M'],
    ['Marge brute', 'réelle vs objectif', '31,8 %'],
    ['Trésorerie', 'disponible et prévisionnelle', '8,7 M'],
    ['Créances', 'échues et à relancer', '3,1 M']
  ];
  top.forEach((k, i) => {
    const x = 0.72 + i * 3.12;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.76, w: 2.84, h: 1.32, rectRadius: 0.06, fill: { color: i === 0 ? C.green : C.mist }, line: { color: i === 0 ? C.green : C.line }, shadow: shadow() });
    slide.addText(k[2], { x: x + 0.22, y: 2.02, w: 2.4, h: 0.42, fontSize: 23, bold: true, color: i === 0 ? C.white : C.green, margin: 0 });
    slide.addText(k[0], { x: x + 0.22, y: 2.5, w: 2.4, h: 0.2, fontSize: 10.5, bold: true, color: i === 0 ? C.yellow : C.ink, margin: 0 });
    slide.addText(k[1], { x: x + 0.22, y: 2.75, w: 2.4, h: 0.16, fontSize: 8.8, color: i === 0 ? C.lightText : C.slate, margin: 0 });
  });
  const kpis = [
    ['BTP', 'Avancement • engagé • coût réel • marge • retards'],
    ['Restaurant', 'Ticket moyen • coût matière • pertes • marge/plat'],
    ['Salles', 'Taux d’occupation • CA futur • acomptes • impayés'],
    ['Lavage', 'Véhicules/jour • temps cycle • revenu/poste • reprises'],
    ['Transport', 'Coût/km • disponibilité • carburant • marge/trajet'],
    ['Commerce', 'Pipeline • conversion • marge/article • rotation stock']
  ];
  kpis.forEach((k, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 0.72 + col * 4.15, y = 3.55 + row * 1.45;
    addCard(slide, x, y, 3.82, 1.15, k[0], k[1], { icon: k[0].slice(0, 2).toUpperCase(), iconSize: 0.42, iconColor: row ? C.green2 : C.green, titleSize: 12.8, bodySize: 9.8, noShadow: true });
  });
  slide.addText('Les chiffres ci-dessus sont uniquement des illustrations de tableau de bord.', { x: 0.75, y: 6.58, w: 11.9, h: 0.18, fontSize: 9.2, italic: true, color: C.slate, align: 'center', margin: 0 });
}

// 14 — Planning
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Méthode', 'Planning de réalisation — 24 semaines', 'Livraison incrémentale, démonstration toutes les deux semaines et validation par jalons.', 14);
  const phases = [
    ['1', 'Cadrage & blueprint', 'S1–S3', 1.4, C.green],
    ['2', 'UX, prototype & architecture', 'S4–S6', 1.4, C.green2],
    ['3', 'Socle ERP & BTP', 'S7–S12', 2.65, C.olive],
    ['4', 'Modules métiers', 'S13–S17', 2.25, C.green],
    ['5', 'Migration & intégrations', 'S18–S20', 1.4, C.green2],
    ['6', 'Recette & formation', 'S21–S22', 1.0, C.olive],
    ['7', 'Mise en production', 'S23–S24', 1.0, C.green]
  ];
  let x = 0.72;
  phases.forEach((p) => {
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.9, w: p[3], h: 1.15, rectRadius: 0.04, fill: { color: p[4] }, line: { color: p[4] }, shadow: shadow() });
    slide.addText(p[0], { x: x + 0.12, y: 2.08, w: 0.28, h: 0.24, fontSize: 11, bold: true, color: p[4] === C.olive ? C.ink : C.white, margin: 0 });
    slide.addText(p[1], { x: x + 0.12, y: 2.38, w: p[3] - 0.24, h: 0.28, fontSize: 9.5, bold: true, color: p[4] === C.olive ? C.ink : C.white, margin: 0, fit: 'shrink' });
    slide.addText(p[2], { x: x + 0.12, y: 2.75, w: p[3] - 0.24, h: 0.16, fontSize: 8.7, color: p[4] === C.olive ? C.ink : C.lightText, margin: 0 });
    x += p[3] + 0.16;
  });
  const deliverables = [
    ['J1', 'Dossier de conception', 'Processus cibles, périmètre, règles et backlog validés.'],
    ['J2', 'Prototype accepté', 'Parcours clés, identité visuelle et architecture approuvés.'],
    ['J3', 'Recette fonctionnelle', 'Scénarios testés, anomalies critiques closes et données reprises.'],
    ['J4', 'Démarrage', 'Utilisateurs formés, sauvegardes actives et support de proximité.']
  ];
  deliverables.forEach((d, i) => addCard(slide, 0.72 + i * 3.13, 3.72, 2.83, 2.0, d[1], d[2], { icon: d[0], iconColor: i % 2 ? C.green2 : C.green, bodySize: 10.6 }));
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.72, y: 6.18, w: 12, h: 0.52, rectRadius: 0.04, fill: { color: C.ink }, line: { color: C.ink } });
  slide.addText('Après le lancement : 4 semaines d’hypercare incluses pour stabilisation et accompagnement.', { x: 1.0, y: 6.36, w: 11.45, h: 0.18, fontSize: 11.5, bold: true, color: C.white, align: 'center', margin: 0 });
}

// 15 — Gouvernance
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Exécution', 'Gouvernance, formation et transfert de compétences', 'Une organisation légère pour décider vite, sécuriser les données et favoriser l’adoption.', 15);
  addCard(slide, 0.72, 1.78, 3.72, 2.25, 'Comité de pilotage', 'Direction générale, sponsor, chef de projet client et chef de projet intégrateur. Arbitrage mensuel : périmètre, budget, risques et décisions.', { icon: 'COP', iconColor: C.green, titleSize: 17, bodySize: 11.5 });
  addCard(slide, 4.82, 1.78, 3.72, 2.25, 'Équipe projet', 'Référents par activité, finance, informatique et contrôle interne. Ateliers, préparation des données, tests et validation des règles.', { icon: 'PRJ', iconColor: C.green2, titleSize: 17, bodySize: 11.5 });
  addCard(slide, 8.92, 1.78, 3.72, 2.25, 'Cadence', 'Point projet hebdomadaire, démonstration bimensuelle, registre des décisions, suivi des actions et tableau des risques.', { icon: 'RIT', iconColor: C.olive, titleSize: 17, bodySize: 11.5 });
  slide.addText('PLAN DE FORMATION', { x: 0.72, y: 4.48, w: 2.4, h: 0.25, fontSize: 12, bold: true, color: C.green, charSpacing: 1, margin: 0 });
  const train = [
    ['Administrateurs', '2 jours', 'Paramétrage, profils, référentiels, sauvegardes, support N1'],
    ['Super-utilisateurs', '3 jours', 'Processus métiers, contrôles, recette, assistance aux équipes'],
    ['Utilisateurs finaux', '6 sessions', 'Rôle par rôle, exercices sur données de démonstration'],
    ['Direction', '½ journée', 'Tableaux de bord, alertes, analyse et exports']
  ];
  train.forEach((t, i) => {
    const x = 0.72 + i * 3.12;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 4.92, w: 2.82, h: 1.48, rectRadius: 0.05, fill: { color: C.mist }, line: { color: C.line } });
    slide.addText(t[0], { x: x + 0.22, y: 5.16, w: 2.38, h: 0.24, fontSize: 12.5, bold: true, color: C.ink, margin: 0 });
    addPill(slide, t[1], x + 1.78, 5.10, 0.78, C.pale, C.green);
    slide.addText(t[2], { x: x + 0.22, y: 5.62, w: 2.38, h: 0.54, fontSize: 9.8, color: C.slate, margin: 0, fit: 'shrink' });
  });
  slide.addText('Livrables : guides utilisateurs • procédures d’exploitation • dossier d’architecture • plan de sauvegarde • cahier de recette', { x: 0.75, y: 6.63, w: 11.9, h: 0.18, fontSize: 9.8, bold: true, color: C.green, align: 'center', margin: 0 });
}

// 16 — Offre financière détaillée
{
  const slide = pptx.addSlide();
  slide.background = { color: C.mist };
  addHeader(slide, 'Financier', 'Budget forfaitaire indicatif', 'Montants en FCFA hors taxes. Le prix définitif sera confirmé après cadrage et validation du périmètre.', 16);
  const rows = [
    ['Cadrage, cartographie des processus & blueprint', '2 250 000'],
    ['UX/UI, prototype & architecture technique', '2 500 000'],
    ['Socle ERP : CRM, ventes, achats, stocks, finance, RH, documents', '9 800 000'],
    ['Module BTP & gestion de projets / chantiers', '4 600 000'],
    ['Module transport, logistique & flotte', '3 200 000'],
    ['Module restaurant : POS, cuisine, recettes & stock', '3 300 000'],
    ['Modules salles, traiteur & résidences', '2 600 000'],
    ['Module lavage automobile', '1 900 000'],
    ['Reporting, portail & expérience mobile PWA', '2 100 000'],
    ['Migration, paramétrage & intégrations standards', '2 400 000'],
    ['Recette, formation, déploiement & hypercare', '2 200 000']
  ];
  const x = 0.72, y0 = 1.7, w1 = 9.75, w2 = 2.12, rh = 0.39;
  slide.addShape(pptx.ShapeType.roundRect, { x, y: y0, w: w1 + w2, h: 0.46, rectRadius: 0.04, fill: { color: C.green }, line: { color: C.green } });
  slide.addText('POSTE', { x: x + 0.18, y: y0 + 0.15, w: w1 - 0.35, h: 0.16, fontSize: 9.5, bold: true, color: C.white, charSpacing: 1, margin: 0 });
  slide.addText('MONTANT HT', { x: x + w1, y: y0 + 0.15, w: w2 - 0.18, h: 0.16, fontSize: 9.5, bold: true, color: C.yellow, align: 'right', charSpacing: 1, margin: 0 });
  rows.forEach((r, i) => {
    const y = y0 + 0.46 + i * rh;
    const fill = i % 2 ? C.white : 'EDF3EE';
    slide.addShape(pptx.ShapeType.rect, { x, y, w: w1 + w2, h: rh, fill: { color: fill }, line: { color: C.line, width: 0.4 } });
    slide.addText(r[0], { x: x + 0.18, y: y + 0.115, w: w1 - 0.35, h: 0.16, fontSize: 10.1, color: C.ink, margin: 0, fit: 'shrink' });
    slide.addText(r[1], { x: x + w1, y: y + 0.115, w: w2 - 0.18, h: 0.16, fontSize: 10.3, bold: true, color: C.green, align: 'right', margin: 0 });
  });
  const ty = 6.55;
  slide.addShape(pptx.ShapeType.roundRect, { x: 8.45, y: ty, w: 3.55, h: 0.52, rectRadius: 0.05, fill: { color: C.ink }, line: { color: C.ink }, shadow: shadow() });
  slide.addText('TOTAL HT', { x: 8.68, y: ty + 0.16, w: 0.9, h: 0.17, fontSize: 9.2, bold: true, color: C.yellow, margin: 0 });
  slide.addText('36 850 000 FCFA', { x: 9.55, y: ty + 0.12, w: 2.18, h: 0.25, fontSize: 15.5, bold: true, color: C.white, align: 'right', margin: 0, fit: 'shrink' });
  slide.addText('TVA et retenues éventuelles selon la réglementation applicable. Services tiers et déplacements hors Abidjan non inclus.', { x: 0.78, y: 6.56, w: 7.25, h: 0.26, fontSize: 8.9, italic: true, color: C.slate, margin: 0 });
}

// 17 — Paiement et récurrents
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addHeader(slide, 'Financier', 'Échéancier de paiement et coûts récurrents', 'Les paiements sont liés à des livrables vérifiables ; l’exploitation récurrente démarre à la mise en production.', 17);
  slide.addText('ÉCHÉANCIER PROPOSÉ', { x: 0.72, y: 1.72, w: 3.0, h: 0.22, fontSize: 11.5, bold: true, color: C.green, charSpacing: 1, margin: 0 });
  const pays = [
    ['20 %', 'Commande & lancement', '7 370 000'],
    ['20 %', 'Blueprint & prototype validés', '7 370 000'],
    ['25 %', 'Socle ERP & BTP en recette', '9 212 500'],
    ['20 %', 'Modules métiers en recette', '7 370 000'],
    ['10 %', 'Mise en production', '3 685 000'],
    ['5 %', 'Réception après hypercare', '1 842 500']
  ];
  pays.forEach((p, i) => {
    const y = 2.08 + i * 0.65;
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.72, y, w: 6.45, h: 0.49, rectRadius: 0.04, fill: { color: i === 2 ? C.pale : C.mist }, line: { color: C.line } });
    slide.addText(p[0], { x: 0.9, y: y + 0.14, w: 0.62, h: 0.18, fontSize: 11.5, bold: true, color: C.green, margin: 0 });
    slide.addText(p[1], { x: 1.65, y: y + 0.14, w: 3.7, h: 0.18, fontSize: 10.5, color: C.ink, margin: 0 });
    slide.addText(p[2] + ' FCFA', { x: 5.15, y: y + 0.14, w: 1.72, h: 0.18, fontSize: 10.5, bold: true, color: C.green2, align: 'right', margin: 0 });
  });
  slide.addText('EXPLOITATION RÉCURRENTE — NON INCLUSE', { x: 7.65, y: 1.72, w: 4.6, h: 0.22, fontSize: 11.5, bold: true, color: C.green, charSpacing: 1, margin: 0 });
  addCard(slide, 7.65, 2.08, 4.95, 1.55, 'Cloud, sauvegardes & supervision', 'Environnements de production, sauvegardes quotidiennes, certificats, monitoring et alertes.', { icon: 'CL', iconColor: C.green, titleSize: 14.5, bodySize: 10.4 });
  slide.addText('240 000 FCFA / mois', { x: 9.15, y: 3.26, w: 3.05, h: 0.22, fontSize: 12.5, bold: true, color: C.green, align: 'right', margin: 0 });
  addCard(slide, 7.65, 3.88, 4.95, 1.55, 'Support correctif & mises à jour', 'Assistance, correction d’anomalies, petites mises à jour, rapport mensuel et support aux administrateurs.', { icon: 'SP', iconColor: C.green2, titleSize: 14.5, bodySize: 10.4 });
  slide.addText('350 000 FCFA / mois', { x: 9.15, y: 5.06, w: 3.05, h: 0.22, fontSize: 12.5, bold: true, color: C.green2, align: 'right', margin: 0 });
  slide.addShape(pptx.ShapeType.roundRect, { x: 7.65, y: 5.75, w: 4.95, h: 0.73, rectRadius: 0.04, fill: { color: C.ink }, line: { color: C.ink } });
  slide.addText('TOTAL RÉCURRENT INDICATIF', { x: 7.92, y: 5.94, w: 2.5, h: 0.18, fontSize: 9.5, bold: true, color: C.yellow, margin: 0 });
  slide.addText('590 000 / mois', { x: 10.25, y: 5.89, w: 2.02, h: 0.28, fontSize: 16, bold: true, color: C.white, align: 'right', margin: 0 });
  slide.addText('SMS, WhatsApp, paiement en ligne, matériel de caisse et prestations évolutives : facturés selon consommation ou devis.', { x: 0.75, y: 6.55, w: 6.7, h: 0.26, fontSize: 9.2, italic: true, color: C.slate, margin: 0 });
}

// 18 — Conditions et suite
{
  const slide = pptx.addSlide();
  slide.background = { color: C.ink };
  addHeader(slide, 'Conclusion', 'Conditions, hypothèses et prochaines étapes', 'Une validation rapide du périmètre permet de sécuriser le budget et la date de démarrage.', 18, true);
  addCard(slide, 0.72, 1.77, 3.72, 3.72, 'Inclus dans l’offre', '', { icon: '✓', iconColor: C.green2, fill: '26372B', line: '405545', titleColor: C.white, bodyColor: C.lightText, titleSize: 17 });
  addBullets(slide, ['Conception, développement et paramétrage', 'Environnements projet et production initiale', 'Migration des référentiels et soldes d’ouverture', 'Recette, formation et guides', 'Mise en production et 4 semaines d’hypercare'], 1.05, 2.72, 3.02, 2.15, { fontSize: 11.4, color: C.lightText, spaceAfter: 8 });
  addCard(slide, 4.82, 1.77, 3.72, 3.72, 'Hypothèses structurantes', '', { icon: 'H', iconColor: C.olive, fill: '26372B', line: '405545', titleColor: C.white, bodyColor: C.lightText, titleSize: 17 });
  addBullets(slide, ['Jusqu’à 50 utilisateurs nommés et 5 sites', 'Données sources disponibles en Excel/CSV nettoyés', 'Un référent client disponible par activité', 'Interfaces tierces limitées aux API documentées', 'Plan comptable et règles de gestion fournis par le client'], 5.15, 2.72, 3.02, 2.15, { fontSize: 11.1, color: C.lightText, spaceAfter: 8 });
  addCard(slide, 8.92, 1.77, 3.72, 3.72, 'À confirmer au cadrage', '', { icon: '?', iconColor: C.amber, fill: '26372B', line: '405545', titleColor: C.white, bodyColor: C.lightText, titleSize: 17 });
  addBullets(slide, ['Nombre exact de sites, caisses et dépôts', 'Périmètre comptable et paie', 'Historique à migrer et qualité des données', 'Matériel POS, imprimantes et lecteurs', 'Intégrations bancaires, mobile money, SMS ou WhatsApp'], 9.25, 2.72, 3.02, 2.15, { fontSize: 11.1, color: C.lightText, spaceAfter: 8 });
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.72, y: 5.86, w: 12, h: 0.78, rectRadius: 0.05, fill: { color: C.green2 }, line: { color: C.green2 }, shadow: shadow() });
  slide.addText('PROCHAINES ÉTAPES', { x: 1.05, y: 6.11, w: 1.82, h: 0.22, fontSize: 10, bold: true, color: C.yellow, charSpacing: 1.2, margin: 0 });
  slide.addText('1. Valider  →  2. Cadrer  →  3. Contractualiser  →  4. Lancer', { x: 2.95, y: 6.09, w: 6.45, h: 0.25, fontSize: 12.3, bold: true, color: C.white, align: 'center', margin: 0, fit: 'shrink' });
  slide.addText('olivedanaroy@gmail.com\n(+225) 07 77 99 99 48', { x: 9.63, y: 5.99, w: 2.7, h: 0.4, fontSize: 10.8, bold: true, color: C.white, align: 'right', margin: 0, breakLine: false, fit: 'shrink' });
}

pptx.writeFile({ fileName: '/Users/ogahserge/Documents/best_epargne/output/Offre_ERP_OLIVE_DANAROY.pptx' });
