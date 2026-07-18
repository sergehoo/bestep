/**
 * LessonResourcesPanel.tsx — Gestion des ressources externes d'une leçon (T8).
 *
 * Utilisé dans l'éditeur de leçon instructor. Chaque ressource est un
 * fichier téléchargeable pour l'apprenant (PDF, JPG, HTML, ZIP…).
 *
 * Fonctionnalités :
 *  - Liste des ressources existantes (icône par type, taille lisible)
 *  - Upload multipart (drag&drop + file picker)
 *  - Rename inline
 *  - Toggle is_downloadable
 *  - Suppression
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Image as ImageIcon,
  FileArchive,
  Globe,
  Paperclip,
  Upload,
  Trash2,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Check,
  X,
  PenSquare,
  Music,
  Video,
  FileSpreadsheet,
  Presentation,
  Code,
  FileType,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { extractApiError } from '@/lib/utils';
import type { LessonResource, LessonResourceKind } from '@/lib/types';

interface Props {
  courseId: number;
  sectionId: number;
  lessonId: number;
  canEdit: boolean;
}

// T8 v2 — Chaque kind a son icône, son label et sa couleur (palette
// cohérente entre l'éditeur instructor et le player learner).
const KIND_ICON: Record<LessonResourceKind, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
  doc: FileType,
  sheet: FileSpreadsheet,
  slides: Presentation,
  html: Globe,
  text: FileText,
  code: Code,
  zip: FileArchive,
  other: Paperclip,
};

const KIND_LABEL: Record<LessonResourceKind, string> = {
  pdf: 'PDF',
  image: 'Image',
  audio: 'Audio',
  video: 'Vidéo',
  doc: 'Document',
  sheet: 'Tableur',
  slides: 'Présentation',
  html: 'HTML',
  text: 'Texte',
  code: 'Code',
  zip: 'Archive',
  other: 'Fichier',
};

const KIND_COLOR: Record<LessonResourceKind, string> = {
  pdf: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  image: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  audio: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  video: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  doc: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  sheet: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  slides: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  html: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  text: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  code: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  zip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  other: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

// T8 v2 — Extensions + MIME acceptés côté file picker. Ordre : PDF,
// images, audio, vidéo, Word, Excel, PowerPoint, HTML/texte, code,
// archives.
const ACCEPT = [
  // PDF
  '.pdf', 'application/pdf',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif', 'image/*',
  // Audio
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', 'audio/*',
  // Vidéo (petits fichiers)
  '.mp4', '.webm', '.mov', '.m4v', 'video/*',
  // Word
  '.doc', '.docx', '.odt', '.rtf',
  // Excel
  '.xls', '.xlsx', '.xlsm', '.ods', '.csv', '.tsv',
  // PowerPoint
  '.ppt', '.pptx', '.odp',
  // Web / texte
  '.html', '.htm', '.txt', '.md', 'text/html', 'text/plain',
  // Code
  '.json', '.xml', '.yaml', '.yml', '.sql', '.js', '.ts', '.py',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz', 'application/zip',
].join(',');

export function LessonResourcesPanel({
  courseId,
  sectionId,
  lessonId,
  canEdit,
}: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const baseUrl = `/instructor/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}/resources`;
  const queryKey = ['lesson-resources', courseId, sectionId, lessonId];

  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<LessonResource[]>(`${baseUrl}/`);
      return data;
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('title', file.name);
      const { data } = await api.post<LessonResource>(`${baseUrl}/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => {
      setFlash({ kind: 'ok', msg: 'Ressource ajoutée.' });
      qc.invalidateQueries({ queryKey });
    },
    onError: (e) => setFlash({ kind: 'err', msg: extractApiError(e) }),
  });

  const patchMut = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: Partial<LessonResource>;
    }) => {
      const { data } = await api.patch<LessonResource>(`${baseUrl}/${id}/`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e) => setFlash({ kind: 'err', msg: extractApiError(e) }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${baseUrl}/${id}/`);
    },
    onSuccess: () => {
      setFlash({ kind: 'ok', msg: 'Ressource supprimée.' });
      qc.invalidateQueries({ queryKey });
    },
    onError: (e) => setFlash({ kind: 'err', msg: extractApiError(e) }),
  });

  function handleFileList(files: FileList | File[]) {
    setFlash(null);
    Array.from(files).forEach((f) => uploadMut.mutate(f));
  }

  function handleRename(r: LessonResource) {
    const t = editTitle.trim();
    if (t && t !== r.title) {
      patchMut.mutate({ id: r.id, body: { title: t } });
    }
    setEditingId(null);
    setEditTitle('');
  }

  return (
    <Card>
      <CardHeader
        title="Ressources téléchargeables"
        subtitle={
          canEdit
            ? 'Ajoutez des fichiers joints (PDF, JPG, HTML, ZIP) que vos apprenants pourront télécharger.'
            : 'Fichiers joints à cette leçon.'
        }
      />
      <CardBody className="space-y-3">
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

        {canEdit && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) {
                handleFileList(e.dataTransfer.files);
              }
            }}
            className={
              'border-2 border-dashed rounded-xl p-4 flex items-center justify-between gap-3 transition '
              + (dragOver
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-neutral-200 dark:border-neutral-700')
            }
          >
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Glissez-déposez un fichier ici, ou cliquez pour parcourir.
              Formats acceptés : PDF, images, audio (MP3…), Word, Excel,
              PowerPoint, HTML, texte, code, archives (ZIP…) · Max 50 Mo
              par fichier.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              loading={uploadMut.isPending}
              disabled={uploadMut.isPending}
            >
              <Upload className="w-4 h-4" />
              Ajouter
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileList(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-6">
            Aucune ressource pour le moment.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                >
                  <div
                    className={
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 '
                      + KIND_COLOR[r.kind]
                    }
                  >
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === r.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(r);
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditTitle('');
                            }
                          }}
                          autoFocus
                          className="flex-1 min-w-0 text-sm border border-neutral-200 dark:border-neutral-600 rounded px-2 py-1 bg-white dark:bg-neutral-900"
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(r)}
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                          aria-label="Enregistrer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditTitle('');
                          }}
                          className="p-1 rounded text-neutral-500 hover:bg-neutral-100"
                          aria-label="Annuler"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-sm font-semibold text-neutral-900 dark:text-white truncate"
                        title={r.title}
                      >
                        {r.title}
                      </p>
                    )}
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {KIND_LABEL[r.kind]} · {r.size_human}
                      {!r.is_downloadable && ' · Lecture seule'}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={r.is_downloadable ? r.title : undefined}
                      className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
                      title={r.is_downloadable ? 'Télécharger' : 'Ouvrir'}
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(r.id);
                            setEditTitle(r.title);
                          }}
                          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
                          title="Renommer"
                        >
                          <PenSquare className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchMut.mutate({
                              id: r.id,
                              body: { is_downloadable: !r.is_downloadable },
                            })
                          }
                          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
                          title={
                            r.is_downloadable
                              ? 'Rendre non téléchargeable'
                              : 'Autoriser le téléchargement'
                          }
                        >
                          {r.is_downloadable ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Supprimer « ${r.title} » ? Action irréversible.`,
                              )
                            ) {
                              deleteMut.mutate(r.id);
                            }
                          }}
                          className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
