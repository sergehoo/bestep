/**
 * InstructorLessonEditorPage.tsx — Éditeur de leçon riche (R16.5).
 *
 * Route : /instructor/courses/:cid/lessons/:lid/edit
 *
 * Features :
 *  - Titre inline éditable
 *  - Toggle preview
 *  - Éditeur Tiptap avec media picker
 *  - Autosave 3s après dernière frappe (sauf si aucune modif)
 *  - Bouton "Preview apprenant" → ouvre la fiche cours en nouvel onglet
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Eye,
  Lock,
  Clock,
  Loader2,
  CheckCircle2,
  Film,
  ExternalLink,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { MediaPickerDialog } from '@/components/media/MediaPickerDialog';
import {
  useInstructorLessons,
  useUpdateLesson,
  useInstructorSections,
  useInstructorCourseDetail,
} from '@/hooks/instructor';
import { extractApiError, formatDuration } from '@/lib/utils';
import { LESSON_TYPE_META, type LessonType, type MediaAsset } from '@/lib/types';

const LESSON_TYPES: LessonType[] = ['VIDEO', 'TEXT', 'FILE', 'QUIZ', 'LIVE'];

const AUTOSAVE_DELAY_MS = 3000;

export default function InstructorLessonEditorPage() {
  const { cid, lid } = useParams<{ cid: string; lid: string }>();
  const courseId = cid ? Number(cid) : undefined;
  const lessonId = lid ? Number(lid) : undefined;

  const { data: course } = useInstructorCourseDetail(courseId);
  const { data: sections } = useInstructorSections(courseId);
  const update = useUpdateLesson(courseId ?? 0);

  // Trouve la leçon dans le arbre sections → lessons
  const { section, lesson } = useMemo(() => {
    if (!sections || !lessonId) return { section: null, lesson: null };
    for (const s of sections) {
      const l = (s.lessons ?? []).find((x) => x.id === lessonId);
      if (l) return { section: s, lesson: l };
    }
    return { section: null, lesson: null };
  }, [sections, lessonId]);

  // Charge aussi via /lessons/ pour s'assurer d'avoir le content complet
  const { data: sectionLessons } = useInstructorLessons(
    courseId ?? 0,
    section?.id,
  );
  const fullLesson = useMemo(
    () => (sectionLessons ?? []).find((l) => l.id === lessonId) || lesson,
    [sectionLessons, lessonId, lesson],
  );

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  // UX-04 — UUID du MediaAsset lié (pour envoyer media_asset_id au save).
  // Séparé de videoUrl pour distinguer "lien externe" (YouTube, Vimeo)
  // d'un "média de la médiathèque".
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [isPreview, setIsPreview] = useState(false);
  const [lessonType, setLessonType] = useState<LessonType>('VIDEO');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydratation initiale
  useEffect(() => {
    if (fullLesson) {
      setTitle(fullLesson.title);
      setContent(fullLesson.content || '');
      // UX-04 — Si un media_asset est présent, on preferre son preview_url
      // (URL presignée fraîche à chaque hydration) plutôt qu'un video_url
      // stocké en base qui pourrait être expiré.
      const attached = fullLesson.media_asset ?? null;
      if (attached) {
        setMediaAssetId(attached.id);
        setVideoUrl(attached.preview_url || fullLesson.video_url || '');
      } else {
        setMediaAssetId(null);
        setVideoUrl(fullLesson.video_url || '');
      }
      setDurationSec(fullLesson.duration_sec || 0);
      setIsPreview(fullLesson.is_preview);
      // Normalise le lesson_type entrant (backend peut renvoyer string
      // hors enum si migration ancienne). On tombe sur 'VIDEO' par défaut.
      const incoming = String(fullLesson.lesson_type || '').toUpperCase();
      setLessonType(
        LESSON_TYPES.includes(incoming as LessonType)
          ? (incoming as LessonType)
          : 'VIDEO',
      );
      setDirty(false);
    }
  }, [fullLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave
  useEffect(() => {
    if (!dirty || !section?.id || !lessonId || !courseId) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      save().catch(() => {
        /* handled */
      });
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, videoUrl, mediaAssetId, durationSec, isPreview, lessonType, dirty]);

  async function save() {
    if (!section?.id || !lessonId || !courseId) return;
    setFlash(null);
    try {
      await update.mutateAsync({
        sectionId: section.id,
        lessonId,
        payload: {
          title,
          content,
          video_url: videoUrl,
          // UX-04 — On envoie l'UUID media_asset_id (persistant) plutôt
          // que l'URL S3 qui expire en 1h. Envoyer null = détacher.
          media_asset_id: mediaAssetId,
          duration_sec: durationSec,
          is_preview: isPreview,
          lesson_type: lessonType,
        },
      });
      setDirty(false);
      setLastSavedAt(new Date());
      setFlash({ kind: 'ok', msg: 'Enregistré' });
      // Auto-clear le flash après 2 s
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  function handlePick(asset: MediaAsset) {
    setDirty(true);
    if (asset.kind === 'video') {
      // UX-04 — On stocke l'URL presignée réelle dans videoUrl (pour le
      // preview player HTML5) ET l'UUID dans mediaAssetId (référence
      // persistante envoyée au backend — celui-ci re-signera à chaque
      // read pour éviter l'expiration du token S3).
      setMediaAssetId(asset.id);
      setVideoUrl(asset.preview_url || '');
      if (asset.duration_seconds) setDurationSec(asset.duration_seconds);
      setFlash({
        kind: 'ok',
        msg: `Vidéo « ${asset.title} » associée à la leçon.`,
      });
    } else if (asset.kind === 'audio') {
      setMediaAssetId(asset.id);
      setVideoUrl(asset.preview_url || '');
      if (asset.duration_seconds) setDurationSec(asset.duration_seconds);
    } else {
      // Doc : distinguer image (embed <img>) vs autres docs (lien attachment).
      // UX-02 — Fix : les images étaient inserées comme un lien "📎 fichier.png"
      // au lieu d'être affichées. On regarde content_type + preview_url pour
      // produire un vrai <img> quand possible.
      const ct = (asset.content_type || '').toLowerCase();
      const url = asset.preview_url || asset.thumbnail_url || '';
      const isImage = ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.title);
      if (isImage && url) {
        const alt = (asset.title || 'image').replace(/"/g, '&quot;');
        setContent(
          (prev) =>
            prev +
            `\n\n<p><img src="${url}" alt="${alt}" style="max-width:100%;height:auto;" /></p>`,
        );
        setFlash({
          kind: 'ok',
          msg: `Image « ${asset.title} » insérée.`,
        });
      } else {
        // Autres docs (PDF, DOCX…) → lien téléchargeable.
        const href = asset.preview_url || `media://${asset.id}`;
        setContent(
          (prev) =>
            prev +
            `\n\n<p><a href="${href}" target="_blank" rel="noopener">📎 ${asset.title}</a></p>`,
        );
      }
    }
  }

  return (
    <InstructorShell
      title={fullLesson?.title || 'Éditeur de leçon'}
      subtitle={
        section
          ? `${course?.title ?? 'Cours'} · Section ${section.order} — ${section.title}`
          : undefined
      }
      actions={
        <div className="flex items-center gap-2">
          <AutosaveIndicator
            dirty={dirty}
            saving={update.isPending}
            lastSavedAt={lastSavedAt}
            flash={flash}
          />
          <Link
            to={`/instructor/courses/${courseId}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Programme
          </Link>
          {course && (
            <a
              href={`/courses/${course.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Aperçu apprenant
            </a>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            loading={update.isPending}
            disabled={!dirty}
          >
            <Save className="w-4 h-4" />
            Enregistrer
          </Button>
        </div>
      }
    >
      {!fullLesson ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Éditeur central */}
          <div className="space-y-4 min-w-0">
            <Card>
              <CardBody className="space-y-3">
                <Input
                  label="Titre de la leçon"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                  required
                />
                {videoUrl && (
                  <div className="rounded-xl bg-primary-50 border border-primary-100 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-primary-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <Film className="w-4 h-4 text-primary-600 shrink-0" />
                        <p className="text-xs font-semibold text-primary-800 truncate">
                          {mediaAssetId
                            ? 'Vidéo attachée depuis la médiathèque'
                            : 'Vidéo externe'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setVideoUrl('');
                          setMediaAssetId(null);
                          setDurationSec(0);
                          setDirty(true);
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 shrink-0"
                      >
                        Retirer
                      </button>
                    </div>
                    {/* UX-04 — Preview player : lecture HTML5 native si
                        l'URL est http(s) ; sinon fallback texte (media://
                        pseudo-URLs legacy). */}
                    {/^https?:\/\//i.test(videoUrl) ? (
                      <video
                        src={videoUrl}
                        controls
                        preload="metadata"
                        className="w-full max-h-[360px] bg-black"
                      />
                    ) : (
                      <p className="text-xs text-primary-800 font-mono px-3 py-2 break-all">
                        {videoUrl}
                      </p>
                    )}
                  </div>
                )}
                <RichTextEditor
                  value={content}
                  onChange={(html) => {
                    setContent(html);
                    setDirty(true);
                  }}
                  placeholder="Rédigez le contenu de votre leçon… (titres, listes, tableaux, images, code…)"
                  onOpenMediaPicker={() => setPickerOpen(true)}
                  minHeight="400px"
                />
              </CardBody>
            </Card>
          </div>

          {/* Sidebar métadonnées */}
          <aside className="space-y-3 lg:sticky lg:top-24 self-start">
            <Card>
              <CardBody className="space-y-3">
                <div>
                  <label
                    htmlFor="lesson-type-select"
                    className="text-xs font-bold text-neutral-700 dark:text-neutral-200 uppercase tracking-wide mb-1.5 block"
                  >
                    Type de leçon
                  </label>
                  <select
                    id="lesson-type-select"
                    value={lessonType}
                    onChange={(e) => {
                      setLessonType(e.target.value as LessonType);
                      setDirty(true);
                    }}
                    className="w-full border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {LESSON_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LESSON_TYPE_META[t].label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                    {LESSON_TYPE_META[lessonType].description}
                  </p>
                </div>
                <Input
                  type="number"
                  label="Durée (secondes)"
                  value={durationSec}
                  onChange={(e) => {
                    setDurationSec(Number(e.target.value) || 0);
                    setDirty(true);
                  }}
                  min={0}
                  helper={
                    durationSec > 0
                      ? `Soit ${formatDuration(durationSec)}`
                      : 'Aucune durée'
                  }
                />
                <label className="flex items-start gap-2 p-3 rounded-xl border border-neutral-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPreview}
                    onChange={(e) => {
                      setIsPreview(e.target.checked);
                      setDirty(true);
                    }}
                    className="mt-0.5 accent-primary-600"
                  />
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {isPreview ? (
                        <Eye className="w-4 h-4 text-accent-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-neutral-400" />
                      )}
                      {isPreview ? 'Leçon Preview' : 'Leçon privée'}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Une leçon preview est visible en démo sur la fiche cours,
                      sans inscription.
                    </p>
                  </div>
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">
                  Statut
                </p>
                <div className="space-y-1.5 text-xs text-neutral-600">
                  <p className="inline-flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Autosave toutes les {AUTOSAVE_DELAY_MS / 1000}s
                  </p>
                  {lastSavedAt && (
                    <p className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Dernier enregistrement : {lastSavedAt.toLocaleTimeString('fr-FR')}
                    </p>
                  )}
                  {dirty && (
                    <p className="inline-flex items-center gap-1.5 text-amber-600">
                      <Loader2 className="w-3 h-3" />
                      Modifications non sauvegardées
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>

            <p className="text-xs text-neutral-400 text-center">
              💡 Le versioning historisé arrivera avec l'API dédiée en R17.
            </p>
          </aside>
        </div>
      )}

      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        title="Insérer un média"
      />
    </InstructorShell>
  );
}

// ─────────────────────────────────────────────────────────────

function AutosaveIndicator({
  dirty,
  saving,
  lastSavedAt,
  flash,
}: {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: Date | null;
  flash: { kind: 'ok' | 'err'; msg: string } | null;
}) {
  if (flash?.kind === 'err') {
    return (
      <Badge variant="danger" size="sm">
        {flash.msg}
      </Badge>
    );
  }
  if (saving) {
    return (
      <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Enregistrement…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="text-xs text-amber-600 inline-flex items-center gap-1">
        <Clock className="w-3 h-3" />
        En attente
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Enregistré
      </span>
    );
  }
  return null;
}
