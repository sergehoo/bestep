/**
 * toast.js — Composant Alpine bestepargneToast (Alpine CSP build)
 *
 * Enregistré via Alpine.data() pour compatibilité CSP.
 * Les méthodes toastBgClass/toastIconClass remplacent les expressions
 * avec opérateurs (===, !) interdites dans les templates CSP.
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('bestepargneToast', () => ({
    toasts: [],
    _id: 0,

    init() {
      const self = this;
      window.toast = {
        show(opts)            { self.show(opts); },
        success(msg, o = {}) { self.show({ ...o, type: 'success', message: msg }); },
        error(msg, o = {})   { self.show({ ...o, type: 'error',   message: msg }); },
        warning(msg, o = {}) { self.show({ ...o, type: 'warning', message: msg }); },
        info(msg, o = {})    { self.show({ ...o, type: 'info',    message: msg }); },
      };
    },

    show({ type = 'info', message = '', duration = 4000 } = {}) {
      const id = ++this._id;
      this.toasts.push({ id, type, message });
      if (duration > 0) {
        setTimeout(() => this.dismiss(id), duration);
      }
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
    },

    toastBgClass(t) {
      const map = {
        success: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/80 dark:border-emerald-800/60 dark:text-emerald-200',
        error:   'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/80 dark:border-rose-800/60 dark:text-rose-200',
        warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/80 dark:border-amber-800/60 dark:text-amber-200',
      };
      return map[t.type] || 'bg-be-sky-50 border-be-sky-200 text-be-sky-900 dark:bg-be-ink-800 dark:border-white/10 dark:text-white';
    },

    toastIconClass(t) {
      const map = {
        success: 'fa-circle-check',
        error:   'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
      };
      return map[t.type] || 'fa-circle-info';
    },
  }));
});
