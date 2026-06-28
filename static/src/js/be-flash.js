/**
 * be-flash.js — Gestion auto-dismiss des messages flash Django (P5.3).
 *
 * Détecte les éléments avec data-be-flash et :
 *   - auto-dismiss après `data-be-flash-timeout` ms (défaut 5000)
 *   - fermeture manuelle via [data-be-flash-close]
 *   - transition fade-out + remove du DOM
 *
 * Pas de dépendance externe, CSP-safe (vanilla JS, no eval, no inline).
 *
 * Usage : inclure ce script une fois dans app_shell.html (déjà fait).
 * Les flashs Django stylés via partials/ds/flash_messages.html sont
 * gérés automatiquement.
 */
(function () {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 5000;
  const FADE_OUT_MS = 200;

  function fadeOutAndRemove(el) {
    el.style.transition = `opacity ${FADE_OUT_MS}ms ease, transform ${FADE_OUT_MS}ms ease`;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, FADE_OUT_MS + 50);
  }

  function init() {
    document.querySelectorAll('[data-be-flash]').forEach((el) => {
      const timeout = parseInt(el.getAttribute('data-be-flash-timeout') || DEFAULT_TIMEOUT_MS, 10);

      // Bouton de fermeture manuelle
      const closer = el.querySelector('[data-be-flash-close]');
      if (closer) {
        closer.addEventListener('click', () => fadeOutAndRemove(el));
      }

      // Auto-dismiss après le timeout
      if (timeout > 0) {
        let timer = setTimeout(() => fadeOutAndRemove(el), timeout);

        // Pause auto-dismiss au survol (UX classique des toasts)
        el.addEventListener('mouseenter', () => {
          clearTimeout(timer);
          timer = null;
        });
        el.addEventListener('mouseleave', () => {
          if (!timer) {
            timer = setTimeout(() => fadeOutAndRemove(el), timeout / 2);
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
