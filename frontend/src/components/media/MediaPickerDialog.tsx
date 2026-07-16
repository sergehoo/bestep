/**
 * MediaPickerDialog.tsx — Modal d'insertion depuis la médiathèque (R16.3).
 * Utilisée par l'éditeur Tiptap pour insérer image/vidéo/audio/pdf.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { MediaLibraryPanel } from './MediaLibraryPanel';
import type { MediaAsset } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (asset: MediaAsset) => void;
  title?: string;
}

export function MediaPickerDialog({ open, onClose, onPick, title }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title || 'Sélectionner un média'}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl max-h-[85vh] bg-neutral-50 rounded-2xl shadow-lift overflow-hidden flex flex-col"
          >
            <header className="flex items-center justify-between p-4 border-b border-neutral-200 bg-white">
              <div>
                <h2 className="text-base font-extrabold">
                  {title || 'Médiathèque'}
                </h2>
                <p className="text-xs text-neutral-500">
                  Sélectionnez un média pour l'insérer dans votre contenu.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <MediaLibraryPanel
                pickable
                onPick={(asset) => {
                  onPick(asset);
                  onClose();
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
