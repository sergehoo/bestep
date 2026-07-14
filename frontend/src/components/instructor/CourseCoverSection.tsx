/**
 * CourseCoverSection.tsx — Bloc "Image de couverture" (T6).
 *
 * Deux actions :
 *   - Génération automatique (SVG programmatique côté serveur, dérivé du
 *     titre / niveau / langue).
 *   - Import manuel (PNG / JPEG / WebP / SVG, max 5 Mo).
 *
 * Après chaque action, on re-fetch le cours pour rafraîchir la vignette
 * dans le reste de l'UI (fiche publique, liste instructor, etc.).
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Upload, ImageIcon, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { extractApiError } from '@/lib/utils';

interface Props {
  courseId: number;
  courseTitle: string;
  currentThumbnailUrl?: string | null;
  canEdit: boolean;
}

interface CoverResponse {
  detail: string;
  thumbnail_url: string;
}

export function CourseCoverSection({
  courseId,
  courseTitle,
  currentThumbnailUrl,
  canEdit,
}: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(
    null,
  );
  // Cache-buster : on ajoute ?v=<timestamp> après chaque update pour
  // forcer le navigateur à recharger la miniature (le nom fichier peut
  // rester identique côté serveur car on écrase à la génération).
  const [ver, setVer] = useState<number>(0);

  const previewUrl = useMemo(() => {
    if (!currentThumbnailUrl) return '';
    const sep = currentThumbnailUrl.includes('?') ? '&' : '?';
    return ver > 0 ? `${currentThumbnailUrl}${sep}v=${ver}` : currentThumbnailUrl;
  }, [currentThumbnailUrl, ver]);

  const generateMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<CoverResponse>(
        `/instructor/courses/${courseId}/cover/generate/`,
      );
      return data;
    },
    onSuccess: (data) => {
      setFlash({ kind: 'ok', msg: data.detail || 'Image générée.' });
      setVer(Date.now());
      qc.invalidateQueries({ queryKey: ['instructor-course', courseId] });
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
    onError: (e) => {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post<CoverResponse>(
        `/instructor/courses/${courseId}/cover/upload/`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data;
    },
    onSuccess: (data) => {
      setFlash({ kind: 'ok', msg: data.detail || 'Image importée.' });
      setVer(Date.now());
      qc.invalidateQueries({ queryKey: ['instructor-course', courseId] });
      qc.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
    onError: (e) => {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFlash(null);
    uploadMut.mutate(file);
    // Reset l'input pour permettre de ré-uploader le même fichier.
    e.target.value = '';
  }

  const busy = generateMut.isPending || uploadMut.isPending;

  return (
    <Card>
      <CardHeader
        title="Image de couverture"
        subtitle="Vignette affichée dans le catalogue et le partage social. Générée automatiquement à partir du titre ou personnalisable."
      />
      <CardBody className="space-y-4">
        {/* Preview */}
        <div className="aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-700 border border-neutral-200 dark:border-neutral-700 relative">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Couverture de ${courseTitle}`}
              className="w-full h-full object-cover"
              onError={() => setVer(0)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500">
              <ImageIcon className="w-12 h-12 mb-2" strokeWidth={1.5} />
              <p className="text-sm font-semibold">Aucune image</p>
              <p className="text-xs">Générez-en une automatiquement</p>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Flash */}
        {flash && (
          <p
            className={
              'text-xs px-3 py-2 rounded-lg '
              + (flash.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800')
            }
          >
            {flash.msg}
          </p>
        )}

        {/* Actions */}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setFlash(null);
                generateMut.mutate();
              }}
              disabled={busy}
              loading={generateMut.isPending}
            >
              <Sparkles className="w-4 h-4" />
              Générer automatiquement
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              loading={uploadMut.isPending}
            >
              <Upload className="w-4 h-4" />
              Importer une image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        )}
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Formats supportés : PNG, JPEG, WebP, SVG · Taille max : 5 Mo · Ratio
          recommandé : 16:9 (par ex. 1600×900 px).
        </p>
      </CardBody>
    </Card>
  );
}
