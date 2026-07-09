/**
 * MessagesDropdown.tsx — Placeholder messagerie (R15.2).
 * Vraie messagerie temps réel prévue en R16 (WebSockets).
 */
import { Link } from 'react-router-dom';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Dropdown } from './Dropdown';

export function MessagesDropdown() {
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="relative p-2 rounded-lg hover:bg-neutral-100 transition"
          aria-label="Messages"
        >
          <MessageSquare className="w-5 h-5 text-neutral-600" />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <p className="text-sm font-bold">Messages</p>
          </div>
          <div className="px-4 py-10 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="mt-3 text-sm font-bold text-neutral-900">
              Messagerie bientôt disponible
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              La messagerie temps réel avec formateurs, groupes et support
              arrivera avec la prochaine mise à jour (R16).
            </p>
          </div>
          <div className="border-t border-neutral-100 p-2">
            <Link
              to="/learn/messages"
              onClick={close}
              className="block w-full text-center px-3 py-2 rounded-lg text-xs font-semibold text-primary-600 hover:bg-primary-50"
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              En savoir plus →
            </Link>
          </div>
        </>
      )}
    </Dropdown>
  );
}
