/**
 * InstructorCourseNewPage.tsx — Wizard création cours (R6.3).
 *
 * Étapes :
 *  1. Bases   : titre, sous-titre, catégorie, type
 *  2. Détails : description, tarification, prix
 *  3. Résumé  : preview + submit
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  ChevronRight,
  Check,
  FileText,
  Layers,
  Tag,
} from 'lucide-react';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { usePublicCategories } from '@/hooks/queries';
import { useCreateInstructorCourse } from '@/hooks/instructor';
import { extractApiError, cn } from '@/lib/utils';
import type { CourseType, PricingType } from '@/lib/types';

const schema = z.object({
  title: z.string().min(4, 'Titre trop court'),
  subtitle: z.string().max(180).optional().or(z.literal('')),
  category_id: z
    .union([z.string().min(1), z.number()])
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  course_type: z.enum(['CERTIFIANTE', 'PROFESSIONNELLE', 'ACADEMIQUE', 'INTERNE']),
  description: z.string().min(20, 'Décrivez votre cours (20 caractères min)'),
  pricing_type: z.enum(['FREE', 'PAID', 'HYBRID']),
  price: z.string().optional().or(z.literal('')),
  currency: z.string().default('XOF'),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: 'Bases', Icon: Tag },
  { id: 2, label: 'Détails', Icon: FileText },
  { id: 3, label: 'Résumé', Icon: Layers },
];

const COURSE_TYPES: Array<{ value: CourseType; label: string }> = [
  { value: 'CERTIFIANTE', label: 'Certifiante' },
  { value: 'PROFESSIONNELLE', label: 'Professionnelle' },
  { value: 'ACADEMIQUE', label: 'Académique' },
  { value: 'INTERNE', label: 'Interne (entreprise)' },
];

const PRICING_TYPES: Array<{ value: PricingType; label: string; hint: string }> = [
  { value: 'FREE', label: 'Gratuit', hint: 'Accessible sans paiement' },
  { value: 'PAID', label: 'Payant', hint: 'Tarif fixe à définir' },
  { value: 'HYBRID', label: 'Hybride', hint: 'Certaines leçons gratuites' },
];

export default function InstructorCourseNewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: categories } = usePublicCategories();
  const create = useCreateInstructorCourse();

  const { register, handleSubmit, watch, formState, trigger } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      subtitle: '',
      category_id: undefined,
      course_type: 'PROFESSIONNELLE',
      description: '',
      pricing_type: 'FREE',
      price: '',
      currency: 'XOF',
    },
    mode: 'onBlur',
  });

  const values = watch();

  async function goNext() {
    let fields: (keyof FormValues)[] = [];
    if (step === 1) fields = ['title', 'course_type'];
    if (step === 2) fields = ['description', 'pricing_type'];
    const ok = await trigger(fields);
    if (ok) setStep((s) => Math.min(3, s + 1));
  }

  async function onSubmit(v: FormValues) {
    setServerError(null);
    try {
      const payload = {
        ...v,
        subtitle: v.subtitle || undefined,
        price: v.pricing_type === 'FREE' ? '0' : v.price || '0',
        category_id: v.category_id ?? undefined,
      };
      const created = await create.mutateAsync(payload);
      navigate(`/instructor/courses/${created.id}/edit`);
    } catch (err) {
      setServerError(extractApiError(err));
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <PublicHeader />
      <section className="border-b border-neutral-200 bg-white">
        <div className="container mx-auto px-4 max-w-4xl py-6">
          <Link
            to="/instructor/courses"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Retour à mes cours
          </Link>
          <h1 className="text-2xl font-extrabold">Nouveau cours</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Créez la base de votre formation. Vous pourrez ajouter modules et
            leçons ensuite.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 max-w-4xl py-8">
        {/* Stepper */}
        <ol className="flex items-center gap-2 mb-6" aria-label="Étapes">
          {STEPS.map((s, idx) => {
            const active = s.id === step;
            const done = s.id < step;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                    active && 'bg-primary-600 text-white',
                    done && 'bg-emerald-500 text-white',
                    !active && !done && 'bg-neutral-100 text-neutral-500',
                  )}
                >
                  {done ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span
                  className={cn(
                    'text-sm font-semibold',
                    active ? 'text-neutral-900' : 'text-neutral-500',
                  )}
                >
                  {s.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-neutral-300 mx-2" />
                )}
              </li>
            );
          })}
        </ol>

        <Card>
          <CardBody>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Étape 1 */}
              {step === 1 && (
                <>
                  <Input
                    label="Titre du cours"
                    required
                    placeholder="Ex : Investir en bourse — les bases"
                    {...register('title')}
                    error={formState.errors.title?.message}
                  />
                  <Input
                    label="Sous-titre"
                    placeholder="Une phrase qui donne envie"
                    {...register('subtitle')}
                    error={formState.errors.subtitle?.message}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
                        Catégorie
                      </label>
                      <select
                        {...register('category_id')}
                        className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-primary-200/60"
                      >
                        <option value="">— Aucune —</option>
                        {(categories ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
                        Type de cours <span className="text-rose-600">*</span>
                      </label>
                      <select
                        {...register('course_type')}
                        className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-primary-200/60"
                      >
                        {COURSE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Étape 2 */}
              {step === 2 && (
                <>
                  <Textarea
                    label="Description"
                    required
                    rows={6}
                    placeholder="Ce que les apprenants vont apprendre, les prérequis, les résultats…"
                    {...register('description')}
                    error={formState.errors.description?.message}
                  />
                  <fieldset>
                    <legend className="text-xs font-bold text-neutral-700 uppercase tracking-wide mb-2">
                      Tarification *
                    </legend>
                    <div className="grid sm:grid-cols-3 gap-2">
                      {PRICING_TYPES.map((p) => {
                        const checked = values.pricing_type === p.value;
                        return (
                          <label
                            key={p.value}
                            className={cn(
                              'border rounded-xl p-3 cursor-pointer transition',
                              checked
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-neutral-200 hover:bg-neutral-50',
                            )}
                          >
                            <input
                              type="radio"
                              value={p.value}
                              {...register('pricing_type')}
                              className="sr-only"
                            />
                            <div className="font-semibold text-sm">{p.label}</div>
                            <div className="text-xs text-neutral-500 mt-0.5">
                              {p.hint}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {values.pricing_type !== 'FREE' && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Prix"
                        type="number"
                        min={0}
                        placeholder="Ex : 25000"
                        {...register('price')}
                      />
                      <Input
                        label="Devise"
                        placeholder="XOF"
                        {...register('currency')}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Étape 3 */}
              {step === 3 && (
                <div className="space-y-4">
                  <h2 className="text-base font-bold">Récapitulatif</h2>
                  <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                    <SummaryItem label="Titre" value={values.title} />
                    <SummaryItem label="Type" value={values.course_type} />
                    <SummaryItem
                      label="Catégorie"
                      value={
                        categories?.find(
                          (c) => c.id === Number(values.category_id),
                        )?.name ?? '—'
                      }
                    />
                    <SummaryItem
                      label="Tarification"
                      value={
                        values.pricing_type === 'FREE'
                          ? 'Gratuit'
                          : `${values.price || 0} ${values.currency || 'XOF'} (${values.pricing_type})`
                      }
                    />
                    <SummaryItem
                      label="Description"
                      value={values.description}
                      full
                    />
                  </dl>
                  {serverError && (
                    <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                      {serverError}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  disabled={step === 1}
                >
                  Précédent
                </Button>
                {step < 3 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={goNext}
                  >
                    Continuer <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={create.isPending}
                  >
                    Créer le cours
                  </Button>
                )}
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Debug tips */}
        <p className="mt-6 text-xs text-neutral-400">
          Après création, vous serez redirigé·e vers l'éditeur pour ajouter
          modules et leçons. Publication possible depuis l'onglet Actions.
        </p>
      </main>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string | number | undefined;
  full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-neutral-900 mt-0.5 whitespace-pre-line">
        {value || '—'}
      </dd>
    </div>
  );
}
