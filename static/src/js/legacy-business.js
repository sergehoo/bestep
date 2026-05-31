/**
 * legacy-business.js — Page espace entreprise (Alpine CSP build)
 * Component: businessApp — x-data="businessApp"
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('businessApp', () => ({
    employees: [
      { name: 'Aïcha Koné',  course: 'Excel Finance', progress: 72 },
      { name: "Yao N'Dri",   course: 'Conformité',    progress: 38 },
    ],

    progressText(e) { return e.progress + '%'; },
  }));
});
