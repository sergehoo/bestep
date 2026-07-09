/**
 * InstructorReportsPage.tsx — Générateur de rapports (R13.6).
 * Export CSV / JSON côté client (pas de dépendance PDF pour rester léger).
 */
import { useState } from 'react';
import {
  FileText,
  Download,
  BarChart3,
  Users,
  Wallet,
  Star,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { useInstructorDashboard } from '@/hooks/queries';
import { useInstructorCourses } from '@/hooks/instructor';
import { formatPrice } from '@/lib/utils';
import type { DashboardPeriod } from '@/lib/types';

type ReportType = 'courses' | 'revenue' | 'enrollments' | 'reviews';

interface ReportDef {
  id: ReportType;
  title: string;
  desc: string;
  Icon: typeof FileText;
}

const REPORTS: ReportDef[] = [
  {
    id: 'courses',
    title: 'Catalogue',
    desc: 'Liste complète de vos cours avec inscrits, note, prix.',
    Icon: FileText,
  },
  {
    id: 'enrollments',
    title: 'Inscriptions',
    desc: 'Nouvelles inscriptions jour par jour sur la période.',
    Icon: Users,
  },
  {
    id: 'revenue',
    title: 'Revenus',
    desc: 'Chiffre d\'affaires quotidien + total.',
    Icon: Wallet,
  },
  {
    id: 'reviews',
    title: 'Avis',
    desc: 'Récapitulatif des notes reçues.',
    Icon: Star,
  },
];

export default function InstructorReportsPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const { data: dash } = useInstructorDashboard(period);
  const { data: courses } = useInstructorCourses();

  const generate = (type: ReportType, format: 'csv' | 'json') => {
    let filename = `rapport-${type}-${new Date().toISOString().slice(0, 10)}`;
    let content = '';
    let mime = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json';

    if (type === 'courses') {
      const rows = (courses ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        pricing_type: c.pricing_type,
        price: c.price,
        currency: c.currency,
        enrolled_count: c.enrolled_count,
        rating_avg: c.rating_avg ?? 0,
        rating_count: c.rating_count ?? 0,
        updated_at: c.updated_at_human,
      }));
      content = format === 'csv' ? toCSV(rows) : JSON.stringify(rows, null, 2);
    } else if (type === 'enrollments') {
      const rows = (dash?.series?.enrollments_per_day ?? []).map((p) => ({
        date: p.date,
        enrollments: p.value,
      }));
      content = format === 'csv' ? toCSV(rows) : JSON.stringify(rows, null, 2);
    } else if (type === 'revenue') {
      const rows = (dash?.series?.revenue_per_day ?? []).map((p) => ({
        date: p.date,
        revenue: p.value,
        currency: 'XOF',
      }));
      content = format === 'csv' ? toCSV(rows) : JSON.stringify(rows, null, 2);
    } else if (type === 'reviews') {
      const rows = (courses ?? []).map((c) => ({
        course: c.title,
        rating_avg: c.rating_avg ?? 0,
        rating_count: c.rating_count ?? 0,
        completion_rate: c.completion_rate ?? 0,
      }));
      content = format === 'csv' ? toCSV(rows) : JSON.stringify(rows, null, 2);
    }

    filename += format === 'csv' ? '.csv' : '.json';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gross = (dash?.series?.revenue_per_day ?? []).reduce(
    (s, p) => s + (p.value ?? 0),
    0,
  );

  return (
    <InstructorShell
      title="Rapports"
      subtitle="Exports CSV / JSON prêts à l'emploi"
      actions={<PeriodSelector value={period} onChange={setPeriod} />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        <SummaryTile
          label="Cours"
          value={courses?.length ?? 0}
          Icon={FileText}
        />
        <SummaryTile
          label="Inscrits total"
          value={dash?.kpis?.total_enrollments ?? 0}
          Icon={Users}
        />
        <SummaryTile
          label="Revenus"
          value={formatPrice(gross, 'XOF')}
          Icon={Wallet}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.title}
              subtitle={r.desc}
              actions={<r.Icon className="w-5 h-5 text-neutral-400" aria-hidden />}
            />
            <CardBody>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => generate(r.id, 'csv')}
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generate(r.id, 'json')}
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter JSON
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-neutral-400 flex items-center gap-1.5">
        <BarChart3 className="w-3 h-3" />
        Les exports PDF, Excel avec templates et Power BI arriveront en R14
        (backend requis pour un rendu propre).
      </p>
    </InstructorShell>
  );
}

function SummaryTile({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number | string;
  Icon: typeof FileText;
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 p-4 bg-white flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-extrabold">{value}</p>
        <p className="text-[11px] text-neutral-500 uppercase tracking-wide">
          {label}
        </p>
      </div>
    </div>
  );
}

function toCSV(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          const s = v == null ? '' : String(v);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(','),
    ),
  ];
  return lines.join('\n');
}
