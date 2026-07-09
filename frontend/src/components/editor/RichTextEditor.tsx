/**
 * RichTextEditor.tsx — Éditeur WYSIWYG Tiptap réutilisable (R16.1).
 *
 * Features :
 *  - Titres H1/H2/H3, gras/italique/souligné/barré, listes, blockquote
 *  - Liens, images (URL + insertion depuis MediaPicker via onOpenMediaPicker)
 *  - Code inline + bloc de code
 *  - Tables (insertion via toolbar)
 *  - Séparateur horizontal, callouts (via blockquote)
 *  - Placeholder configurable
 *  - onChange(html) throttlé côté parent
 */
import { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
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
  Image as MediaIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  editable?: boolean;
  /** Ouvre la MediaLibrary pour insérer une image ; si fourni, remplace la
   *  prompt URL native. */
  onOpenMediaPicker?: () => void;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Rédigez votre contenu…',
  className,
  minHeight = '250px',
  editable = true,
  onOpenMediaPicker,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {},
      }),
      Underline,
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
      Table.configure({ resizable: true, HTMLAttributes: { class: 'be-editor-table' } }),
      TableRow,
      TableHeader,
      TableCell,
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
          'prose-headings:font-extrabold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
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

  // Sync externe (contrôle bidirectionnel light : ne recharge que si value
  // vraiment différent, sinon on casserait le curseur user)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const insertImageByURL = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL de l'image :");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
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
        onSetLink={setLink}
      />
      <EditorContent editor={editor} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function Toolbar({
  editor,
  onOpenMediaPicker,
  onInsertImage,
  onSetLink,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  onOpenMediaPicker?: () => void;
  onInsertImage: () => void;
  onSetLink: () => void;
}) {
  return (
    <div className="border-b border-neutral-200 bg-neutral-50/70 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
      {/* Undo / Redo */}
      <ToolbarBtn
        Icon={Undo}
        label="Annuler"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <ToolbarBtn
        Icon={Redo}
        label="Rétablir"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />
      <Divider />

      {/* Headings */}
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
      <Divider />

      {/* Marks */}
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
      <Divider />

      {/* Lists */}
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
        Icon={Quote}
        label="Citation / Callout"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Divider />

      {/* Code */}
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

      {/* Link + Image + Table */}
      <ToolbarBtn
        Icon={LinkIcon}
        label="Lien"
        active={editor.isActive('link')}
        onClick={onSetLink}
      />
      <ToolbarBtn
        Icon={ImageIcon}
        label="Image (URL)"
        onClick={onInsertImage}
      />
      {onOpenMediaPicker && (
        <ToolbarBtn
          Icon={MediaIcon}
          label="Insérer depuis la médiathèque"
          onClick={onOpenMediaPicker}
        />
      )}
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
      <ToolbarBtn
        Icon={Minus}
        label="Séparateur"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
    </div>
  );
}

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
        'p-1.5 rounded-lg transition text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
        active && 'bg-primary-100 text-primary-700',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-neutral-200" aria-hidden />;
}
