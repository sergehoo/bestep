/**
 * be-modals.js — Gestion des modales déclaratives via attributs data-*.
 *
 * Usage HTML :
 *
 *   <button data-be-modal-open="my-modal">Ouvrir</button>
 *
 *   <div id="modal-my-modal" data-be-modal class="hidden fixed ...">
 *     <div data-be-modal-backdrop ...></div>
 *     <div class="relative ...">
 *       <button data-be-modal-close>×</button>
 *       ...
 *     </div>
 *   </div>
 *
 * Comportement :
 *   - Click sur [data-be-modal-open="X"] → ouvre #modal-X (remove "hidden",
 *     add "flex")
 *   - Click sur [data-be-modal-close] ou sur le backdrop → ferme
 *   - Touche Escape → ferme la modale ouverte (LIFO)
 *
 * Pas de dépendance Alpine — vanilla JS, CSP-safe (no inline event handler).
 */
(function () {
  'use strict';

  const OPEN_CLASSES = ['flex'];
  const HIDDEN_CLASS = 'hidden';

  function openModal(name) {
    const el = document.getElementById('modal-' + name);
    if (!el) return;
    el.classList.remove(HIDDEN_CLASS);
    OPEN_CLASSES.forEach(c => el.classList.add(c));
    el.setAttribute('aria-hidden', 'false');
    // Focus sur la modale pour l'accessibilité.
    const focusable = el.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
    // Empêche le scroll du body derrière la modale.
    document.body.style.overflow = 'hidden';
  }

  function closeModal(el) {
    if (!el) return;
    el.classList.add(HIDDEN_CLASS);
    OPEN_CLASSES.forEach(c => el.classList.remove(c));
    el.setAttribute('aria-hidden', 'true');
    // Restaure le scroll si plus aucune modale ouverte.
    const stillOpen = document.querySelector('[data-be-modal]:not(.hidden)');
    if (!stillOpen) document.body.style.overflow = '';
  }

  function getModalFromTarget(target) {
    return target.closest('[data-be-modal]');
  }

  document.addEventListener('click', function (e) {
    // 1. Bouton qui ouvre une modale
    const opener = e.target.closest('[data-be-modal-open]');
    if (opener) {
      e.preventDefault();
      openModal(opener.getAttribute('data-be-modal-open'));
      return;
    }
    // 2. Bouton qui ferme
    const closer = e.target.closest('[data-be-modal-close]');
    if (closer) {
      e.preventDefault();
      closeModal(getModalFromTarget(closer));
      return;
    }
    // 3. Click sur le backdrop = fermeture
    const backdrop = e.target.closest('[data-be-modal-backdrop]');
    if (backdrop) {
      e.preventDefault();
      closeModal(getModalFromTarget(backdrop));
      return;
    }
  });

  // Escape ferme la modale ouverte (la plus récente si plusieurs).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const opened = document.querySelectorAll('[data-be-modal]:not(.hidden)');
    if (!opened.length) return;
    e.preventDefault();
    closeModal(opened[opened.length - 1]);
  });
})();
