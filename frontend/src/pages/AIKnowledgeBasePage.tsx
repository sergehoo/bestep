/**
 * AIKnowledgeBasePage.tsx — Base de connaissances IA (Phase 5).
 *
 * Réservée aux instructor + admin. Permet :
 *   - Voir les espaces visibles (GLOBAL/ORG/COURSE/INSTRUCTOR/PRIVATE)
 *   - Créer un espace privé/formateur/cours (les admins peuvent tout)
 *   - Créer un document (titre + contenu Markdown) → indexation immédiate
 *   - Voir les documents (statut + chunks + version)
 *   - Ré-indexer / supprimer
 *   - Faire une recherche RAG en direct + une recherche web
 */
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Sparkles,
  Search,
  Plus,
  FileText,
  RefreshCw,
  Trash2,
  Loader2,
  BookOpen,
  Globe,
  ShieldCheck,
  Building2,
  Lock,
} from 'lucide-react';

import {
  useAIWebSearch,
  useCreateKBDocument,
  useCreateKBSpace,
  useDeleteKBDocument,
  useKBDocuments,
  useKBSearch,
  useKBSpaces,
  useReindexKBDocument,
} from '@/hooks/ai';
import type {
  AIKnowledgeDocument,
  AIKnowledgeSpace,
  KBSpaceScope,
} from '@/lib/ai-types';
import { useAuthUser, useIsAuthenticated } from '@/stores/auth';

const SCOPE_META: Record<
  KBSpaceScope,
  { label: string; Icon: typeof Globe; tone: string }
> = {
  GLOBAL: { label: 'Globale', Icon: Globe, tone: 'text-primary-600' },
  ORG: { label: 'Organisation', Icon: Building2, tone: 'text-sky-600' },
  COURSE: { label: 'Cours', Icon: BookOpen, tone: 'text-emerald-600' },
  INSTRUCTOR: { label: 'Formateur', Icon: ShieldCheck, tone: 'text-violet-600' },
  PRIVATE: { label: 'Privé', Icon: Lock, tone: 'text-neutral-600' },
  ADMIN: { label: 'Admin', Icon: ShieldCheck, tone: 'text-rose-600' },
};

export default function AIKnowledgeBasePage() {
  const isAuth = useIsAuthenticated();
  const user = useAuthUser();
  const { data: spaces } = useKBSpaces();
  const { data: docs } = useKBDocuments();
  const search = useKBSearch();
  const webSearch = useAIWebSearch();

  const isEditor = useMemo(() => {
    if (!user) return false;
    return (
      user.is_platform_admin ||
      user.roles?.some?.((r: string) => r === 'instructor')
    );
  }, [user]);

  const [searchQ, setSearchQ] = useState('');
  const [webQ, setWebQ] = useState('');
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewSpace, setShowNewSpace] = useState(false);

  if (!isAuth) return <Navigate to="/login" replace />;
  if (!isEditor) return <Navigate to="/dashboard" replace />;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
          <BookOpen className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            Base de connaissances IA
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Alimentez la RAG de l'assistant. Les documents indexés sont
            utilisés pour répondre aux questions avec citations.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500">
              Espaces ({spaces?.length ?? 0})
            </h2>
            <button
              type="button"
              onClick={() => setShowNewSpace((v) => !v)}
              className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-primary-600"
              title="Créer un espace"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {showNewSpace && <NewSpaceForm onClose={() => setShowNewSpace(false)} />}
          <ul className="space-y-2 mt-3">
            {(spaces ?? []).map((s) => (
              <SpaceRow key={s.id} space={s} />
            ))}
            {(spaces ?? []).length === 0 && (
              <li className="text-xs text-neutral-500 italic">Aucun espace visible.</li>
            )}
          </ul>
        </section>

        <section className="lg:col-span-2 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500">
              Documents ({docs?.count ?? 0})
            </h2>
            <button
              type="button"
              onClick={() => setShowNewDoc((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau document
            </button>
          </div>
          {showNewDoc && (
            <NewDocumentForm
              spaces={spaces ?? []}
              onClose={() => setShowNewDoc(false)}
            />
          )}
          <ul className="mt-3 space-y-2">
            {(docs?.results ?? []).map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
            {(docs?.results ?? []).length === 0 && (
              <li className="text-xs text-neutral-500 italic">
                Aucun document. Créez-en un pour commencer à alimenter la
                base de connaissances.
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500 mb-3">
          Test de recherche RAG
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQ.trim()) search.mutate({ query: searchQ.trim(), limit: 5 });
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Poser une question pour tester la RAG…"
            className="flex-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={search.isPending || !searchQ.trim()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-60 transition"
          >
            {search.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Rechercher
          </button>
        </form>
        {search.data && search.data.results.length > 0 && (
          <ul className="mt-3 space-y-2">
            {search.data.results.map((r) => (
              <li
                key={r.chunk_id}
                className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-800/50"
              >
                <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-1">
                  <span className="font-bold uppercase text-primary-700 dark:text-primary-300">
                    {Math.round(r.score * 100)}%
                  </span>
                  <span>{r.document_title}</span>
                  <span className="text-neutral-400">·</span>
                  <span>{r.space_name}</span>
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-primary-600 hover:underline"
                    >
                      Source →
                    </a>
                  )}
                </div>
                <p className="text-xs text-neutral-800 dark:text-neutral-200 line-clamp-3">
                  {r.text}
                </p>
              </li>
            ))}
          </ul>
        )}
        {search.data && search.data.results.length === 0 && (
          <p className="mt-3 text-xs text-neutral-500 italic">
            Aucun résultat pertinent (score minimum 10%).
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-neutral-500 mb-3">
          Recherche web (allowlist officielle)
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (webQ.trim()) webSearch.mutate({ query: webQ.trim(), limit: 5 });
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={webQ}
            onChange={(e) => setWebQ(e.target.value)}
            placeholder="Rechercher sur les domaines institutionnels…"
            className="flex-1 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={webSearch.isPending || !webQ.trim()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold disabled:opacity-60 transition"
          >
            {webSearch.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            Rechercher
          </button>
        </form>
        {webSearch.data && (
          <ul className="mt-3 space-y-2">
            {webSearch.data.results.map((r, i) => (
              <li
                key={i}
                className="rounded-xl border border-sky-100 dark:border-sky-800 p-3 bg-sky-50/40 dark:bg-sky-900/10"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-1.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 font-bold uppercase">
                    {r.source_kind}
                  </span>
                  <span className="text-neutral-500">{r.domain}</span>
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-sm font-bold text-primary-700 dark:text-primary-300 hover:underline"
                >
                  {r.title}
                </a>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">
                  {r.snippet}
                </p>
              </li>
            ))}
            {webSearch.data.filtered_out && webSearch.data.filtered_out > 0 && (
              <li className="text-[11px] text-neutral-500 italic">
                {webSearch.data.filtered_out} résultat(s) filtré(s) par
                la liste blanche/noire.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Row components
// ─────────────────────────────────────────────────────────────

function SpaceRow({ space }: { space: AIKnowledgeSpace }) {
  const meta = SCOPE_META[space.scope];
  return (
    <li className="rounded-lg border border-neutral-100 dark:border-neutral-800 p-2 flex items-start gap-2">
      <meta.Icon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.tone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
          {space.name}
        </p>
        <p className="text-[10px] text-neutral-500">
          {meta.label} · {space.documents_count} doc(s)
        </p>
      </div>
    </li>
  );
}

function DocumentRow({ doc }: { doc: AIKnowledgeDocument }) {
  const reindex = useReindexKBDocument(doc.id);
  const del = useDeleteKBDocument();

  return (
    <li className="rounded-xl border border-neutral-100 dark:border-neutral-800 p-3">
      <div className="flex items-start gap-3">
        <FileText className="w-4 h-4 shrink-0 mt-1 text-neutral-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">
            {doc.title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
            <StatusBadge status={doc.status} />
            <span>· {doc.chunks_count} chunk(s)</span>
            <span>· v{doc.version}</span>
            <span>· {doc.space_name}</span>
          </div>
          {doc.error_detail && (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 truncate">
              {doc.error_detail}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => reindex.mutate()}
            disabled={reindex.isPending}
            title="Réindexer"
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${reindex.isPending ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Supprimer « ${doc.title} » ?`)) del.mutate(doc.id);
            }}
            title="Supprimer"
            className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    INDEXED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    INDEXING: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  };
  return (
    <span
      className={
        'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ' +
        (map[status] || 'bg-neutral-100 text-neutral-700')
      }
    >
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Forms
// ─────────────────────────────────────────────────────────────

function NewSpaceForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<KBSpaceScope>('PRIVATE');
  const [description, setDescription] = useState('');
  const create = useCreateKBSpace();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      scope,
      description: description.trim(),
    });
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 space-y-2"
    >
      <input
        type="text"
        placeholder="Nom de l'espace"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value as KBSpaceScope)}
        className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      >
        <option value="PRIVATE">Privé (moi seul)</option>
        <option value="INSTRUCTOR">Formateur (mes documents)</option>
        <option value="ORG">Organisation</option>
        <option value="COURSE">Cours</option>
        <option value="GLOBAL">Global (admin uniquement)</option>
        <option value="ADMIN">Admin (admin uniquement)</option>
      </select>
      <input
        type="text"
        placeholder="Description (optionnelle)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded-md text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="px-2 py-1 rounded-md bg-primary-600 text-white text-xs font-bold disabled:opacity-60"
        >
          Créer
        </button>
      </div>
    </form>
  );
}

function NewDocumentForm({
  spaces,
  onClose,
}: {
  spaces: AIKnowledgeSpace[];
  onClose: () => void;
}) {
  const [spaceId, setSpaceId] = useState<number>(spaces[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const create = useCreateKBDocument();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !spaceId) return;
    await create.mutateAsync({
      space_id: spaceId,
      title: title.trim(),
      content,
      doc_type: 'MARKDOWN',
    });
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-xl border border-neutral-100 dark:border-neutral-800 p-3 space-y-2"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(Number(e.target.value))}
          className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.scope})
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Titre du document"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="col-span-2 px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
        />
      </div>
      <textarea
        placeholder="Contenu Markdown / texte du document…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded-md text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={create.isPending || !title.trim() || !content.trim()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 text-white text-xs font-bold disabled:opacity-60"
        >
          {create.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          Créer + indexer
        </button>
      </div>
    </form>
  );
}
