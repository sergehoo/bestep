/**
 * app-shell.js — Shell unifié best-épargne (Alpine CSP build)
 *
 * Tous les composants sont enregistrés via Alpine.data() à l'intérieur de
 * l'événement `alpine:init` pour être compatibles avec la build CSP d'Alpine
 * (cdn.csp.min.js) qui n'autorise aucun opérateur JavaScript dans les
 * expressions de template.
 *
 * Composants exposés :
 *   - appShell       : composant racine (thème, sidebar, scroll)
 *   - sidebarNav     : sidebar partagée (learner / instructor / org / platform)
 *   - topbarSearch   : recherche topbar
 *   - bestepargneToast : toast (stub de secours — toast.js a la priorité)
 */

document.addEventListener('alpine:init', () => {

  /* ============================================================
     1. appShell — composant Alpine racine
     ============================================================ */
  Alpine.data('appShell', () => ({
    /* ---- state ---- */
    theme: 'light',
    scrolled: false,
    sidebar: {
      collapsed: false,
      mobileOpen: false,
    },

    /* ---- getters CSP (remplacent les opérateurs dans les templates) ---- */
    get isDark()  { return this.theme === 'dark'; },
    get isLight() { return this.theme === 'light'; },

    /* ---- helpers localStorage ---- */
    _get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    _set(key, val) {
      try { localStorage.setItem(key, val); } catch { /* noop */ }
    },

    /* ---- init (auto-appelé par Alpine au montage) ---- */
    init() {
      const saved = this._get('be_theme');
      const prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.theme = saved || (prefersDark ? 'dark' : 'light');
      this._applyTheme();

      this.sidebar.collapsed = this._get('be_sidebar_collapsed') === '1';

      window.__beShell = this;
      this._emitSidebarState();

      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          this.scrolled = window.scrollY > 4;
          ticking = false;
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      const mq = window.matchMedia('(min-width: 1024px)');
      const onResize = (e) => { if (e.matches) this.closeMobile(); };
      if (mq.addEventListener) mq.addEventListener('change', onResize);
      else if (mq.addListener) mq.addListener(onResize);

      window.addEventListener('be:sidebar-close', () => this.closeMobile());

      if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e) => {
          if (!this._get('be_theme')) {
            this.theme = e.matches ? 'dark' : 'light';
            this._applyTheme();
          }
        };
        if (media.addEventListener) media.addEventListener('change', handler);
        else if (media.addListener) media.addListener(handler);
      }
    },

    /* ---- thème ---- */
    _applyTheme() {
      /* dark doit être sur <html> pour Tailwind dark: variants */
      document.documentElement.classList.toggle('dark', this.theme === 'dark');
      document.documentElement.style.colorScheme = this.theme;
      this._set('be_theme', this.theme);
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      this._applyTheme();
    },

    /* ---- sidebar desktop (collapse) ---- */
    toggleCollapsed() {
      this.sidebar.collapsed = !this.sidebar.collapsed;
      this._set('be_sidebar_collapsed', this.sidebar.collapsed ? '1' : '0');
      this._emitSidebarState();
    },
    _emitSidebarState() {
      window.dispatchEvent(
        new CustomEvent('be:sidebar', { detail: { collapsed: this.sidebar.collapsed } })
      );
    },

    /* ---- sidebar mobile (drawer) ---- */
    /* be-drawer-open est géré directement sur <html> (CSS rule: html.be-drawer-open) */
    openMobile() {
      this.sidebar.mobileOpen = true;
      document.documentElement.classList.add('be-drawer-open');
    },
    closeMobile() {
      this.sidebar.mobileOpen = false;
      document.documentElement.classList.remove('be-drawer-open');
    },

    /* ---- méthodes remplaçant les expressions ternaires dans les templates ---- */
    /* dark et be-drawer-open sont gérés directement sur <html> via classList —
       shellRootClass() n'est plus nécessaire pour ces deux classes mais est
       conservé pour rétrocompatibilité (body n'a pas de règle CSS dessus). */
    shellRootClass() {
      return {};
    },
    topbarShadow() {
      return this.scrolled ? 'shadow-lift' : 'shadow-soft';
    },
    mobileMenuAriaExpanded() {
      return this.sidebar.mobileOpen ? 'true' : 'false';
    },
    collapseAriaPressed() {
      return this.sidebar.collapsed ? 'true' : 'false';
    },
    collapseAriaLabel() {
      return this.sidebar.collapsed ? 'Étendre le menu' : 'Réduire le menu';
    },
    collapseIconClass() {
      return this.sidebar.collapsed ? 'rotate-180' : '';
    },
    sidebarWidth() {
      return this.sidebar.collapsed ? 'w-[96px]' : 'w-[280px] xl:w-[320px]';
    },
    themeAriaLabel() {
      return this.theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre';
    },
    themeAriaPressed() {
      return String(this.theme === 'dark');
    },
  }));


  /* ============================================================
     2. sidebarNav — sidebar partagée (learner / instructor / org / platform)
     Utilise data-mode="{{ m }}" (attribut HTML statique, pas d'Alpine binding).
     ============================================================ */
  Alpine.data('sidebarNav', () => ({
    collapsed: false,

    get isExpanded() { return !this.collapsed; },

    init() {
      const mode = this.$el.dataset.mode || 'desktop';
      if (mode === 'mobile') { this.collapsed = false; return; }
      this.collapsed = (window.__beShell && window.__beShell.sidebar)
        ? !!window.__beShell.sidebar.collapsed
        : localStorage.getItem('be_sidebar_collapsed') === '1';
      window.addEventListener('be:sidebar', (e) => {
        if (mode !== 'mobile')
          this.collapsed = !!(e.detail && e.detail.collapsed);
      });
    },

    closeMobile() {
      const mode = this.$el.dataset.mode || 'desktop';
      if (mode === 'mobile')
        window.dispatchEvent(new CustomEvent('be:sidebar-close'));
    },

    /* ---- méthodes remplaçant les ternaires dans les templates sidebar ---- */
    navPadding() {
      return this.collapsed ? 'px-2 py-3' : 'p-3 sm:p-4';
    },
    logoSize() {
      return this.collapsed ? 'w-12 h-12 mx-auto' : 'w-full h-14';
    },
    logoSizeFlex() {
      return this.collapsed ? 'w-12 h-12 mx-auto' : 'w-full';
    },
    titleWhenCollapsed(text) {
      return this.collapsed ? text : '';
    },
  }));


  /* ============================================================
     3. topbarSearch — recherche topbar (espace apprenant)
     ============================================================ */
  Alpine.data('topbarSearch', () => ({
    q: '',
    loading: false,

    get hasQuery() {
      return !!(this.q && this.q.length);
    },

    init() {
      const url = new URL(window.location.href);
      this.q = url.searchParams.get('q') || '';
    },
    sync() {
      if (this.q.length < 2) return;
      const url = new URL(window.location.href);
      url.searchParams.set('q', this.q);
      window.history.replaceState({}, '', url.toString());
    },
    clear() {
      this.q = '';
      const url = new URL(window.location.href);
      url.searchParams.delete('q');
      window.history.replaceState({}, '', url.toString());
    },
  }));


  /* ============================================================
     4. bestepargneToast — stub de secours
     toast.js enregistre la version complète via son propre écouteur alpine:init.
     Ce bloc ne s'exécute que si toast.js ne l'a pas déjà fait.
     ============================================================ */
  try {
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
        if (duration > 0) setTimeout(() => this.dismiss(id), duration);
      },
      dismiss(id) { this.toasts = this.toasts.filter((t) => t.id !== id); },

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
  } catch { /* toast.js a déjà enregistré bestepargneToast — c'est normal */ }


  /* ============================================================
     5. workspaceSwitcher — dropdown de changement d'espace (topbar)
     ============================================================ */
  Alpine.data('workspaceSwitcher', () => ({
    open: false,
    toggle()        { this.open = !this.open; },
    close()         { this.open = false; },
    ariaExpanded()  { return String(this.open); },
  }));

  /* ============================================================
     6. Alpine store : learner (rétro-compat learner-shell.js)
     ============================================================ */
  try {
    Alpine.store('learner', {
      filters: { q: '' },
      me: null,
      async loadEnrollments() { return undefined; },
    });
  } catch { /* déjà enregistré */ }

  /* ============================================================
     7. flashMessage — messages flash Django (partials/flash_messages.html)
     ============================================================ */
  Alpine.data('flashMessage', () => ({
    open: true,
    close() { this.open = false; },
  }));
});
