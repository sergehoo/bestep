/**
 * tailwind.config.js — V5.E (CORRECTIF UI-04).
 *
 * Avant : Tailwind chargé via `<script src="cdn.tailwindcss.com">` dans
 * 14 templates → ~150 KB JS runtime par page, FOUC, pas de purge,
 * console warning permanent.
 *
 * Après : build production purgé (PostCSS via Tailwind CLI) → ~30 KB CSS
 * minifié + brotli, pas de FOUC, performances Lighthouse +10-15 points.
 *
 * Usage :
 *   npm install
 *   npm run build:css     # production
 *   npm run watch:css     # dev (hot reload)
 *
 * Côté templates : remplacer
 *   <script src="https://cdn.tailwindcss.com"></script>
 * par
 *   <link rel="stylesheet" href="{% static 'dist/app.min.css' %}">
 */
module.exports = {
  darkMode: "class",
  // Tous les fichiers où Tailwind scanne les classes.
  content: [
    "./templates/**/*.{html,js}",
    "./compte/**/*.py",
    "./catalog/**/*.py",
    "./organizations/**/*.py",
    "./formations/**/*.py",
    "./enrollments/**/*.py",
    "./certifications/**/*.py",
    "./commerce/**/*.py",
    "./reviews/**/*.py",
    "./assessments/**/*.py",
    "./best_epargne/**/*.py",
    "./core/**/*.py",
    "./static/src/**/*.{css,js}",
  ],
  theme: {
    extend: {
      colors: {
        be: {
          sky: {
            50:  "#F2FAFF", 100: "#DEF3FF", 200: "#BEE8FF", 300: "#8AD7FF",
            400: "#4DBFFF", 500: "#1EA7FF", 600: "#0C87D6", 700: "#0B6FAE",
            800: "#0C5C8E", 900: "#0A466B",
          },
          sun: {
            50:  "#FFFBEA", 100: "#FFF3BF", 200: "#FFE58A", 300: "#FFD14D",
            400: "#FFBD1F", 500: "#F7A600", 600: "#D48300", 700: "#AD6400",
            800: "#8A4E00", 900: "#6A3B00",
          },
          ink: {
            50:  "#F7FAFC", 100: "#EEF2F7", 200: "#D7DEE9", 300: "#B5C0D4",
            400: "#7E8AA6", 500: "#5B6783", 600: "#3F4A63", 700: "#2B3449",
            800: "#1E2536", 900: "#121827",
          },
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(12,92,142,.12)",
        ring: "0 0 0 6px rgba(30,167,255,.12)",
        lift: "0 12px 40px rgba(18,24,39,.14)",
        premium: "0 22px 60px rgba(15,23,42,.10)",
        glow: "0 18px 45px rgba(37,99,235,.22)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
      spacing: {
        82: "20.5rem",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
  ],
  safelist: [
    // Classes générées dynamiquement par les sérializers / Alpine bindings.
    // Tailwind ne peut pas les scanner statiquement.
    {
      pattern: /^(bg|text|border|ring)-(sky|emerald|amber|rose|indigo|slate)-(50|100|200|300|400|500|600|700|800|900)$/,
      variants: ["hover", "focus", "dark"],
    },
    {
      pattern: /^(bg|text)-be-(sky|sun|ink)-(50|100|200|300|400|500|600|700|800|900)$/,
      variants: ["hover", "focus", "dark"],
    },
  ],
};
