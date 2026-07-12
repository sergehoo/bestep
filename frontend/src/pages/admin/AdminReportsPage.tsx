/**
 * AdminReportsPage.tsx — R43
 *
 * Exports CSV synchrones. Chaque rapport ouvre un endpoint direct qui
 * retourne un StreamingHttpResponse. Le download se fait via un <a href>
 * classique — pas de fetch pour éviter de charger tout le CSV en mémoire
 * côté frontend.
 *
 * Le JWT n'est PAS injecté dans un simple lien : on utilise un formulaire
 * masqué qui poste vers l'endpoint avec le token — non, simpler : on
 * ouvre l'endpoint via `window.open` en construisant l'URL + token en
 * query. C'est légit ici car l'utilisateur EST admin et le token
 * transite déjà dans le domaine ; toutefois pour rester safe, on utilise
 * l'API axios avec `responseType: 'blob'` pour bénéficier du header
 * Authorization, puis on crée un blob URL côté client.
 */
import { useState } from 'react';
import {
  BarChart3,
  Users,
  BookOpen,
  ClipboardList,
  Wallet,
  Coins,
  Download,
  Loader2,
  Filter,
  Info,
  RefreshCw,
} from 'lucide-react';

import api from '@/lib/api';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  PageHeader,
  StatCard,
} from '@/components/admin/primitives';
import { extractApiError } from '@/lib/utils';

interface ReportDef {
  key: string;
  label: string;
  description: string;
  endpoint: string;
  Icon: typeof Users;
  tone: 'primary' | 'accent' | 'emerald' | 'violet' | 'rose' | 'sky';
  filters?: Array<{
    key: string;
    label: string;
    type: 'text' | 'date' | 'select';
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
  }>;
}

const REPORTS: ReportDef[] = [
  {
    key: 'users',
    label: 'Utilisateurs',
    description:
      'Liste complète des utilisateurs plateforme (id, email, nom, rôle, statut, dates).',
    endpoint: '/admin/reports/users.csv',
    Icon: Users,
    tone: 'primary',
    filters: [
      {
        key: 'active',
        label: 'Statut',
        type: 'select',
        options: [
          { value: '', label: 'Actifs + inactifs' },
          { value: 'true', label: 'Actifs seulement' },
          { value: 'false', label: 'Inactifs seulement' },
        ],
      },
      {
        key: 'role',
        label: 'Rôle',
        type: 'select',
        options: [
          { value: '', label: 'Tous rôles' },
          { value: 'instructor', label: 'Formateurs' },
          { value: 'learner', label: 'Apprenants' },
          { value: 'admin', label: 'Admins plateforme' },
        ],
      },
    ],
  },
  {
    key: 'courses',
    label: 'Cours',
    description:
      'Catalogue complet des cours (titre, formateur, catégorie, prix, statut, dates).',
    endpoint: '/admin/reports/courses.csv',
    Icon: BookOpen,
    tone: 'sky',
    filters: [
      {
        key: 'status',
        label: 'Statut',
        type: 'select',
        options: [
          { value: '', label: 'Tous statuts' },
          { value: 'DRAFT', label: 'Brouillons' },
          { value: 'PUBLISHED', label: 'Publiés' },
          { value: 'ARCHIVED', label: 'Archivés' },
        ],
      },
    ],
  },
  {
    key: 'enrollments',
    label: 'Inscriptions',
    description:
      'Inscriptions apprenant×cours avec progression et statut. Filtrable par période.',
    endpoint: '/admin/reports/enrollments.csv',
    Icon: ClipboardList,
    tone: 'emerald',
    filters: [
      {
        key: 'status',
        label: 'Statut',
        type: 'select',
        options: [
          { value: '', label: 'Tous statuts' },
          { value: 'ACTIVE', label: 'Actifs' },
          { value: 'COMPLETED', label: 'Terminés' },
          { value: 'CANCELED', label: 'Annulés' },
        ],
      },
      { key: 'since', label: 'Depuis', type: 'date' },
      { key: 'until', label: "Jusqu'au", type: 'date' },
    ],
  },
  {
    key: 'orders',
    label: 'Commandes',
    description:
      'Historique des commandes plateforme (montant, statut, coupon, dates).',
    endpoint: '/admin/reports/orders.csv',
    Icon: Wallet,
    tone: 'accent',
    filters: [
      {
        key: 'status',
        label: 'Statut',
        type: 'select',
        options: [
          { value: '', label: 'Tous statuts' },
          { value: 'PENDING', label: 'En attente' },
          { value: 'PAID', label: 'Payées' },
          { value: 'FAILED', label: 'Échouées' },
          { value: 'REFUNDED', label: 'Remboursées' },
        ],
      },
      { key: 'since', label: 'Depuis', type: 'date' },
      { key: 'until', label: "Jusqu'au", type: 'date' },
    ],
  },
  {
    key: 'payouts',
    label: 'Reversements',
    description:
      'Historique des reversements formateurs (brut, commission, net, statut).',
    endpoint: '/admin/reports/payouts.csv',
    Icon: Coins,
    tone: 'violet',
    filters: [
      {
        key: 'status',
        label: 'Statut',
        type: 'select',
        options: [
          { value: '', label: 'Tous statuts' },
          { value: 'PENDING', label: 'En attente' },
          { value: 'VALIDATED', label: 'Validés' },
          { value: 'PAID', label: 'Payés' },
        ],
      },
    ],
  },
];

export default function AdminReportsPage() {
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(
    null,
  );

  const download = async (report: ReportDef) => {
    setDownloading(report.key);
    setFlash(null);
    try {
      // Construit les query params depuis les filtres saisis
      const params: Record<string, string> = {};
      for (const f of report.filters ?? []) {
        const key = `${report.key}_${f.key}`;
        const v = filters[key];
        if (v) params[f.key] = v;
      }
      // Récupère via axios (avec JWT) puis crée un blob URL
      const res = await api.get<Blob>(report.endpoint, {
        params,
        responseType: 'blob',
      });
      // Extrait le nom de fichier depuis le header si disponible
      const cd =
        (res.headers['content-disposition'] as string | undefined) ?? '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `${report.key}.csv`;
      // Trigger download
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFlash({ kind: 'ok', msg: `Rapport ${report.label} téléchargé.` });
    } catch (err) {
      setFlash({ kind: 'err', msg: extractApiError(err, 'Erreur export.') });
    } finally {
      setDownloading(null);
    }
  };

  const setFilter = (reportKey: string, key: string, value: string) => {
    setFilters((f) => ({ ...f, [`${reportKey}_${key}`]: value }));
  };

  return (
    <AdminShell>
      <PageHeader
        title="Rapports"
        subtitle="Exports CSV des données plateforme, filtrables et téléchargeables."
        breadcrumbs={[
          { label: 'Administration', to: '/dashboard/admin' },
          { label: 'Plateforme' },
          { label: 'Rapports' },
        ]}
      />

      {flash && (
        <div
          className={
            'mb-5 rounded-xl px-4 py-2 text-sm ' +
            (flash.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200')
          }
          role="status"
        >
          {flash.msg}
        </div>
      )}

      {/* Bannière contexte */}
      <div className="mb-5 rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-900/20 dark:border-primary-800 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
        <div className="text-sm text-neutral-700 dark:text-neutral-300">
          <p className="font-bold">Exports synchrones (jusqu'à 10 000 lignes)</p>
          <p className="mt-1">
            Chaque export est généré à la volée en CSV UTF-8 (compatible
            Excel via BOM). Pour des volumes plus importants, un pipeline
            asynchrone Celery + storage MinIO est planifié en R45. Les
            colonnes financières sont en{' '}
            <code>gross_amount / commission_amount / net_amount</code>{' '}
            (arrondi 2 décimales).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {REPORTS.map((report) => {
          const isOpen = openReport === report.key;
          const isDownloading = downloading === report.key;
          return (
            <Card key={report.key}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <StatCard
                    Icon={report.Icon}
                    label=""
                    value=""
                    tone={report.tone}
                    className="!p-2 !border-0 !bg-transparent !w-auto"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-neutral-900 dark:text-white">
                      {report.label}
                    </h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                      {report.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardBody>
                {report.filters && report.filters.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenReport(isOpen ? null : report.key)
                      }
                      className="text-xs font-semibold text-primary-700 hover:text-primary-800 inline-flex items-center gap-1 mb-2"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      {isOpen ? 'Masquer les filtres' : 'Afficher les filtres'}
                    </button>
                    {isOpen && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                        {report.filters.map((f) => (
                          <div key={f.key}>
                            <label className="block text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">
                              {f.label}
                            </label>
                            {f.type === 'select' && f.options ? (
                              <select
                                value={filters[`${report.key}_${f.key}`] ?? ''}
                                onChange={(e) =>
                                  setFilter(report.key, f.key, e.target.value)
                                }
                                className="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                              >
                                {f.options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                type={f.type}
                                value={filters[`${report.key}_${f.key}`] ?? ''}
                                onChange={(e) =>
                                  setFilter(report.key, f.key, e.target.value)
                                }
                                placeholder={f.placeholder}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-700">
                  <p className="text-[11px] text-neutral-500">
                    Endpoint :{' '}
                    <code className="bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 rounded">
                      {report.endpoint}
                    </code>
                  </p>
                  <button
                    type="button"
                    onClick={() => download(report)}
                    disabled={isDownloading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition disabled:opacity-60"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Génération…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Télécharger CSV
                      </>
                    )}
                  </button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5">
        <h3 className="font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary-600" />
          Roadmap R45+ — Rapports avancés
        </h3>
        <ul className="mt-3 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          <li className="flex items-start gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
            <span>
              Pipeline asynchrone Celery pour les exports {'>'}10k lignes
              (job en base + email de notification à la fin).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
            <span>Export Excel natif (.xlsx) avec formatage + graphiques.</span>
          </li>
          <li className="flex items-start gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
            <span>Rapports PDF prêts à imprimer (utilise Weasyprint).</span>
          </li>
          <li className="flex items-start gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
            <span>
              Planification automatique (rapport hebdo revenus envoyé chaque
              lundi 8h aux platform_admins par email).
            </span>
          </li>
        </ul>
      </div>
    </AdminShell>
  );
}
