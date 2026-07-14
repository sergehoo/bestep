/**
 * CourseMetadataTab.tsx — Onglet métadonnées de l'éditeur (R6.4).
 */
import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { CourseCertificationSection } from '@/components/instructor/CourseCertificationSection';
import { CourseCoverSection } from '@/components/instructor/CourseCoverSection';
import { useUpdateInstructorCourse } from '@/hooks/instructor';
import { usePublicCategories } from '@/hooks/queries';
import { extractApiError } from '@/lib/utils';
import type {
  InstructorCourseListItem,
  CourseType,
  PricingType,
} from '@/lib/types';

interface Props {
  course: InstructorCourseListItem;
}

interface FormValues {
  title: string;
  subtitle: string;
  description: string;
  course_type: CourseType;
  pricing_type: PricingType;
  price: string;
  currency: string;
  category_id: string;
}

const COURSE_TYPES: CourseType[] = [
  'CERTIFIANTE',
  'PROFESSIONNELLE',
  'ACADEMIQUE',
  'INTERNE',
];

const PRICING_TYPES: PricingType[] = ['FREE', 'PAID', 'HYBRID'];

export function CourseMetadataTab({ course }: Props) {
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const { data: categories } = usePublicCategories();
  const update = useUpdateInstructorCourse(course.id);

  const { register, handleSubmit, reset, watch, formState, control } = useForm<FormValues>({
    defaultValues: {
      title: course.title,
      subtitle: course.subtitle || '',
      description: course.description || '',
      course_type: course.course_type,
      pricing_type: course.pricing_type,
      price: course.price ?? '',
      currency: course.currency || 'XOF',
      category_id: course.category ? String(course.category.id) : '',
    },
  });

  useEffect(() => {
    reset({
      title: course.title,
      subtitle: course.subtitle || '',
      description: course.description || '',
      course_type: course.course_type,
      pricing_type: course.pricing_type,
      price: course.price ?? '',
      currency: course.currency || 'XOF',
      category_id: course.category ? String(course.category.id) : '',
    });
  }, [course, reset]);

  const pricing = watch('pricing_type');

  async function onSubmit(v: FormValues) {
    setFlash(null);
    try {
      await update.mutateAsync({
        title: v.title,
        subtitle: v.subtitle || undefined,
        description: v.description || undefined,
        course_type: v.course_type,
        pricing_type: v.pricing_type,
        price: v.pricing_type === 'FREE' ? '0' : v.price || '0',
        currency: v.currency || 'XOF',
        category_id: v.category_id ? Number(v.category_id) : null,
      });
      setFlash({ kind: 'ok', msg: 'Modifications enregistrées.' });
    } catch (err) {
      setFlash({ kind: 'err', msg: extractApiError(err) });
    }
  }

  return (
    <div className="space-y-6">
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Input
        label="Titre"
        required
        {...register('title', { required: true })}
        error={formState.errors.title ? 'Titre requis' : undefined}
      />
      <Input label="Sous-titre" {...register('subtitle')} />
      <div>
        <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
          Description
        </label>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <RichTextEditor
              value={field.value || ''}
              onChange={field.onChange}
              placeholder="Décrivez votre cours : objectifs, prérequis, public cible, résultats attendus…"
              minHeight="200px"
            />
          )}
        />
      </div>

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
            Type de cours
          </label>
          <select
            {...register('course_type')}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-primary-200/60"
          >
            {COURSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
            Tarification
          </label>
          <select
            {...register('pricing_type')}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-4 focus:ring-primary-200/60"
          >
            {PRICING_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {pricing !== 'FREE' && (
          <>
            <Input label="Prix" type="number" min={0} {...register('price')} />
            <Input label="Devise" {...register('currency')} />
          </>
        )}
      </div>

      {flash && (
        <p
          className={
            flash.kind === 'ok'
              ? 'text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2'
              : 'text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2'
          }
        >
          {flash.msg}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={update.isPending}>
          <Save className="w-4 h-4" />
          Enregistrer
        </Button>
      </div>
    </form>

    {/* T6 — Section Image de couverture */}
    <CourseCoverSection
      courseId={course.id}
      courseTitle={course.title}
      currentThumbnailUrl={course.thumbnail_url ?? null}
      canEdit={course.can_edit}
    />

    {/* R20.4 — Section Certification */}
    <CourseCertificationSection
      courseId={course.id}
      courseTitle={course.title}
      currentTemplateId={course.certificate_template ?? null}
      canEdit={course.can_edit}
    />
    </div>
  );
}
