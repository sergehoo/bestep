/**
 * MediaLibraryPanel.tsx — Grille médias filtrable + upload drag-drop (R16.3).
 *
 * Props :
 *  - `pickable=true` → chaque item est cliquable + retourne l'asset via
 *    `onPick` (utilisé dans MediaPickerDialog).
 *  - `pickable=false` → mode gestion : rename + delete.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Search,
  Film,
  Music,
  FileText,
  Trash2,
  PenSquare,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import {
  useInstructorMedia,
  useUploadMedia,
  useRenameMedia,
  useDeleteMedia,
  type MediaListParams,
} from '@/hooks/media';
import { extractApiError, cn } from '@/lib/utils';
import type { MediaAsset, MediaKind } from '@/lib/types';

const KIND_ICON: Record<MediaKind, typeof Film> = {
  video: Film,
  audio: Music,
  doc: FileText,
};

const KIND_LABEL: Record<MediaKind, string> = {
  video: 'Vidéo',
  audio: 'Audio',
  doc: 'Document',
};

// UX-07 — Gradients dégradés pour cartes vidéo/audio (au lieu de tenter
// de rendre <video preload=metadata> qui n'affiche pas fiablement la
// première frame sans un vrai worker de thumbnailing côté backend).
const KIND_GRADIENT: Record<MediaKind, string> = {
  video: 'bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 text-white',
  audio: 'bg-gradient-to-br from-accent-400 via-accent-500 to-orange-600 text-white',
  doc: 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 text-white',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  pickable?: boolean;
  onPick?: (asset: MediaAsset) => void;
  className?: string;
}

export function MediaLibraryPanel({ pickable = false, onPick, className }: Props) {
  const [params, setParams] = useState<MediaListParams>({});
  const [q, setQ] = useState('');
  const { data, isLoading, isFetching } = useInstructorMedia(params);
  const upload = useUploadMedia();
  const rename = useRenameMedia();
  const remove = useDeleteMedia();

  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const submitFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setParams((p) => ({ ...p, q: q.trim() || undefined }));
  };

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      setUploadErr(null);
      const list = Array.from(files);
      for (const file of list) {
        try {
          setUploadProgress(0);
          await upload.mutateAsync({
            file,
            onProgress: (p) => setUploadProgress(p),
          });
        } catch (err) {
          setUploadErr(
            extractApiError(err, `Échec de l'upload de ${file.name}.`),
          );
          break;
        }
      }
      setUploadProgress(0);
    },
    [upload],
  );

  const items = data?.results ?? [];

  return (
    <div className={cn('space-y-3', className)}>
      {/* Barre de contrôle */}
      <form
        onSubmit={submitFilters}
        className="flex flex-wrap items-end gap-2 bg-white border border-neutral-100 rounded-2xl p-3"
      >
        <div className="flex-1 min-w-[180px]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              aria-label="Rechercher un média"
              placeholder="Titre du fichier…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <select
          aria-label="Filtrer par type"
          value={params.kind ?? ''}
          onChange={(e) =>
            setParams((p) => ({
              ...p,
              kind: (e.target.value || undefined) as MediaKind | undefined,
            }))
          }
          className="border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Tous les types</option>
          <option value="video">Vidéos</option>
          <option value="audio">Audios</option>
          <option value="doc">Documents</option>
        </select>
        <Button type="submit" variant="outline" size="md">
          <Search className="w-4 h-4" />
          Filtrer
        </Button>
        <label
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold cursor-pointer transition',
            upload.isPending
              ? 'bg-neutral-200 text-neutral-500 cursor-progress'
              : 'bg-primary-600 text-white hover:bg-primary-700',
          )}
        >
          {upload.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {upload.isPending ? `${uploadProgress}%` : 'Uploader'}
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUpload(e.target.files);
                e.target.value = '';
              }
            }}
            disabled={upload.isPending}
          />
        </label>
      </form>

      {uploadErr && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {uploadErr}
        </p>
      )}

      {/* Zone drag & drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
        }}
        className={cn(
          'border-2 border-dashed rounded-2xl p-4 text-center text-sm transition',
          dragOver
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-neutral-200 text-neutral-500',
        )}
      >
        Glissez-déposez vos fichiers ici pour les uploader.
      </div>

      {/* Grille */}
      {isLoading && !data ? (
        <div className="py-12 flex justify-center">
          <Spinner label="Chargement de la médiathèque…" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-sm text-neutral-500 bg-white border border-neutral-100 rounded-2xl">
          Votre médiathèque est vide. Cliquez sur « Uploader » pour ajouter vos
          premiers fichiers.
        </div>
      ) : (
        <ul
          aria-busy={isFetching}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {items.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              pickable={pickable}
              onPick={onPick}
              onRename={(t) => rename.mutateAsync({ id: asset.id, title: t })}
              onDelete={() => remove.mutateAsync(asset.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function MediaCard({
  asset,
  pickable,
  onPick,
  onRename,
  onDelete,
}: {
  asset: MediaAsset;
  pickable: boolean;
  onPick?: (a: MediaAsset) => void;
  onRename: (title: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(asset.title);

  const handleRename = async () => {
    if (title.trim() && title !== asset.title) {
      await onRename(title.trim());
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer « ${asset.title} » ?`)) return;
    await onDelete();
  };

  const clickable = pickable && !editing;

  return (
    <motion.li
      whileHover={{ y: -3 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-white border border-neutral-100 rounded-2xl overflow-hidden shadow-soft',
        clickable && 'cursor-pointer hover:border-primary-300 hover:shadow-lift',
      )}
      onClick={() => {
        if (clickable) onPick?.(asset);
      }}
    >
      {/* UX-07 — Miniature :
          - Image (content_type image/*) → <img> avec fallback preview_url
            si thumbnail_url manque. En dernier recours, gradient + icône.
          - Vidéo / Audio → carte gradient avec grosse icône Play/Music
            (pas de <video> chargé dans la liste — coûteux + rendu peu
            fiable selon codec MinIO Range). Le vrai player s'affiche
            dans l'éditeur après clic sur la carte.
          - Autre doc (PDF, DOCX…) → gradient vert + icône FileText. */}
      <MediaCardThumbnail asset={asset} />
      <div className="p-3">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 min-w-0 border border-neutral-200 rounded-lg px-2 py-1 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setTitle(asset.title);
                  setEditing(false);
                }
              }}
            />
            <button
              onClick={handleRename}
              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
              aria-label="Enregistrer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setTitle(asset.title);
                setEditing(false);
              }}
              className="p-1 text-neutral-500 hover:bg-neutral-100 rounded"
              aria-label="Annuler"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-sm font-semibold truncate" title={asset.title}>
            {asset.title || 'Sans titre'}
          </p>
        )}
        <p className="text-[11px] text-neutral-500 mt-1">
          {KIND_LABEL[asset.kind]} · {formatSize(asset.size)}
          {asset.duration_seconds
            ? ` · ${formatDuration(asset.duration_seconds)}`
            : ''}
        </p>
        <div className="mt-2 flex items-center gap-1">
          {asset.processing_status !== 'ready' && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              {asset.processing_status}
            </span>
          )}
          {!pickable && (
            <div className="ml-auto flex items-center gap-0.5">
              {asset.can_edit && !editing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(true);
                  }}
                  className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
                  aria-label="Renommer"
                >
                  <PenSquare className="w-3.5 h-3.5" />
                </button>
              )}
              {asset.can_delete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  className="p-1 rounded hover:bg-rose-50 text-rose-500"
                  aria-label="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ─────────────────────────────────────────────────────────────
// Miniature d'une carte média (UX-07)
// ─────────────────────────────────────────────────────────────

function MediaCardThumbnail({ asset }: { asset: MediaAsset }) {
  // L'API fournit `is_image`, mais on conserve une détection locale pour
  // rester compatible avec un backend plus ancien déjà en production.
  const titleLower = (asset.title || '').toLowerCase();
  const ctypeLower = (asset.content_type || '').toLowerCase();
  const imageExtRe = /\.(png|jpe?g|jfif|gif|webp|svg|bmp|avif|heic|heif)(\?|$|#)/i;
  const looksLikeImage =
    asset.is_image === true
    || ctypeLower.startsWith('image/')
    || imageExtRe.test(titleLower)
    // Fallback très permissif : si c'est un "doc" avec une URL de
    // preview, il y a de bonnes chances que ce soit une image (les
    // vidéos/audios sont gérés via kind === 'video'/'audio').
    || (asset.kind === 'doc'
      && !!(asset.thumbnail_url || asset.preview_url)
      && !titleLower.endsWith('.pdf')
      && !titleLower.endsWith('.docx')
      && !titleLower.endsWith('.xlsx')
      && !titleLower.endsWith('.pptx')
      && !titleLower.endsWith('.zip')
      && !titleLower.endsWith('.txt'));

  // Une miniature générée est toujours prioritaire, quel que soit le type
  // du média. Pour une image sans miniature dédiée, l'original sert
  // directement d'aperçu. Si la miniature dédiée est périmée, on tente
  // ensuite l'URL de l'original avant d'afficher le fallback.
  const imageCandidates = [
    asset.thumbnail_url,
    looksLikeImage ? asset.preview_url : undefined,
  ].filter(
    (url, index, urls): url is string =>
      Boolean(url) && urls.indexOf(url) === index,
  );
  const [imageAttempt, setImageAttempt] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const imageSrc = imageCandidates[imageAttempt] || '';

  useEffect(() => {
    setImageAttempt(0);
    setVideoFailed(false);
  }, [asset.thumbnail_url, asset.preview_url]);

  const Icon = KIND_ICON[asset.kind];
  const duration =
    (asset.kind === 'video' || asset.kind === 'audio')
    && asset.duration_seconds != null
    && asset.duration_seconds > 0
      ? `${Math.floor(asset.duration_seconds / 60)}:${String(
          asset.duration_seconds % 60,
        ).padStart(2, '0')}`
      : null;

  // Cas 1 — Miniature ou image affichable. Sur erreur réseau/format, on
  // bascule automatiquement vers la vidéo puis vers l'icône de secours.
  if (imageSrc) {
    return (
      <div className="aspect-video relative overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        <img
          src={imageSrc}
          alt={asset.title || 'Aperçu'}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImageAttempt((attempt) => attempt + 1)}
        />
        {asset.kind === 'video' && (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-lift">
              <Film className="w-5 h-5 text-white" />
            </span>
          </span>
        )}
        {duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
            {duration}
          </span>
        )}
      </div>
    );
  }

  // Cas 2 — Vidéo READY avec preview_url : on tente de rendre la
  // première frame via <video preload="metadata">. Le navigateur charge
  // seulement les metadata (~100 kB), pas la vidéo entière, et affiche
  // la frame de départ. Si le codec/CORS pose problème → onError bascule
  // sur le gradient.
  const canShowVideoFrame =
    asset.kind === 'video'
    && asset.preview_url
    && asset.processing_status === 'ready'
    && !videoFailed;

  if (canShowVideoFrame) {
    return (
      <div className="aspect-video relative overflow-hidden bg-black">
        <video
          src={asset.preview_url}
          preload="metadata"
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setVideoFailed(true)}
          onLoadedMetadata={(e) => {
            // Force le rendu d'une frame proche du début (Safari refuse
            // t=0 sur certains encodages ; 0.1s marche partout).
            try {
              (e.currentTarget as HTMLVideoElement).currentTime = 0.1;
            } catch {
              /* ignore */
            }
          }}
        />
        {/* Overlay Play centré + badge durée */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center shadow-lift">
            <Film className="w-5 h-5 text-white" />
          </span>
        </span>
        {duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
            {duration}
          </span>
        )}
      </div>
    );
  }

  // Cas 3 — Audio, Doc non-image, ou fallback si video/image ont échoué.
  return (
    <div
      className={cn(
        'aspect-video flex items-center justify-center relative overflow-hidden',
        KIND_GRADIENT[asset.kind],
      )}
    >
      <Icon className="w-12 h-12 opacity-90 drop-shadow" strokeWidth={1.5} />
      {duration && (
        <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
          {duration}
        </span>
      )}
      {asset.kind === 'video' && (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition"
        >
          <span className="w-11 h-11 rounded-full bg-white/25 backdrop-blur-md flex items-center justify-center">
            <Film className="w-5 h-5 text-white" />
          </span>
        </span>
      )}
    </div>
  );
}
