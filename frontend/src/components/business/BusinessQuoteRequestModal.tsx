import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Mail, Send, X } from 'lucide-react';

import api from '@/lib/api';
import { extractApiError } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';

export type QuotePlan = 'PRO' | 'ENTERPRISE' | 'DEMO' | 'UNSURE';

interface Props {
  open: boolean;
  initialPlan?: QuotePlan;
  source?: string;
  onClose: () => void;
}

interface Category {
  id: number;
  name: string;
}

interface QuoteResponse {
  reference: string;
  status: 'received';
  message: string;
}

interface QuoteForm {
  organization_name: string;
  organization_type: string;
  country: string;
  city: string;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string;
  preferred_contact: string;
  learners_count: string;
  plan_interest: QuotePlan;
  timeframe: string;
  budget_range: string;
  category_ids: number[];
  message: string;
  privacy_consent: boolean;
  website: string;
}

const selectClassName =
  'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 transition-colors focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-200/60';

const initialForm = (plan: QuotePlan): QuoteForm => ({
  organization_name: '',
  organization_type: 'COMPANY',
  country: 'Côte d’Ivoire',
  city: '',
  contact_name: '',
  contact_role: '',
  email: '',
  phone: '',
  preferred_contact: 'EMAIL',
  learners_count: '',
  plan_interest: plan,
  timeframe: '1_3_MONTHS',
  budget_range: '',
  category_ids: [],
  message: '',
  privacy_consent: false,
  website: '',
});

export function BusinessQuoteRequestModal({
  open,
  initialPlan = 'UNSURE',
  source = 'enterprise_page',
  onClose,
}: Props) {
  const [form, setForm] = useState<QuoteForm>(() => initialForm(initialPlan));
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<QuoteResponse | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(initialPlan));
    setError('');
    setSuccess(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRef.current) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [initialPlan, onClose, open]);

  useEffect(() => {
    if (!open || categories.length) return;
    api
      .get<Category[]>('/public/categories/')
      .then((response) => setCategories(response.data))
      .catch(() => setCategories([]));
  }, [categories.length, open]);

  const planTitle = useMemo(() => {
    if (initialPlan === 'PRO') return 'Demander un devis Pro';
    if (initialPlan === 'ENTERPRISE') return 'Parler à notre équipe Enterprise';
    return 'Réserver une démonstration';
  }, [initialPlan]);

  const update = <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleCategory = (id: number) => {
    update(
      'category_ids',
      form.category_ids.includes(id)
        ? form.category_ids.filter((item) => item !== id)
        : [...form.category_ids, id],
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await api.post<QuoteResponse>(
        '/public/business-interest-requests/',
        {
          ...form,
          learners_count: Number(form.learners_count),
          source,
        },
      );
      setSuccess(response.data);
    } catch (requestError) {
      setError(
        extractApiError(
          requestError,
          'La demande n’a pas pu être envoyée. Vérifiez les champs puis réessayez.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-modal-title"
        className="relative max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary-600">
              Offre entreprise
            </p>
            <h2
              id="quote-modal-title"
              className="mt-1 text-xl font-extrabold text-neutral-950 sm:text-2xl"
            >
              {planTitle}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Aucun compte requis. Notre équipe vous répond sous un jour ouvré.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fermer le formulaire"
            className="rounded-xl p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {success ? (
          <div className="px-6 py-14 text-center sm:px-10">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h3 className="mt-5 text-2xl font-extrabold text-neutral-950">
              Votre demande est transmise
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-neutral-600">{success.message}</p>
            <p className="mt-5 inline-flex rounded-full bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700">
              Référence : {success.reference}
            </p>
            <div className="mt-8">
              <Button type="button" size="lg" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-7 px-5 py-6 sm:px-7">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="col-span-full mb-1 text-sm font-extrabold text-neutral-950">
                Votre organisation
              </legend>
              <Input
                required
                label="Entreprise ou organisation"
                value={form.organization_name}
                onChange={(event) => update('organization_name', event.target.value)}
                placeholder="Nom de votre structure"
              />
              <label className="space-y-1.5">
                <span className="block text-xs font-bold uppercase tracking-wide text-neutral-700">
                  Type d’organisation <span className="text-rose-600">*</span>
                </span>
                <select
                  required
                  className={selectClassName}
                  value={form.organization_type}
                  onChange={(event) => update('organization_type', event.target.value)}
                >
                  <option value="COMPANY">Entreprise privée</option>
                  <option value="FINANCIAL">Institution financière</option>
                  <option value="PUBLIC">Administration / institution publique</option>
                  <option value="NGO">ONG / association</option>
                  <option value="EDUCATION">École / université</option>
                  <option value="OTHER">Autre organisation</option>
                </select>
              </label>
              <Input
                required
                label="Pays"
                value={form.country}
                onChange={(event) => update('country', event.target.value)}
              />
              <Input
                label="Ville"
                value={form.city}
                onChange={(event) => update('city', event.target.value)}
              />
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="col-span-full mb-1 text-sm font-extrabold text-neutral-950">
                Personne à contacter
              </legend>
              <Input
                required
                label="Nom et prénom"
                value={form.contact_name}
                onChange={(event) => update('contact_name', event.target.value)}
                autoComplete="name"
              />
              <Input
                required
                label="Fonction"
                value={form.contact_role}
                onChange={(event) => update('contact_role', event.target.value)}
                placeholder="DRH, responsable formation…"
              />
              <Input
                required
                type="email"
                label="E-mail professionnel"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                autoComplete="email"
              />
              <Input
                required
                type="tel"
                label="Téléphone"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                autoComplete="tel"
                placeholder="+225 …"
              />
              <label className="space-y-1.5 sm:col-span-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-neutral-700">
                  Canal de contact préféré <span className="text-rose-600">*</span>
                </span>
                <select
                  required
                  className={selectClassName}
                  value={form.preferred_contact}
                  onChange={(event) => update('preferred_contact', event.target.value)}
                >
                  <option value="EMAIL">E-mail</option>
                  <option value="PHONE">Téléphone</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </label>
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="col-span-full mb-1 text-sm font-extrabold text-neutral-950">
                Votre projet de formation
              </legend>
              <Input
                required
                type="number"
                min={1}
                max={1000000}
                label="Nombre d’employés bénéficiaires"
                value={form.learners_count}
                onChange={(event) => update('learners_count', event.target.value)}
                placeholder="Ex. 80"
              />
              <label className="space-y-1.5">
                <span className="block text-xs font-bold uppercase tracking-wide text-neutral-700">
                  Offre envisagée <span className="text-rose-600">*</span>
                </span>
                <select
                  required
                  className={selectClassName}
                  value={form.plan_interest}
                  onChange={(event) => update('plan_interest', event.target.value as QuotePlan)}
                >
                  <option value="PRO">Pro</option>
                  <option value="ENTERPRISE">Enterprise</option>
                  <option value="DEMO">Démonstration</option>
                  <option value="UNSURE">À définir avec un conseiller</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs font-bold uppercase tracking-wide text-neutral-700">
                  Période souhaitée <span className="text-rose-600">*</span>
                </span>
                <select
                  required
                  className={selectClassName}
                  value={form.timeframe}
                  onChange={(event) => update('timeframe', event.target.value)}
                >
                  <option value="IMMEDIATE">Dès que possible</option>
                  <option value="1_3_MONTHS">Dans 1 à 3 mois</option>
                  <option value="3_6_MONTHS">Dans 3 à 6 mois</option>
                  <option value="6_12_MONTHS">Dans 6 à 12 mois</option>
                  <option value="EXPLORING">Projet exploratoire</option>
                </select>
              </label>
              <Input
                label="Budget indicatif"
                value={form.budget_range}
                onChange={(event) => update('budget_range', event.target.value)}
                placeholder="Ex. 2 à 5 millions FCFA"
              />

              {categories.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                    Thématiques recherchées
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map((category) => {
                      const selected = form.category_ids.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleCategory(category.id)}
                          className={
                            'rounded-full border px-3 py-1.5 text-xs font-bold transition ' +
                            (selected
                              ? 'border-primary-600 bg-primary-600 text-white'
                              : 'border-neutral-200 bg-white text-neutral-600 hover:border-primary-300')
                          }
                        >
                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <Textarea
                  required
                  minLength={10}
                  maxLength={5000}
                  label="Décrivez votre besoin"
                  value={form.message}
                  onChange={(event) => update('message', event.target.value)}
                  helper="Objectifs, profils concernés, contraintes, contenus souhaités…"
                  rows={5}
                />
              </div>
            </fieldset>

            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px]"
              value={form.website}
              onChange={(event) => update('website', event.target.value)}
            />

            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
              <input
                required
                type="checkbox"
                checked={form.privacy_consent}
                onChange={(event) => update('privacy_consent', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                J’accepte que mes informations soient utilisées par Best-Épargne
                uniquement pour répondre à cette demande commerciale.
              </span>
            </label>

            {error && (
              <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            <footer className="flex flex-col-reverse gap-3 border-t border-neutral-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-xs text-neutral-500">
                <Mail className="h-4 w-4" />
                Vos coordonnées ne sont pas publiées.
              </p>
              <Button type="submit" size="lg" loading={isSubmitting}>
                <Send className="h-4 w-4" />
                Envoyer ma demande
              </Button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
