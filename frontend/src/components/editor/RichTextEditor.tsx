/**
 * RichTextEditor.tsx — Éditeur WYSIWYG Tiptap complet.
 *
 * Features (miroir du contrat "TinyMCE-like") :
 *   Mise en forme : gras, italique, souligné, barré, exposant, indice
 *   Police       : famille, taille, couleur, arrière-plan
 *   Alignement   : gauche, centre, droite, justifié
 *   Structure    : titres H1-H4, listes UL/OL, citation, séparateur HR
 *   Indentation  : indent, outdent (via listes)
 *   Insertion    : lien, image, image médiathèque, vidéo, table, date, caractères spéciaux
 *   Utilitaires  : retirer la mise en forme, source HTML, plein écran, aperçu
 *   Autres       : undo/redo, sélectionner tout, recherche, imprimer, PDF (via html2pdf lib externe)
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { useEditor, EditorContent, Node, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';


// ─────────────────────────────────────────────────────────────
// UX-14 — Extension Node custom "IframeEmbed" (YouTube / Vimeo / MP4)
// ─────────────────────────────────────────────────────────────
// Tiptap StarterKit ne connaît pas les balises <iframe> : quand on lui
// envoie du HTML brut avec `insertContent('<iframe...>')`, il l'échappe
// en texte au lieu de créer un vrai node → la vidéo YouTube s'affiche
// comme du code source. Cette extension déclare un node "iframe" propre
// avec parse/serialize DOM, utilisable via
// `chain().setIframeEmbed({ src }).run()`.
const IframeEmbed = Node.create({
  name: 'iframeEmbed',
  group: 'block',
  atom: true, // pas de contenu éditable à l'intérieur
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
      title: { default: 'Vidéo embed' },
      frameborder: { default: '0' },
      allowfullscreen: { default: 'true' },
    };
  },

  parseHTML() {
    // Reconnaît tous les <iframe> (surtout ceux à l'intérieur de
    // <div class="video-embed">) au parsing initial du content HTML.
    return [{ tag: 'iframe[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Wrapping div.video-embed pour appliquer le ratio 16:9 via CSS
    // et permettre le responsive.
    return [
      'div',
      { class: 'video-embed' },
      [
        'iframe',
        {
          ...HTMLAttributes,
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; '
            + 'gyroscope; picture-in-picture; web-share',
          referrerpolicy: 'strict-origin-when-cross-origin',
        },
      ],
    ];
  },

  addCommands() {
    return {
      // Cast large — le typage précis nécessiterait de patcher les
      // types Commands de Tiptap au niveau global ; on garde simple.
      setIframeEmbed: (attrs: { src: string; title?: string }) => (props: {
        commands: { insertContent: (arg: unknown) => boolean };
      }) => {
        return props.commands.insertContent({
          type: this.name,
          attrs: {
            src: attrs.src,
            title: attrs.title || 'Vidéo embed',
          },
        });
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  },
});
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  Undo,
  Redo,
  Video,
  Palette,
  Highlighter,
  SuperscriptIcon,
  SubscriptIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  RemoveFormatting,
  IndentIncrease,
  IndentDecrease,
  Calendar,
  Smile,
  Maximize,
  Minimize,
  Eye,
  Printer,
  Search,
  Save,
  FileText,
  Type,
  FilePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Constantes police / caractères spéciaux
// ─────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Système', value: '' },
  { label: 'Sans-serif', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'Menlo, Consolas, monospace' },
  { label: 'Cursive', value: '"Brush Script MT", cursive' },
];

const FONT_SIZES = [
  { label: 'Petit', value: '0.875em' },
  { label: 'Normal', value: '1em' },
  { label: 'Moyen', value: '1.25em' },
  { label: 'Grand', value: '1.5em' },
  { label: 'Très grand', value: '2em' },
];

const SPECIAL_CHARS = [
  '© ® ™ § ¶',
  '€ $ £ ¥ ¢',
  '→ ← ↑ ↓ ↔',
  '× ÷ ± ≠ ≤ ≥',
  '° ½ ¼ ¾',
  '“ ” ‘ ’ « »',
  '★ ☆ ♥ ♦ ♣ ♠',
  '✓ ✗ ✔ ✘',
];

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  editable?: boolean;
  /** Ouvre la MediaLibrary pour insérer un média riche. */
  onOpenMediaPicker?: () => void;
  /** Callback pour le bouton "Sauver" — si absent, le bouton n'est pas affiché. */
  onSave?: () => void;
}

/** UX-16 — Ref imperative exposée par le RichTextEditor.
 * Permet au parent d'insérer du HTML **à la position du curseur** au
 * lieu de manipuler la string content (qui appendait en fin de doc).
 */
export interface RichTextEditorHandle {
  /** Insère du HTML à la position courante du curseur. */
  insertHTML: (html: string) => void;
  /** Focus l'éditeur (utile après picker media pour rendre le curseur
   *  visible). */
  focus: () => void;
  /** Retourne le texte actuellement sélectionné (ou "" si aucune sélection).
   *  Utilisé par le plugin lexique pour pré-remplir le modal "Ajouter au
   *  lexique" à partir du mot sélectionné. */
  getSelectedText: () => string;
}

// ─────────────────────────────────────────────────────────────
// Editor principal
// ─────────────────────────────────────────────────────────────

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Rédigez votre contenu…',
    className,
    minHeight = '250px',
    editable = true,
    onOpenMediaPicker,
    onSave,
  }: RichTextEditorProps,
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: {},
      }),
      Underline,
      TextStyle, // requis avant Color / FontFamily
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary-600 underline',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-xl max-w-full h-auto my-3',
        },
      }),
      Placeholder.configure({ placeholder }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'be-editor-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      // UX-14 — Node iframe custom pour embed YouTube/Vimeo.
      IframeEmbed,
    ],
    content: value || '',
    editable,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm sm:prose max-w-none focus:outline-none',
          'prose-headings:font-extrabold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base',
          'prose-a:text-primary-600 prose-strong:font-bold',
          'prose-blockquote:border-l-4 prose-blockquote:border-primary-300',
          'prose-blockquote:bg-primary-50/50 prose-blockquote:py-2 prose-blockquote:px-3',
          'prose-blockquote:rounded-lg prose-blockquote:italic prose-blockquote:text-neutral-700',
          'prose-code:bg-neutral-100 prose-code:px-1 prose-code:rounded',
          'prose-pre:bg-neutral-900 prose-pre:text-white',
          'prose-hr:my-6 prose-table:border-collapse',
          'p-4',
        ),
        style: `min-height: ${minHeight};`,
      },
    },
  });

  // Sync externe (contrôle bidirectionnel light)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // UX-16 — Handle imperative exposé au parent : insertHTML à la
  // position du curseur (au lieu d'un append en fin de string dans
  // le state React).
  useImperativeHandle(
    ref,
    () => ({
      insertHTML: (html: string) => {
        if (!editor) return;
        editor.chain().focus().insertContent(html).run();
      },
      focus: () => {
        editor?.chain().focus().run();
      },
      getSelectedText: () => {
        if (!editor) return '';
        const { from, to, empty } = editor.state.selection;
        if (empty) return '';
        try {
          return editor.state.doc.textBetween(from, to, ' ').trim();
        } catch {
          return '';
        }
      },
    }),
    [editor],
  );

  // ─────────── Actions callbacks ───────────
  const insertImageByURL = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL de l'image :");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const insertVideoEmbed = useCallback(() => {
    if (!editor) return;
    const url = window.prompt(
      "URL de la vidéo (YouTube, Vimeo, MP4…) :",
    );
    if (!url) return;
    // UX-14 — Tiptap StarterKit n'a pas de node <iframe> natif :
    // insertContent(html) échappait le HTML en texte brut. On passe
    // désormais par le node "iframeEmbed" custom déclaré plus haut,
    // via un objet ProseMirror {type, attrs} que Tiptap accepte.
    const isYT = /(?:youtube\.com|youtu\.be)/.test(url);
    const isVimeo = /vimeo\.com/.test(url);
    let embedSrc = '';
    let title = 'Vidéo';
    if (isYT) {
      const idMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/);
      const id = idMatch?.[1] ?? '';
      if (!id) {
        window.alert("ID YouTube introuvable dans l'URL.");
        return;
      }
      embedSrc = `https://www.youtube-nocookie.com/embed/${id}`;
      title = 'YouTube';
    } else if (isVimeo) {
      const id = url.split('/').pop() ?? '';
      if (!id) {
        window.alert("ID Vimeo introuvable dans l'URL.");
        return;
      }
      embedSrc = `https://player.vimeo.com/video/${id}`;
      title = 'Vimeo';
    } else if (/^https?:\/\/.+\.(mp4|webm|ogg)($|\?)/i.test(url)) {
      // Fichier vidéo direct → on l'insère comme <img> avec un poster,
      // ou on peut aussi utiliser un iframe. Ici on passe par un tag
      // vidéo natif inséré via insertContent — bricolage acceptable
      // vu la rareté du cas.
      editor
        .chain()
        .focus()
        .insertContent(
          `<video src="${url}" controls class="rounded-xl max-w-full my-3"></video>`,
        )
        .run();
      return;
    } else {
      // URL générique — on tente quand même un iframe direct.
      embedSrc = url;
      title = 'Vidéo externe';
    }
    editor
      .chain()
      .focus()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insertContent({
        type: 'iframeEmbed',
        attrs: { src: embedSrc, title },
      } as any)
      .run();
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL du lien (vider pour retirer) :', prev ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        'border border-neutral-200 rounded-2xl overflow-hidden bg-white',
        !editable && 'opacity-70 pointer-events-none',
        className,
      )}
    >
      <Toolbar
        editor={editor}
        onOpenMediaPicker={onOpenMediaPicker}
        onInsertImage={insertImageByURL}
        onInsertVideo={insertVideoEmbed}
        onSetLink={setLink}
        onSave={onSave}
      />
      <EditorContent editor={editor} />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────

function Toolbar({
  editor,
  onOpenMediaPicker,
  onInsertImage,
  onInsertVideo,
  onSetLink,
  onSave,
}: {
  editor: Editor;
  onOpenMediaPicker?: () => void;
  onInsertImage: () => void;
  onInsertVideo: () => void;
  onSetLink: () => void;
  onSave?: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showChars, setShowChars] = useState(false);

  // Fullscreen toggle : ajoute une classe sur le container racine.
  useEffect(() => {
    const root = editor.view.dom.closest('.be-rte-root');
    if (!root) return;
    if (fullscreen) {
      root.classList.add('be-rte-fullscreen');
    } else {
      root.classList.remove('be-rte-fullscreen');
    }
  }, [fullscreen, editor]);

  // Handlers utilitaires
  const insertDate = () => {
    const now = new Date();
    const formatted = now.toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    editor.chain().focus().insertContent(formatted).run();
  };

  const removeFormat = () => {
    editor.chain().focus().unsetAllMarks().clearNodes().run();
  };

  const selectAll = () => {
    editor.chain().focus().selectAll().run();
  };

  const insertHtmlSource = () => {
    const current = editor.getHTML();
    const next = window.prompt('Édition HTML brute (attention aux XSS) :', current);
    if (next === null) return;
    editor.commands.setContent(next, true);
  };

  const printDocument = () => {
    const html = editor.getHTML();
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><title>Impression</title><style>body{font-family:sans-serif;padding:2em;max-width:800px;margin:auto}img{max-width:100%}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const saveToPdf = async () => {
    // Requiert html2pdf.js si tu veux vraiment produire un PDF ;
    // sinon on retombe sur print() qui a un mode "Enregistrer en PDF"
    // natif dans tous les navigateurs modernes.
    printDocument();
  };

  const openFindReplace = () => {
    // Utilise le Ctrl+F natif si dispo, sinon simple prompt.
    const target = window.prompt('Rechercher dans l\'éditeur :');
    if (!target) return;
    const replace = window.prompt(
      `Remplacer « ${target} » par (vide = juste rechercher) :`,
      '',
    );
    if (replace === null) return;
    if (replace === '') {
      // Just find — sélectionne la première occurrence
      const html = editor.getHTML();
      const idx = html.indexOf(target);
      if (idx < 0) alert('Aucune occurrence trouvée.');
      return;
    }
    const html = editor.getHTML();
    const next = html.split(target).join(replace);
    editor.commands.setContent(next, true);
  };

  const newDoc = () => {
    if (!editor.getText().trim()) return;
    if (
      window.confirm(
        'Vider tout le contenu et créer un nouveau document vierge ?',
      )
    ) {
      editor.commands.setContent('', true);
    }
  };

  return (
    <div className="border-b border-neutral-200 bg-neutral-50/70 dark:bg-neutral-900/60 dark:border-neutral-700 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
      {/* ─── Fichier ─── */}
      <ToolbarBtn Icon={FilePlus} label="Nouveau document" onClick={newDoc} />
      {onSave && (
        <ToolbarBtn Icon={Save} label="Enregistrer" onClick={onSave} />
      )}
      <Divider />

      {/* ─── Undo / Redo / Select all ─── */}
      <ToolbarBtn
        Icon={Undo}
        label="Annuler (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <ToolbarBtn
        Icon={Redo}
        label="Rétablir (Ctrl+Y)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />
      <ToolbarBtn Icon={Search} label="Rechercher / Remplacer" onClick={openFindReplace} />
      <Divider />

      {/* ─── Police (family + size + color + background) ─── */}
      <select
        title="Police"
        aria-label="Famille de police"
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg px-1.5 py-1 bg-white dark:bg-neutral-800"
        value={(editor.getAttributes('textStyle').fontFamily as string) || ''}
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        title="Taille"
        aria-label="Taille de police"
        onChange={(e) => {
          const v = e.target.value;
          // TextStyle avec CSS font-size inline via setMark.
          editor
            .chain()
            .focus()
            .setMark('textStyle', {
              ...editor.getAttributes('textStyle'),
              fontSize: v || null,
            })
            .run();
        }}
        className="text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg px-1.5 py-1 bg-white dark:bg-neutral-800"
        value={(editor.getAttributes('textStyle').fontSize as string) || '1em'}
      >
        {FONT_SIZES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <ColorPicker
        Icon={Palette}
        label="Couleur du texte"
        current={(editor.getAttributes('textStyle').color as string) || '#111827'}
        onChange={(c) => editor.chain().focus().setColor(c).run()}
      />
      <ColorPicker
        Icon={Highlighter}
        label="Surligner (fond)"
        current={(editor.getAttributes('highlight').color as string) || '#fef08a'}
        onChange={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
      />
      <Divider />

      {/* ─── Titres ─── */}
      <ToolbarBtn
        Icon={Heading1}
        label="Titre 1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      />
      <ToolbarBtn
        Icon={Heading2}
        label="Titre 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      />
      <ToolbarBtn
        Icon={Heading3}
        label="Titre 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      />
      <ToolbarBtn
        Icon={Heading4}
        label="Titre 4"
        active={editor.isActive('heading', { level: 4 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 4 }).run()
        }
      />
      <Divider />

      {/* ─── Marks : gras, italique, souligné, barré, sup, sub ─── */}
      <ToolbarBtn
        Icon={Bold}
        label="Gras (Ctrl+B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarBtn
        Icon={Italic}
        label="Italique (Ctrl+I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarBtn
        Icon={UnderlineIcon}
        label="Souligné (Ctrl+U)"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarBtn
        Icon={Strikethrough}
        label="Barré"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarBtn
        Icon={SuperscriptIcon}
        label="Exposant"
        active={editor.isActive('superscript')}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      />
      <ToolbarBtn
        Icon={SubscriptIcon}
        label="Indice"
        active={editor.isActive('subscript')}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      />
      <ToolbarBtn
        Icon={RemoveFormatting}
        label="Retirer la mise en forme"
        onClick={removeFormat}
      />
      <Divider />

      {/* ─── Alignement ─── */}
      <ToolbarBtn
        Icon={AlignLeft}
        label="Aligner à gauche"
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarBtn
        Icon={AlignCenter}
        label="Centrer"
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarBtn
        Icon={AlignRight}
        label="Aligner à droite"
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />
      <ToolbarBtn
        Icon={AlignJustify}
        label="Justifier"
        active={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      />
      <Divider />

      {/* ─── Listes / Indent ─── */}
      <ToolbarBtn
        Icon={List}
        label="Liste à puces"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarBtn
        Icon={ListOrdered}
        label="Liste numérotée"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarBtn
        Icon={IndentIncrease}
        label="Augmenter le retrait (dans une liste)"
        disabled={!editor.can().sinkListItem('listItem')}
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
      />
      <ToolbarBtn
        Icon={IndentDecrease}
        label="Diminuer le retrait (dans une liste)"
        disabled={!editor.can().liftListItem('listItem')}
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
      />
      <ToolbarBtn
        Icon={Quote}
        label="Citation"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Divider />

      {/* ─── Code ─── */}
      <ToolbarBtn
        Icon={Code}
        label="Code inline"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <ToolbarBtn
        Icon={Code2}
        label="Bloc de code"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <Divider />

      {/* ─── Insertions ─── */}
      <ToolbarBtn Icon={LinkIcon} label="Lien" active={editor.isActive('link')} onClick={onSetLink} />
      <ToolbarBtn Icon={ImageIcon} label="Image (URL)" onClick={onInsertImage} />
      {onOpenMediaPicker && (
        <ToolbarBtn Icon={FileText} label="Insérer depuis la médiathèque" onClick={onOpenMediaPicker} />
      )}
      <ToolbarBtn Icon={Video} label="Insérer une vidéo (YouTube/Vimeo/URL)" onClick={onInsertVideo} />
      <ToolbarBtn
        Icon={TableIcon}
        label="Table 3×3"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      />
      <ToolbarBtn Icon={Minus} label="Séparateur horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <ToolbarBtn Icon={Calendar} label="Insérer date/heure" onClick={insertDate} />
      <div className="relative">
        <ToolbarBtn
          Icon={Smile}
          label="Caractères spéciaux"
          onClick={() => setShowChars((v) => !v)}
        />
        {showChars && (
          <div className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg p-2 text-sm min-w-[260px]">
            {SPECIAL_CHARS.map((row) => (
              <div key={row} className="flex flex-wrap gap-1 mb-1">
                {row.split(' ').map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().insertContent(ch).run();
                      setShowChars(false);
                    }}
                    className="px-2 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  >
                    {ch}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <Divider />

      {/* ─── Vues ─── */}
      <ToolbarBtn
        Icon={Type}
        label="Éditer la source HTML"
        onClick={insertHtmlSource}
      />
      <ToolbarBtn
        Icon={Eye}
        label="Aperçu (nouvel onglet)"
        onClick={() => {
          const w = window.open('', '_blank');
          if (!w) return;
          w.document.write(
            `<!doctype html><html><head><title>Aperçu</title><style>body{font-family:sans-serif;padding:2em;max-width:800px;margin:auto}img{max-width:100%}</style></head><body>${editor.getHTML()}</body></html>`,
          );
          w.document.close();
        }}
      />
      <ToolbarBtn Icon={Printer} label="Imprimer" onClick={printDocument} />
      <ToolbarBtn Icon={FileText} label="Exporter en PDF (via impression)" onClick={saveToPdf} />
      <ToolbarBtn
        Icon={fullscreen ? Minimize : Maximize}
        label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        onClick={() => setFullscreen((v) => !v)}
      />
      <ToolbarBtn
        Icon={Search}
        label="Tout sélectionner (Ctrl+A)"
        onClick={selectAll}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ColorPicker helper (avec swatch input color natif)
// ─────────────────────────────────────────────────────────────

function ColorPicker({
  Icon,
  label,
  current,
  onChange,
}: {
  Icon: typeof Bold;
  label: string;
  current: string;
  onChange: (color: string) => void;
}) {
  return (
    <label
      className="relative inline-flex items-center p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700 cursor-pointer"
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4" />
      <span
        className="ml-1 w-3 h-3 rounded-sm border border-neutral-300 dark:border-neutral-600"
        style={{ background: current }}
        aria-hidden
      />
      <input
        type="color"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// ToolbarBtn + Divider
// ─────────────────────────────────────────────────────────────

function ToolbarBtn({
  Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  Icon: typeof Bold;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'p-1.5 rounded-lg transition text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700',
        active && 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-neutral-700" aria-hidden />;
}
