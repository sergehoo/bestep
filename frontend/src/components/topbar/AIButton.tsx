/**
 * AIButton.tsx — Bouton d'ouverture de l'assistant IA (R15.2).
 * Modal simple qui explique que la feature arrive en R16.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

export function AIButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-primary-600 to-accent-500 text-white text-xs font-bold hover:opacity-90 transition"
        aria-label="Assistant IA"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>IA</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl shadow-lift overflow-hidden"
            >
              <div className="relative bg-gradient-to-br from-primary-600 to-accent-500 text-white p-6 text-center">
                <button
                  onClick={() => setOpen(false)}
                  className="absolute top-3 right-3 p-1 rounded-lg bg-white/20 hover:bg-white/30"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="w-14 h-14 mx-auto rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h2 className="mt-3 text-lg font-extrabold">
                  Votre copilote IA arrive bientôt
                </h2>
                <p className="mt-1 text-xs text-primary-100">
                  Résumés, quiz personnalisés, plan d'étude, recommandations…
                </p>
              </div>
              <div className="p-5 text-sm text-neutral-700 space-y-2">
                <p>
                  L'assistant IA sera disponible en R16. Il pourra&nbsp;:
                </p>
                <ul className="text-xs list-disc list-inside space-y-1 text-neutral-600">
                  <li>Résumer une leçon ou une vidéo</li>
                  <li>Expliquer un concept avec différents niveaux</li>
                  <li>Répondre à vos questions à partir du cours</li>
                  <li>Générer fiches de révision et flashcards</li>
                  <li>Proposer un plan d'étude adapté à vos objectifs</li>
                </ul>
              </div>
              <div className="border-t border-neutral-100 p-3 text-right">
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700"
                >
                  Compris
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
