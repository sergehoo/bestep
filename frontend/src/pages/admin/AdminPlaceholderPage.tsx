/**
 * AdminPlaceholderPage.tsx — R28.6
 *
 * Page temporaire pour les modules admin dont les endpoints backend
 * ne sont pas encore livrés. NE PAS afficher de données mockées :
 * on annonce clairement le statut, les features prévues et un lien
 * de repli vers l'admin Django pour les tâches critiques.
 *
 * Utilisation :
 *   <AdminPlaceholderPage
 *     title="Paiements"
 *     description="Vue globale des transactions plateforme."
 *     features={['Liste transactions','Filtres statut/moyen/date','Remboursement','Export']}
 *     backendNeeded={['/api/admin/payments/','/api/admin/refunds/']}
 *     djangoAdmin="commerce/payment"
 *   />
 */
import { Link } from 'react-router-dom';
import {
  Construction,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Server,
} from 'lucide-react';

import { AdminShell } from '@/components/admin/AdminShell';
import { PageHeader } from '@/components/admin/primitives';

interface Props {
  title: string;
  description: string;
  /** Liste des features prévues (bullet points). */
  features: string[];
  /** Endpoints backend nécessaires (roadmap R29+). */
  backendNeeded?: string[];
  /** Chemin vers l'admin Django équivalent (fallback opérationnel). */
  djangoAdmin?: string;
  /** Sous-titre de la roadmap (ex: "R29", "R30"). */
  roadmap?: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
}

export function AdminPlaceholderPage({
  title,
  description,
  features,
  backendNeeded,
  djangoAdmin,
  roadmap = 'R29+',
  breadcrumbs,
}: Props) {
  return (
    <AdminShell>
      <PageHeader
        title={title}
        subtitle={description}
        breadcrumbs={
          breadcrumbs ?? [
            { label: 'Administration', to: '/dashboard/admin' },
            { label: title },
          ]
        }
      />

      <div className="max-w-3xl">
        {/* Bannière statut */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-5 mb-5">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200 flex items-center justify-center shrink-0">
              <Construction className="w-5 h-5" />
            </span>
            <div className="flex-1">
              <p className="font-extrabold text-amber-900 dark:text-amber-200">
                Module en cours de livraison ({roadmap})
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Cette section attend l'implémentation d'endpoints backend
                dédiés. Pour les opérations critiques, utilisez l'admin
                Django (ci-dessous). L'interface premium sera déployée avec
                les endpoints correspondants.
              </p>
            </div>
          </div>
        </div>

        {/* Features prévues */}
        <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-5 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">
            Fonctionnalités prévues
          </p>
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Endpoints backend nécessaires */}
        {backendNeeded && backendNeeded.length > 0 && (
          <div className="bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-2xl p-5 mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-700 dark:text-neutral-300 mb-3 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Endpoints backend à livrer
            </p>
            <ul className="space-y-1">
              {backendNeeded.map((ep) => (
                <li
                  key={ep}
                  className="text-xs font-mono text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900 rounded-lg px-3 py-1.5"
                >
                  {ep}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA Django admin */}
        {djangoAdmin && (
          <a
            href={`/admin/${djangoAdmin}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
          >
            <ExternalLink className="w-4 h-4" />
            Ouvrir dans l'admin Django
          </a>
        )}

        <div className="mt-6">
          <Link
            to="/dashboard/admin"
            className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
          >
            Retour au cockpit
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Placeholders concrets — un composant par module WIP
// (routés dans router/index.tsx)
// ─────────────────────────────────────────────────────────────

export function AdminInstructorsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Formateurs"
      description="Gestion, validation et suivi financier des formateurs."
      features={[
        'Liste avec profil, expertise, nb apprenants, note moyenne',
        'Workflow validation formateur (inscription → docs → validation)',
        'Revenus, commissions, montants reversés',
        'Suspension, restriction de publication',
        'Export financier',
      ]}
      backendNeeded={[
        'GET /api/admin/instructors/',
        'POST /api/admin/instructors/<id>/validate/',
        'POST /api/admin/instructors/<id>/suspend/',
      ]}
      djangoAdmin="compte/user"
    />
  );
}

export function AdminOrganizationsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Organisations"
      description="Gestion des organisations clientes et de leurs abonnements."
      features={[
        'Liste avec responsable, nb utilisateurs, cours attribués',
        'Création + import collaborateurs',
        'Gestion groupes, quotas, abonnements',
        'Statistiques + rapports par org',
      ]}
      backendNeeded={[
        'GET /api/admin/organizations/',
        'POST /api/admin/organizations/',
        'PATCH /api/admin/organizations/<id>/',
      ]}
      djangoAdmin="organizations/organization"
    />
  );
}

export function AdminRolesPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Rôles & permissions"
      description="RBAC granulaire par module et par action."
      features={[
        '8 rôles types (Super-admin, Modérateur, Support, Financier, Auditeur…)',
        'Permissions par module × action (voir/créer/modifier/publier/rembourser)',
        'Confirmation obligatoire sur actions sensibles',
        'Audit chaque changement de rôle',
      ]}
      backendNeeded={[
        'Modèle AdminRole + Permission',
        'GET/POST /api/admin/roles/',
        'GET/PATCH /api/admin/roles/<id>/permissions/',
      ]}
      djangoAdmin="auth/group"
    />
  );
}

export function AdminContentPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Contenu pédagogique"
      description="Supervision globale des sections, leçons, vidéos, audios, PDF cross-cours."
      features={[
        'Vue transverse sections / leçons / médias',
        'Recherche + filtres par cours, type, formateur',
        'Bibliothèque multimédia centrale (upload, tags, dossiers, quotas)',
        'Statistiques d\'utilisation par média',
      ]}
      backendNeeded={[
        'GET /api/admin/content/lessons/',
        'GET /api/admin/content/media/',
        'GET /api/admin/content/media/quota/',
      ]}
      djangoAdmin="catalog/lesson"
    />
  );
}

export function AdminQuizzesPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Quiz plateforme"
      description="Vue transverse des quiz + statistiques."
      features={[
        'Liste globale quiz avec stats (tentatives, score moyen, taux réussite)',
        'Questions les plus échouées cross-plateforme',
        'Types de questions : QCM, vrai/faux, réponse courte, correspondance…',
        'Modération de quiz',
      ]}
      backendNeeded={[
        'GET /api/admin/quizzes/',
        'GET /api/admin/quizzes/stats/',
      ]}
      djangoAdmin="assessments/quiz"
    />
  );
}

export function AdminPaymentsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Paiements"
      description="Vue globale des transactions plateforme."
      features={[
        'Liste transactions avec référence, user, cours, montant, statut',
        'Filtres statut / moyen / date / formateur',
        'Remboursement (total / partiel) avec justification',
        'Export CSV / Excel',
      ]}
      backendNeeded={[
        'GET /api/admin/payments/',
        'POST /api/admin/payments/<id>/refund/',
        'GET /api/admin/payments/exports/',
      ]}
      djangoAdmin="commerce/order"
    />
  );
}

export function AdminCommissionsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Commissions"
      description="Paramétrage du modèle économique."
      features={[
        'Commission globale + par formateur / cours / catégorie / organisation',
        'Frais fixes + variables + taxes',
        'Règles promotionnelles',
        'Simulation calcul commission',
      ]}
      backendNeeded={[
        'Modèle CommissionRule',
        'GET/POST /api/admin/commissions/rules/',
        'POST /api/admin/commissions/simulate/',
      ]}
      djangoAdmin="commerce/order"
    />
  );
}

export function AdminPayoutsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Reversements"
      description="Workflow paiement des formateurs."
      features={[
        'Génération automatique par période',
        'Calcul brut / commission / taxes / net',
        'Validation admin puis paiement',
        'Reçus PDF automatiques',
      ]}
      backendNeeded={[
        'Modèle Payout + PayoutBatch',
        'GET /api/admin/payouts/',
        'POST /api/admin/payouts/<id>/validate/',
        'POST /api/admin/payouts/<id>/pay/',
      ]}
      djangoAdmin=""
    />
  );
}

export function AdminMarketingPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Marketing"
      description="Coupons, campagnes, mises en avant."
      features={[
        'Coupons + codes de réduction',
        'Campagnes emails + segmentation utilisateurs',
        'Bannières + cours sponsorisés',
        'Newsletters',
      ]}
      backendNeeded={[
        'Modèles Coupon, Campaign, Segment',
        'CRUD complet côté admin',
      ]}
      djangoAdmin=""
    />
  );
}

export function AdminModerationPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Modération"
      description="Avis, commentaires, signalements et Q&R."
      features={[
        'File signalements + actions (approuver/masquer/supprimer)',
        'Règles automatiques anti-spam / injures / liens suspects',
        'Modération Q&R',
        'Historique modération par modérateur',
      ]}
      backendNeeded={[
        'Modèle Report + AutoModRule',
        'GET /api/admin/moderation/reports/',
        'POST /api/admin/moderation/reports/<id>/action/',
      ]}
      djangoAdmin="reviews/review"
    />
  );
}

export function AdminSupportPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Support"
      description="Tickets utilisateurs et centre d'aide."
      features={[
        'File tickets avec priorité, catégorie, assignation',
        'Conversations threadées',
        'FAQ éditable',
        'Statistiques temps de réponse',
      ]}
      backendNeeded={[
        'Modèles Ticket + TicketMessage',
        'GET /api/admin/tickets/',
        'POST /api/admin/tickets/<id>/reply/',
      ]}
      djangoAdmin=""
    />
  );
}

export function AdminReportsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Rapports"
      description="Rapports avancés exportables (PDF / Excel / CSV)."
      features={[
        'Rapports users / cours / formateurs / revenus / certificats',
        'Sélection période + filtres dynamiques',
        'Export asynchrone (Celery)',
        'Planification automatique + envoi email',
      ]}
      backendNeeded={[
        'GET /api/admin/reports/templates/',
        'POST /api/admin/reports/generate/',
        'GET /api/admin/reports/<id>/status/',
      ]}
      djangoAdmin=""
    />
  );
}

export function AdminSettingsPlaceholder() {
  return (
    <AdminPlaceholderPage
      title="Paramètres avancés"
      description="Configuration plateforme, identité visuelle, SMTP, stockage, maintenance."
      features={[
        'Identité (nom, logo, favicon, couleurs, slogan, réseaux sociaux)',
        'SMTP + templates emails + test envoi',
        'Stockage (MinIO/S3/Cloudinary) + quotas',
        'Mode maintenance planifié',
      ]}
      backendNeeded={[
        'Modèle PlatformSettings versionné',
        'GET/PATCH /api/admin/settings/',
        'POST /api/admin/settings/test-email/',
      ]}
      djangoAdmin="constance/config"
    />
  );
}
