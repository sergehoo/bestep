# RichTextEditor — Extensions Tiptap à installer pour un WYSIWYG complet

Le composant actuel (`RichTextEditor.tsx`) couvre les features de base :
titres, gras/italique/souligné/barré, listes, blockquote, code inline
et block, lien, image (URL + médiathèque), table, séparateur, undo/redo.

Pour un vrai WYSIWYG "complet" (couleur, alignement, exposant, taille de
police…), il faut installer les extensions Tiptap séparées et wire-er
les boutons. Suivre cette recette :

## 1. Installer les paquets

```bash
cd frontend
npm install \
  @tiptap/extension-text-align \
  @tiptap/extension-color \
  @tiptap/extension-text-style \
  @tiptap/extension-highlight \
  @tiptap/extension-subscript \
  @tiptap/extension-superscript \
  @tiptap/extension-typography \
  @tiptap/extension-font-family
```

Tous à la même version que `@tiptap/react` (actuellement `^2.27.2`).

## 2. Modifier `RichTextEditor.tsx`

### 2.1. Imports

Ajouter en haut du fichier, après les imports Tiptap existants :

```tsx
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Typography from '@tiptap/extension-typography';
import FontFamily from '@tiptap/extension-font-family';
```

Et les icônes lucide-react correspondantes :

```tsx
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Highlighter, Palette, Superscript as SupIcon,
  Subscript as SubIcon,
} from 'lucide-react';
```

### 2.2. Ajouter les extensions dans `useEditor`

Dans le tableau `extensions:` du hook `useEditor`, ajouter :

```tsx
extensions: [
  StarterKit.configure({ ... }),
  // ... extensions existantes ...
  TextStyle,           // requis avant Color + FontFamily
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Subscript,
  Superscript,
  Typography,          // ligatures + guillemets typographiques auto
  FontFamily,
],
```

### 2.3. Ajouter les boutons dans la Toolbar

Après le bloc "Marks" (bold/italic/underline/strike) :

```tsx
{/* Text align */}
<Divider />
<ToolbarBtn
  Icon={AlignLeft}
  label="Aligné à gauche"
  active={editor.isActive({ textAlign: 'left' })}
  onClick={() => editor.chain().focus().setTextAlign('left').run()}
/>
<ToolbarBtn
  Icon={AlignCenter}
  label="Centré"
  active={editor.isActive({ textAlign: 'center' })}
  onClick={() => editor.chain().focus().setTextAlign('center').run()}
/>
<ToolbarBtn
  Icon={AlignRight}
  label="Aligné à droite"
  active={editor.isActive({ textAlign: 'right' })}
  onClick={() => editor.chain().focus().setTextAlign('right').run()}
/>
<ToolbarBtn
  Icon={AlignJustify}
  label="Justifié"
  active={editor.isActive({ textAlign: 'justify' })}
  onClick={() => editor.chain().focus().setTextAlign('justify').run()}
/>

{/* Color + Highlight */}
<Divider />
<label className="p-1.5 cursor-pointer" title="Couleur du texte">
  <Palette className="w-4 h-4 text-neutral-600" />
  <input
    type="color"
    className="w-0 h-0 opacity-0 absolute"
    onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
  />
</label>
<label className="p-1.5 cursor-pointer" title="Surligner">
  <Highlighter className="w-4 h-4 text-neutral-600" />
  <input
    type="color"
    className="w-0 h-0 opacity-0 absolute"
    onChange={(e) =>
      editor.chain().focus().toggleHighlight({ color: e.target.value }).run()
    }
  />
</label>

{/* Sup / Sub */}
<Divider />
<ToolbarBtn
  Icon={SupIcon}
  label="Exposant"
  active={editor.isActive('superscript')}
  onClick={() => editor.chain().focus().toggleSuperscript().run()}
/>
<ToolbarBtn
  Icon={SubIcon}
  label="Indice"
  active={editor.isActive('subscript')}
  onClick={() => editor.chain().focus().toggleSubscript().run()}
/>
```

## 3. Vérification

```bash
cd frontend
npm run type-check   # doit passer 0 erreur
npm run dev
```

Ouvrir un éditeur de leçon (`/instructor/courses/:id/lessons/:lid/edit`)
et tester chaque bouton nouvellement ajouté.

## 4. Extensions optionnelles pour aller plus loin

- `@tiptap/extension-mention` — mentions @user
- `@tiptap/extension-task-list` + `-task-item` — checkboxes
- `@tiptap/extension-youtube` — embed vidéo YouTube
- `@tiptap/extension-character-count` — compteur mots/caractères

Chaque extension a sa propre doc sur [tiptap.dev](https://tiptap.dev/).
