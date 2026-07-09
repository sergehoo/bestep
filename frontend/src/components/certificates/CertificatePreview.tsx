/**
 * CertificatePreview.tsx — R20.3
 *
 * Rendu réutilisable d'un certificat à partir d'un `CertificateTemplate` +
 * données dynamiques (student_name, course_title, …). Utilisé :
 *   - dans la page instructor "Modèles de certificats" pour la preview
 *   - dans `CertifyPage` (R20.5) pour le rendu réel imprimable.
 *
 * Le composant s'adapte à `orientation` (landscape / portrait) via un
 * ratio A4 respectif (1.414 vs 0.707). Chaque style expose une variante
 * visuelle (gradient, bordures, filigrane) construite à partir des
 * couleurs primary / accent / text du template.
 */
import { Award, QrCode } from 'lucide-react';

import {
  type CertificateTemplate,
  type CertificateVariableKey,
  renderCertificateText,
} from '@/hooks/certificate-templates';

export interface CertificatePreviewProps {
  template: CertificateTemplate;
  /** Valeurs des variables `{{student_name}}` etc. Fictives par défaut. */
  values?: Partial<Record<CertificateVariableKey, string | number>>;
  /** Ajouté à la carte externe. */
  className?: string;
  /** URL QR (image ou path). Si absent, un placeholder est affiché. */
  qrImageUrl?: string;
  /** Numéro / code affiché en bas si `show_serial`. */
  serial?: string;
  /** Mode impression : retire les ombres / marges. */
  printable?: boolean;
}

const DEFAULT_VALUES: Record<CertificateVariableKey, string> = {
  student_name: 'Aïcha Diallo',
  course_title: 'Fondamentaux de l\'épargne',
  instructor_name: 'Serge Ogah',
  completion_date: new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  certificate_number: 'BE-2026-000123',
  organization_name: 'BestÉpargne Academy',
  hours: '12 heures',
  score: '92',
  verification_url: 'https://best-epargne.com/certify/BE-2026-000123',
};

/**
 * Convertit un hex `#rrggbb` en `rgba()` avec alpha.
 * Retourne la couleur telle quelle si non parseable.
 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Style helper : renvoie le fond selon le style du template. */
function backgroundFor(template: CertificateTemplate): React.CSSProperties {
  const { style, primary_color, accent_color } = template;
  switch (style) {
    case 'modern':
      return {
        background: `linear-gradient(135deg, ${primary_color} 0%, ${accent_color} 100%)`,
        color: '#ffffff',
      };
    case 'premium':
      return {
        background: `radial-gradient(circle at 20% 20%, ${withAlpha(
          accent_color,
          0.3,
        )}, transparent 60%), ${primary_color}`,
        color: '#f8fafc',
      };
    case 'academic':
      return {
        background: `${primary_color}`,
        color: '#fdf6e3',
      };
    case 'enterprise':
      return {
        background: `linear-gradient(180deg, ${primary_color} 0%, ${withAlpha(
          primary_color,
          0.85,
        )} 100%)`,
        color: '#f0fdf4',
      };
    case 'minimal':
      return {
        background: '#ffffff',
        color: template.text_color,
      };
    case 'luxury':
      return {
        background: `linear-gradient(180deg, #0b0b0b 0%, ${primary_color} 100%)`,
        color: '#fef3c7',
      };
    case 'classic':
    default:
      return {
        background: `linear-gradient(180deg, ${primary_color} 0%, ${withAlpha(
          primary_color,
          0.85,
        )} 100%)`,
        color: '#ffffff',
      };
  }
}

/** Style helper : bordure décorative. */
function decorativeBorder(template: CertificateTemplate): React.CSSProperties {
  if (template.style === 'minimal') {
    return {
      border: `1px solid ${withAlpha(template.text_color, 0.15)}`,
    };
  }
  return {
    borderColor: withAlpha(template.accent_color, 0.55),
  };
}

export function CertificatePreview({
  template,
  values,
  className = '',
  qrImageUrl,
  serial,
  printable = false,
}: CertificatePreviewProps) {
  const finalValues: Partial<Record<CertificateVariableKey, string | number>> =
    { ...DEFAULT_VALUES, ...values };

  // Aspect ratio A4
  const ratio = template.orientation === 'portrait' ? '0.707' : '1.414';

  const heading = renderCertificateText(template.heading_text, finalValues);
  const body = renderCertificateText(template.body_text, finalValues);
  const footer = renderCertificateText(template.footer_text, finalValues);

  const bgStyle = backgroundFor(template);
  const borderStyle = decorativeBorder(template);

  const showBorderInner = template.style !== 'minimal';

  return (
    <div
      role="img"
      aria-label={`Aperçu certificat ${template.name}`}
      className={[
        'relative w-full flex flex-col overflow-hidden',
        printable ? 'shadow-none' : 'shadow-lift rounded-2xl',
        className,
      ].join(' ')}
      style={{
        aspectRatio: ratio,
        fontFamily: template.font_family,
        ...bgStyle,
      }}
    >
      {/* Filigrane éventuel */}
      {template.watermark_url && (
        <img
          src={template.watermark_url}
          alt=""
          className="absolute inset-0 w-full h-full object-contain opacity-10 pointer-events-none"
        />
      )}

      {/* Bordure décorative */}
      {showBorderInner && (
        <div
          aria-hidden
          className="absolute inset-4 rounded-2xl border-2 pointer-events-none"
          style={borderStyle}
        />
      )}

      <div className="relative flex-1 flex flex-col p-6 sm:p-10">
        {/* Header : organisation + logo/QR */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {template.logo_url ? (
              <img
                src={template.logo_url}
                alt=""
                className="h-10 sm:h-12 mb-2 object-contain"
              />
            ) : null}
            <p
              className="text-[10px] sm:text-xs tracking-[0.2em] uppercase font-semibold"
              style={{ color: withAlpha(template.accent_color, 0.9) }}
            >
              {template.organization_name ||
                String(finalValues.organization_name ?? '')}
            </p>
            <h1 className="mt-1 text-xl sm:text-3xl font-extrabold flex items-center gap-2 leading-tight">
              {template.style !== 'minimal' && (
                <Award
                  className="w-5 h-5 sm:w-7 sm:h-7 shrink-0"
                  style={{ color: template.accent_color }}
                />
              )}
              <span>{heading}</span>
            </h1>
          </div>

          {template.show_qr_code && (
            <div
              className="shrink-0 rounded-lg flex items-center justify-center"
              style={{
                background:
                  template.style === 'minimal'
                    ? withAlpha(template.text_color, 0.05)
                    : 'rgba(255,255,255,0.12)',
                width: '3.75rem',
                height: '3.75rem',
              }}
            >
              {qrImageUrl ? (
                <img src={qrImageUrl} alt="QR" className="w-full h-full p-1" />
              ) : (
                <QrCode
                  className="w-10 h-10"
                  style={{ color: template.accent_color }}
                />
              )}
            </div>
          )}
        </div>

        {/* Corps */}
        <div className="mt-6 sm:mt-8 flex-1 flex flex-col justify-center">
          <p
            className="text-xs sm:text-sm uppercase tracking-widest"
            style={{ opacity: 0.7 }}
          >
            Ce certificat est décerné à
          </p>
          <p
            className="mt-2 text-3xl sm:text-5xl font-extrabold leading-tight"
            style={{
              color:
                template.style === 'minimal'
                  ? template.primary_color
                  : template.accent_color,
              fontFamily: template.font_family,
            }}
          >
            {String(finalValues.student_name)}
          </p>
          <div
            className="mt-4 h-px w-24"
            style={{ background: withAlpha(template.accent_color, 0.5) }}
          />
          <p
            className="mt-4 text-sm sm:text-base leading-relaxed max-w-xl"
            style={{ opacity: 0.9 }}
          >
            {body}
          </p>
        </div>

        {/* Footer : dates / signature / serial */}
        <div className="mt-6 pt-4 flex flex-wrap items-end justify-between gap-4 text-xs sm:text-sm">
          <div>
            {template.show_completion_date && (
              <>
                <p className="uppercase tracking-widest opacity-70">Délivré le</p>
                <p className="mt-1 font-bold text-sm sm:text-base">
                  {String(finalValues.completion_date)}
                </p>
              </>
            )}
            {footer && (
              <p className="mt-2 italic opacity-70 max-w-sm">{footer}</p>
            )}
          </div>

          <div className="text-right">
            {template.signature_image_url ? (
              <img
                src={template.signature_image_url}
                alt=""
                className="h-10 sm:h-14 ml-auto"
              />
            ) : (
              <div
                className="h-10 sm:h-14 w-40 ml-auto flex items-end justify-center"
                style={{
                  borderBottom: `1px solid ${withAlpha(
                    template.accent_color,
                    0.6,
                  )}`,
                }}
              >
                <span
                  className="text-lg italic"
                  style={{ fontFamily: 'cursive' }}
                >
                  {template.signature_name ||
                    String(finalValues.instructor_name)}
                </span>
              </div>
            )}
            <p className="mt-1 font-semibold">
              {template.signature_name ||
                String(finalValues.instructor_name)}
            </p>
            {template.signature_title && (
              <p className="opacity-70">{template.signature_title}</p>
            )}
          </div>
        </div>

        {template.show_serial && (
          <p
            className="mt-2 text-[10px] sm:text-xs uppercase tracking-widest text-right"
            style={{ opacity: 0.6 }}
          >
            N° {serial || String(finalValues.certificate_number)}
          </p>
        )}
      </div>
    </div>
  );
}

export default CertificatePreview;
