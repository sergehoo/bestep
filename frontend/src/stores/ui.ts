/**
 * stores/ui.ts — Store UI global : thème + langue + panier stub (R15.2).
 *
 * Le mode sombre applique/retire la classe `dark` sur <html> — Tailwind
 * est configuré en `darkMode: 'class'`. La langue est appliquée sur
 * `<html lang>` pour l'accessibilité et exploitée par le helper
 * `lib/i18n` (fr / en).
 *
 * L'application du thème / langue est effectuée :
 *   - Au boot après hydratation Zustand persist (rehydrate storage listener)
 *   - À chaque changement via les setters
 *   - En réaction au changement de préférence système `prefers-color-scheme`
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'fr' | 'en';

interface CartItem {
  courseId: number;
  slug: string;
  title: string;
  price: string;
  currency: string;
  thumbnail_url: string | null;
}

interface UIState {
  theme: ThemeMode;
  language: Language;
  cart: CartItem[];

  setTheme: (t: ThemeMode) => void;
  setLanguage: (l: Language) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (courseId: number) => void;
  clearCart: () => void;
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
  // Expose l'attribut aussi pour d'éventuels styles CSS attribute-based
  root.dataset.theme = isDark ? 'dark' : 'light';
  // Meta theme-color pour la barre du navigateur mobile
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#121827' : '#0C87D6');
  }
}

function applyLang(lang: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'fr',
      cart: [],
      setTheme: (t) => {
        applyTheme(t);
        set({ theme: t });
      },
      setLanguage: (l) => {
        applyLang(l);
        set({ language: l });
      },
      addToCart: (item) =>
        set((s) => ({
          cart: s.cart.some((i) => i.courseId === item.courseId)
            ? s.cart
            : [...s.cart, item],
        })),
      removeFromCart: (courseId) =>
        set((s) => ({
          cart: s.cart.filter((i) => i.courseId !== courseId),
        })),
      clearCart: () => set({ cart: [] }),
    }),
    {
      name: 'be-ui',
      // Applique thème + langue AUSSI après hydratation (l'état par
      // défaut est différent de la valeur restaurée depuis localStorage).
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyTheme(state.theme);
        applyLang(state.language);
      },
    },
  ),
);

// Application immédiate au chargement (avant même l'hydratation persist)
// puis abonnement au préf. OS pour le mode "system".
if (typeof window !== 'undefined') {
  const s = useUIStore.getState();
  applyTheme(s.theme);
  applyLang(s.language);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.(
    'change',
    () => {
      if (useUIStore.getState().theme === 'system') applyTheme('system');
    },
  );
}

// Selectors compacts
export const useTheme = () => useUIStore((s) => s.theme);
export const useLanguage = () => useUIStore((s) => s.language);
export const useCart = () => useUIStore((s) => s.cart);
export const useCartCount = () => useUIStore((s) => s.cart.length);
