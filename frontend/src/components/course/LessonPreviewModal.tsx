/**
 * LessonPreviewModal.tsx — Modal preview d'une leçon marquée is_preview.
 * A11y : Esc close, focus trap léger, aria-modal.
 */
import { useEffect, useRef } from 'react';
import { X, Play } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useLessonPreview } from '@/hooks/queries';
import { formatDuration } from '@/lib/utils';
import { sanitizeRichHtml } from '@/lib/sanitize';

interface LessonPreviewModalProps {
  slug: string;
  lessonId: number | null;
  onClose: () => void;
}

/**
 * Convertit une URL YouTube en URL embed no-cookie.
 * Supporte watch?v=, youtu.be/, embed/.
 */
function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v');
      if (!videoId && u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/')[2] || null;
      }
    } else if (u.hostname.includes('youtu.be')) {
      videoId = u.pathname.slice(1) || null;
    }
    if (!videoId) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  } catch {
    return null;
  }
}

export function LessonPreviewModal({ slug, lessonId, onClose }: LessonPreviewModalProps) {
  const { data, isLoading, error } = useLessonPreview(slug, lessonId);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const open = lessonId !== null;

  // Esc close + focus initial
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus close button
    setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const embedUrl = data?.video_url ? toYouTubeEmbed(data.video_url) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-lift overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <div className="flex items-center gap-2 min-w-0">
            <Play className="w-4 h-4 text-primary-600 shrink-0" />
            <h2
              id="preview-title"
              className="text-base font-bold truncate"
              title={data?.title || 'Aperçu de la leçon'}
            >
              {data?.title || 'Aperçu de la leçon'}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 transition"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="p-10 flex justify-center">
              <Spinner label="Chargement de la leçon…" />
            </div>
          )}

          {error && !isLoading && (
            <div className="p-6">
              <p className="text-sm text-red-600">
                Impossible de charger cette leçon. Elle n'est peut-être pas
                disponible en aperçu.
              </p>
            </div>
          )}

          {data && !isLoading && (
            <div className="p-5 space-y-4">
              {data.duration_sec > 0 && (
                <p className="text-xs text-neutral-500">
                  Durée : {formatDuration(data.duration_sec)}
                </p>
              )}

              {embedUrl ? (
                <div className="aspect-video bg-neutral-900 rounded-xl overflow-hidden">
                  <iframe
                    src={embedUrl}
                    title={data.title}
                    className="w-full h-full"
                    frameBorder={0}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : data.video_url ? (
                <div className="aspect-video bg-neutral-900 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={data.video_url}
                    controls
                    className="w-full h-full"
                    preload="metadata"
                  />
                </div>
              ) : null}

              {data.content && (
                <div
                  className="prose prose-sm max-w-none text-neutral-800 prose-a:text-primary-600 prose-headings:font-extrabold prose-blockquote:border-l-4 prose-blockquote:border-primary-300 prose-blockquote:bg-primary-50/50 prose-blockquote:italic prose-img:rounded-xl"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(data.content) }}
                />
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 text-xs text-neutral-500 text-right">
          Aperçu gratuit — inscrivez-vous pour accéder à toutes les leçons.
        </footer>
      </div>
    </div>
  );
}
