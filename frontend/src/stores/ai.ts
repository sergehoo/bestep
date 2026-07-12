/**
 * stores/ai.ts — État local du panel IA (open/fullscreen/active conversation).
 *
 * Persisté en localStorage pour rouvrir la même conversation sur reload.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AIPanelState {
  isOpen: boolean;
  isFullscreen: boolean;
  activeConversationId: number | null;
  open: (id?: number) => void;
  close: () => void;
  toggle: () => void;
  setFullscreen: (b: boolean) => void;
  setActiveConversation: (id: number | null) => void;
}

export const useAIPanel = create<AIPanelState>()(
  persist(
    (set) => ({
      isOpen: false,
      isFullscreen: false,
      activeConversationId: null,
      open: (id) =>
        set((s) => ({
          isOpen: true,
          activeConversationId: id ?? s.activeConversationId,
        })),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setFullscreen: (b) => set({ isFullscreen: b }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
    }),
    {
      name: 'best-ai-panel',
      partialize: (s) => ({
        isFullscreen: s.isFullscreen,
        activeConversationId: s.activeConversationId,
      }),
    },
  ),
);
