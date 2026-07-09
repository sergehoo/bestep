import type { Config } from 'tailwindcss';

/**
 * Palette bleu/jaune Best Épargne — miroir de best_epargne/tailwind.config.js
 * du backend Django pour cohérence visuelle 100% sur toute la plateforme.
 *
 * Aliases sémantiques : primary (bleu marque), accent (jaune), neutral (gris).
 */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Alias sémantiques (recommandés)
        primary: {
          50: '#F2FAFF', 100: '#DEF3FF', 200: '#BEE8FF', 300: '#8AD7FF',
          400: '#4DBFFF', 500: '#1EA7FF', 600: '#0C87D6', 700: '#0B6FAE',
          800: '#0C5C8E', 900: '#0A466B',
          DEFAULT: '#0C87D6',
        },
        accent: {
          50: '#FFFBEA', 100: '#FFF3BF', 200: '#FFE58A', 300: '#FFD14D',
          400: '#FFBD1F', 500: '#F7A600', 600: '#D48300', 700: '#AD6400',
          800: '#8A4E00', 900: '#6A3B00',
          DEFAULT: '#F7A600',
        },
        neutral: {
          50: '#F7FAFC', 100: '#EEF2F7', 200: '#D7DEE9', 300: '#B5C0D4',
          400: '#7E8AA6', 500: '#5B6783', 600: '#3F4A63', 700: '#2B3449',
          800: '#1E2536', 900: '#121827',
        },
        // Alias legacy Django (compat)
        be: {
          sky: {
            50: '#F2FAFF', 100: '#DEF3FF', 200: '#BEE8FF', 300: '#8AD7FF',
            400: '#4DBFFF', 500: '#1EA7FF', 600: '#0C87D6', 700: '#0B6FAE',
            800: '#0C5C8E', 900: '#0A466B',
          },
          sun: {
            50: '#FFFBEA', 100: '#FFF3BF', 200: '#FFE58A', 300: '#FFD14D',
            400: '#FFBD1F', 500: '#F7A600', 600: '#D48300', 700: '#AD6400',
            800: '#8A4E00', 900: '#6A3B00',
          },
          ink: {
            50: '#F7FAFC', 100: '#EEF2F7', 200: '#D7DEE9', 300: '#B5C0D4',
            400: '#7E8AA6', 500: '#5B6783', 600: '#3F4A63', 700: '#2B3449',
            800: '#1E2536', 900: '#121827',
          },
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(12,92,142,.12)',
        lift: '0 12px 40px rgba(18,24,39,.14)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
} satisfies Config;
