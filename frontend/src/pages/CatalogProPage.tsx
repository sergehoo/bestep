/**
 * CatalogProPage.tsx — Catalogue « Professionnel » (F1).
 *
 * Cette page réutilise entièrement le rendu de CatalogPage mais force le
 * filtre `course_type=PROFESSIONNELLE` côté API. La page de détail (route
 * /courses/:slug) détecte le type et remplace automatiquement le bouton
 * « S'inscrire » par « Demander un devis ».
 */
import CatalogPage from './CatalogPage';

export default function CatalogProPage() {
  return (
    <CatalogPage
      forcedCourseType="PROFESSIONNELLE"
      heroBadge="Catalogue Professionnel · B2B"
      heroTitle="Formations sur-mesure pour les organisations"
      heroTitleHighlight="conçues pour vos équipes."
      heroSubtitle="Programmes professionnels tarifés en devis. Sélectionnez une formation puis demandez un devis adapté à vos besoins et effectifs."
      heroSearchPlaceholder="Management, finance d’entreprise, conformité, IA…"
    />
  );
}
