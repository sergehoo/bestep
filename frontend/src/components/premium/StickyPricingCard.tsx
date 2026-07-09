/**
 * StickyPricingCard.tsx — Carte prix sticky façon Udemy (R9.4).
 *
 * Features :
 *  - Sticky sur desktop (top-24)
 *  - Vidéo/thumbnail cliquable → preview lecture
 *  - Prix + ancien prix + % promo
 *  - Bouton principal (Acheter / Commencer / S'inscrire)
 *  - Bouton favoris + panier + partage
 *  - Bandeau garantie + paiement sécurisé
 *  - Contenu inclus (leçons, durée, docs, certificat)
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Play,
  Heart,
  Share2,
  ShoppingCart,
  ShieldCheck,
  Award,
  BookOpen,
  Clock,
  BadgeCheck,
  Rocket,
  ArrowRight,
  Download,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { derivePrice } from '@/lib/course-meta';
import { formatDuration } from '@/lib/utils';
import type { CTADescriptor } from '@/lib/enrollment-state';
import type { PublicCourseDetail } from '@/lib/types';

interface StickyPricingCardProps {
  course: PublicCourseDetail & { old_price?: string | number | null };
  isAuthed: boolean;
  isPending: boolean;
  onEnroll: () => void;
  onOpenPreview?: () => void;
  onToggleFavorite?: () => void;
  onShare?: () => void;
  isFavorite?: boolean;
  /** Descripteur d'état R18 : détermine label + href + progression. */
  cta: CTADescriptor;
}

export function StickyPricingCard({
  course,
  isAuthed: _isAuthed,
  isPending,
  onEnroll,
  onOpenPreview,
  onToggleFavorite,
  onShare,
  isFavorite,
  cta,
}: StickyPricingCardProps) {
  const price = derivePrice(course);
  const isCertifying = course.course_type === 'CERTIFIANTE';
  const isEnrolled =
    cta.state === 'ENROLLED_NEW' ||
    cta.state === 'ENROLLED_IN_PROGRESS' ||
    cta.state === 'COMPLETED';
  // Icône adaptative sur le bouton principal
  const PrimaryIcon =
    cta.state === 'ENROLLED_NEW'
      ? Rocket
      : cta.state === 'ENROLLED_IN_PROGRESS'
        ? Play
        : cta.state === 'COMPLETED'
          ? BadgeCheck
          : ShoppingCart;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="bg-white border border-neutral-100 rounded-2xl shadow-lift overflow-hidden"
      aria-label="Prix et achat du cours"
    >
      {/* Thumbnail + play overlay */}
      {course.thumbnail_url ? (
        <button
          type="button"
          onClick={onOpenPreview}
          className="relative block w-full group focus:outline-none"
          aria-label="Aperçu du cours"
        >
          <img
            src={course.thumbnail_url}
            alt=""
            className="w-full aspect-video object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/25 group-hover:bg-neutral-900/45 transition">
            <span className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lift group-hover:scale-110 transition">
              <Play className="w-6 h-6 text-primary-700 fill-primary-700 ml-1" />
            </span>
          </div>
          <span className="absolute bottom-2 left-2 text-[11px] font-bold px-2 py-1 rounded-md bg-black/60 text-white">
            Aperçu vidéo
          </span>
        </button>
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-primary-100 to-accent-100" />
      )}

      <div className="p-4 sm:p-5">
        {/* Price */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-2xl sm:text-3xl font-extrabold text-primary-700">
            {price.main}
          </p>
          {price.old && (
            <>
              <p className="text-sm text-neutral-400 line-through">
                {price.old}
              </p>
              {price.discountPercent && (
                <Badge variant="danger" size="sm">
                  -{price.discountPercent}%
                </Badge>
              )}
            </>
          )}
        </div>

        {price.discountPercent && !isEnrolled && (
          <p className="mt-2 text-xs text-rose-600 font-semibold inline-flex items-center gap-1">
            ⏱ Offre limitée
          </p>
        )}

        {/* Progression si inscrit avec avancement */}
        {cta.progressPercent !== undefined && cta.state !== 'COMPLETED' && (
          <div className="mt-4">
            <ProgressBar
              value={cta.progressPercent}
              showValue
              label="Votre progression"
              size="sm"
              color="primary"
            />
          </div>
        )}
        {cta.state === 'COMPLETED' && (
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 w-full">
            <BadgeCheck className="w-4 h-4" />
            Cours terminé 🎉
          </div>
        )}

        {/* CTA principal — 5 états gérés par le descripteur */}
        {cta.primaryHref ? (
          <Link
            to={cta.primaryHref}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-base font-bold shadow-sm transition"
          >
            <PrimaryIcon className="w-4 h-4" />
            {cta.primaryLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-4"
            loading={isPending}
            onClick={onEnroll}
          >
            <PrimaryIcon className="w-4 h-4" />
            {cta.primaryLabel}
          </Button>
        )}

        {/* CTA secondaire (Certificat) */}
        {cta.showCertificateButton && cta.secondaryHref && (
          <Link
            to={cta.secondaryHref}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 text-primary-900 text-sm font-bold transition"
          >
            <Download className="w-4 h-4" />
            {cta.secondaryLabel}
          </Link>
        )}

        {/* Favoris + Partage */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          {onToggleFavorite && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
            >
              <Heart
                className={isFavorite ? 'w-4 h-4 fill-rose-500 text-rose-500' : 'w-4 h-4'}
              />
              {isFavorite ? 'Enregistré' : 'Favoris'}
            </Button>
          )}
          {onShare && (
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 className="w-4 h-4" />
              Partager
            </Button>
          )}
        </div>

        {/* Panier — uniquement si non-inscrit ET payant */}
        {!price.isFree && !isEnrolled && (
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            className="mt-2"
            onClick={onEnroll}
          >
            <ShoppingCart className="w-4 h-4" />
            Ajouter au panier
          </Button>
        )}

        {/* Ce qui est inclus */}
        <div className="mt-5 pt-4 border-t border-neutral-100">
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">
            Ce cours inclut
          </h3>
          <ul className="space-y-1.5 text-sm text-neutral-700">
            {course.total_duration_sec > 0 && (
              <li className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-600 shrink-0" />
                {formatDuration(course.total_duration_sec)} de contenu
              </li>
            )}
            {course.lessons_count > 0 && (
              <li className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary-600 shrink-0" />
                {course.lessons_count} leçons réparties en{' '}
                {course.sections_count} sections
              </li>
            )}
            {isCertifying && (
              <li className="flex items-center gap-2">
                <Award className="w-4 h-4 text-primary-600 shrink-0" />
                Certificat de complétion
              </li>
            )}
            <li className="flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-primary-600 shrink-0" />
              Accès à vie sur ordinateur et mobile
            </li>
          </ul>
        </div>

        {/* Garanties */}
        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="w-4 h-4" />
            Garantie satisfait ou remboursé — 14 jours
          </p>
          <p className="mt-1 text-[11px] text-emerald-700">
            Paiement sécurisé · Support client 7j/7
          </p>
        </div>
      </div>
    </motion.aside>
  );
}
