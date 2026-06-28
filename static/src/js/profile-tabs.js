/**
 * profile-tabs.js — Gestion des onglets de la page profil (P3.4).
 *
 * Vanilla JS pur, CSP-safe (no eval, no inline). Sélection par attributs
 * data-* :
 *   - data-be-profile-tab="<name>"     sur les boutons d'onglet
 *   - data-be-profile-panel="<name>"   sur les sections de contenu
 *
 * Comportement :
 *   - Click → affiche le panel correspondant, masque les autres
 *   - Met à jour ?tab=<name> dans l'URL (history.replaceState) sans reload
 *   - Synchronise aria-selected sur les tabs pour l'accessibilité
 *   - Onglet actif initial déterminé par ?tab= ou défaut "info"
 */
(function () {
  'use strict';

  const ACTIVE_CLASS = 'be-profile-tab-active';
  const STORAGE_KEY = 'be-profile-active-tab';

  function getTabFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tab') || '').toLowerCase();
  }

  function updateUrl(tab) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch (_) { /* ignore */ }
  }

  function setActiveTab(name) {
    if (!name) return;

    // Tabs : update aria + active class.
    document.querySelectorAll('[data-be-profile-tab]').forEach((btn) => {
      const isActive = btn.getAttribute('data-be-profile-tab') === name;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.classList.toggle(ACTIVE_CLASS, isActive);
    });

    // Panels : show/hide.
    document.querySelectorAll('[data-be-profile-panel]').forEach((panel) => {
      const isActive = panel.getAttribute('data-be-profile-panel') === name;
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });

    updateUrl(name);
    try { sessionStorage.setItem(STORAGE_KEY, name); } catch (_) { /* mode privé */ }
  }

  function init() {
    // Bind click sur tous les tabs (event delegation léger).
    document.querySelectorAll('[data-be-profile-tab]').forEach((btn) => {
      btn.addEventListener('click', function () {
        setActiveTab(btn.getAttribute('data-be-profile-tab'));
      });
    });

    // Détermine l'onglet initial : ?tab= prime sur la classe active rendue
    // par le template (utile après un POST qui redirect vers ?tab=...).
    const urlTab = getTabFromUrl();
    if (urlTab) {
      setActiveTab(urlTab);
      return;
    }
    // Sinon, garder ce que le serveur a rendu (active_tab du context).
    // Repère le premier panel sans 'hidden'.
    const visible = document.querySelector('[data-be-profile-panel]:not([hidden])');
    if (visible) {
      setActiveTab(visible.getAttribute('data-be-profile-panel'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
