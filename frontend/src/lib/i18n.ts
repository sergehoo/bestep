/**
 * lib/i18n.ts — Système i18n minimaliste (fr / en).
 *
 * Objectif : fournir un feedback visible au switch de langue sans imposer
 * une dépendance i18next lourde. Fournit `useT()` qui retourne une
 * fonction `t(key, fallback?)` réactive au changement de langue.
 *
 * Les clés non traduites tombent sur le fallback ou la clé elle-même.
 * Progressivement, on peut ajouter des entrées au dictionnaire au fur et
 * à mesure que les composants sont branchés.
 */
import { useCallback } from 'react';
import { useLanguage, type Language } from '@/stores/ui';

type Dict = Record<string, string>;

const FR: Dict = {
  // Topbar publique
  'nav.home': 'Accueil',
  'nav.courses': 'Cours',
  'nav.my_courses': 'Mes formations',
  'nav.favorites': 'Favoris',
  'nav.studio': 'Studio',
  'nav.search_placeholder': 'Rechercher un cours, une catégorie…',
  'nav.search_aria': 'Rechercher',
  'nav.menu_open': 'Ouvrir le menu',
  'nav.menu_close': 'Fermer le menu',
  'nav.login': 'Connexion',
  'nav.register': 'Créer un compte',
  'nav.become_instructor': 'Devenir instructeur',

  // Theme toggle
  'theme.light': 'Clair',
  'theme.dark': 'Sombre',
  'theme.system': 'Système',
  'theme.aria': 'Changer le thème',

  // Language switcher
  'lang.aria': 'Changer la langue',
  'lang.fr': 'Français',
  'lang.en': 'English',

  // Auth pages
  'auth.login.title': 'Connectez-vous à votre espace',
  'auth.register.title': 'Créez votre compte',
  'auth.remember': 'Se souvenir de moi',
  'auth.forgot': 'Mot de passe oublié ?',
  'auth.submit_login': 'Se connecter',
  'auth.submit_register': 'Créer mon compte',
  'auth.no_account': 'Vous n\'avez pas encore de compte ?',
  'auth.has_account': 'Vous avez déjà un compte ?',
};

const EN: Dict = {
  // Topbar public
  'nav.home': 'Home',
  'nav.courses': 'Courses',
  'nav.my_courses': 'My learning',
  'nav.favorites': 'Wishlist',
  'nav.studio': 'Studio',
  'nav.search_placeholder': 'Search for a course, a category…',
  'nav.search_aria': 'Search',
  'nav.menu_open': 'Open menu',
  'nav.menu_close': 'Close menu',
  'nav.login': 'Sign in',
  'nav.register': 'Create account',
  'nav.become_instructor': 'Become an instructor',

  // Theme toggle
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'theme.aria': 'Change theme',

  // Language switcher
  'lang.aria': 'Change language',
  'lang.fr': 'French',
  'lang.en': 'English',

  // Auth pages
  'auth.login.title': 'Sign in to your account',
  'auth.register.title': 'Create your account',
  'auth.remember': 'Remember me',
  'auth.forgot': 'Forgot password?',
  'auth.submit_login': 'Sign in',
  'auth.submit_register': 'Create my account',
  'auth.no_account': 'Don\'t have an account yet?',
  'auth.has_account': 'Already have an account?',
};

const DICTS: Record<Language, Dict> = { fr: FR, en: EN };

/**
 * Hook `useT` — retourne une fonction `t(key, fallback?)` qui traduit
 * selon la langue courante. Réagit automatiquement au changement de
 * langue dans le store Zustand.
 */
export function useT() {
  const lang = useLanguage();
  return useCallback(
    (key: string, fallback?: string): string => {
      const dict = DICTS[lang] ?? DICTS.fr;
      return dict[key] ?? fallback ?? key;
    },
    [lang],
  );
}

/**
 * Application immédiate de `lang` sur l'élément `<html>`. Utile au boot
 * et à chaque changement (accessibilité + hyphenation + lecteurs d'écran).
 */
export function applyLangToHtml(lang: Language) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}
