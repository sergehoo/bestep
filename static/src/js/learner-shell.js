/**
 * learner-shell.js — Shell espace apprenant (Alpine CSP build)
 * Components:
 *   appShell       — x-data="appShell"
 *   topbarSearch   — x-data="topbarSearch"
 *   learnerSidebar — x-data="learnerSidebar" data-mode="desktop|mobile"
 */

(function () {
  document.addEventListener('alpine:init', () => {

    /* ---- Learner store ---- */
    const existing = Alpine.store('learner');
    if (!existing) {
      Alpine.store('learner', {
        filters: { q: '' },
        me: null,
        isLoadingEnrollments: false,
        async loadEnrollments() { return undefined; },
      });
    } else {
      existing.filters = existing.filters || {};
      if (typeof existing.filters.q !== 'string') existing.filters.q = '';
      if (typeof existing.loadEnrollments !== 'function') {
        existing.loadEnrollments = async function () { return undefined; };
      }
    }

    /* ============================================================
       appShell
       ============================================================ */
    Alpine.data('appShell', () => ({
      theme: 'light',
      sidebar: {
        collapsed: false,
        mobileOpen: false,
      },

      init() {
        this.initShell();
      },

      _safeGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
      },

      _safeSet(key, val) {
        try { localStorage.setItem(key, val); } catch (e) {}
      },

      initShell() {
        const savedTheme    = this._safeGet('be_theme');
        const savedCollapsed = this._safeGet('be_sidebar_collapsed');
        const systemPrefersDark = window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches;

        this.theme             = savedTheme || (systemPrefersDark ? 'dark' : 'light');
        this.sidebar.collapsed = savedCollapsed === '1';

        document.documentElement.classList.toggle('dark', this.theme === 'dark');
        document.documentElement.style.colorScheme = this.theme;

        window.__beShell = this;

        window.dispatchEvent(new CustomEvent('be:sidebar', {
          detail: { collapsed: this.sidebar.collapsed },
        }));

        this.$watch('sidebar.mobileOpen', (open) => {
          document.body.classList.toggle('be-no-scroll', !!open);
        });

        if (window.matchMedia) {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const applySystemTheme = (event) => {
            if (!this._safeGet('be_theme')) {
              this.theme = event.matches ? 'dark' : 'light';
              document.documentElement.classList.toggle('dark', this.theme === 'dark');
              document.documentElement.style.colorScheme = this.theme;
            }
          };
          if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', applySystemTheme);
          } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(applySystemTheme);
          }
        }
      },

      /* CSP helpers */
      isDarkTheme()           { return this.theme === 'dark'; },
      isLightTheme()          { return this.theme === 'light'; },
      shellClass()            { return { 'dark': this.theme === 'dark' }; },
      closeMobileSidebar()    { this.sidebar.mobileOpen = false; },
      openMobileSidebar()     { this.sidebar.mobileOpen = true; },
      closeMobile()           { this.sidebar.mobileOpen = false; },
      openMobile()            { this.sidebar.mobileOpen = true; },
      themeToggleLabel()      { return this.theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'; },
      mobileOpenAria()        { return this.sidebar.mobileOpen ? 'true' : 'false'; },
      collapsedAria()         { return this.sidebar.collapsed ? 'true' : 'false'; },
      toggleCollapseLabel()   { return this.sidebar.collapsed ? 'Étendre le menu' : 'Réduire le menu'; },
      collapseIconClass()     { return this.sidebar.collapsed ? 'rotate-180' : ''; },
      sidebarWidthClass()     { return this.sidebar.collapsed ? 'sidebar-width-collapsed' : 'sidebar-width-expanded'; },

      userInitials() {
        const s = Alpine.store('learner');
        return (s && s.me && s.me.initials) ? s.me.initials : 'A';
      },
      userName() {
        const s = Alpine.store('learner');
        if (s && s.me) return s.me.full_name || s.me.email || 'Apprenant';
        return 'Apprenant';
      },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this._safeSet('be_theme', this.theme);
        document.documentElement.classList.toggle('dark', this.theme === 'dark');
        document.documentElement.style.colorScheme = this.theme;
      },

      toggleCollapsed() {
        this.sidebar.collapsed = !this.sidebar.collapsed;
        this._safeSet('be_sidebar_collapsed', this.sidebar.collapsed ? '1' : '0');
        window.dispatchEvent(new CustomEvent('be:sidebar', {
          detail: { collapsed: this.sidebar.collapsed },
        }));
      },
    }));

    /* ============================================================
       topbarSearch
       ============================================================ */
    Alpine.data('topbarSearch', () => ({
      q: '',
      loading: false,

      init() {
        const store = Alpine.store('learner');
        this.q = (store && store.filters && store.filters.q) || '';
      },

      async sync() {
        const store = Alpine.store('learner');
        if (!store) return;
        store.filters      = store.filters || {};
        store.filters.q    = this.q;
        this.loading       = true;
        try {
          if (typeof store.loadEnrollments === 'function') {
            await store.loadEnrollments();
          }
        } catch (e) {
          console.error('[topbarSearch] loadEnrollments failed:', e);
        } finally {
          this.loading = false;
        }
      },

      clear()    { this.q = ''; this.sync(); },
      hasQuery() { return !!(this.q && this.q.length); },
    }));

    /* ============================================================
       learnerSidebar
       ============================================================ */
    Alpine.data('learnerSidebar', () => ({
      mode: 'desktop',
      collapsed: false,
      badge: { notifications: null },

      init() {
        this.mode = this.$el.dataset.mode || 'desktop';

        this.collapsed = (window.__beShell && window.__beShell.sidebar)
          ? !!window.__beShell.sidebar.collapsed
          : false;

        window.addEventListener('be:sidebar', (event) => {
          if (this.mode === 'desktop') {
            this.collapsed = !!(event.detail && event.detail.collapsed);
          }
        });
      },

      isActive(key) {
        let url;
        try { url = new URL(window.location.href); } catch (e) { return false; }

        const path = (url.pathname || '').toLowerCase();
        const tab  = (url.searchParams.get('tab') || '').toLowerCase();

        const tabRules = {
          my_courses:    ['my_courses', 'courses'],
          progress:      ['progress'],
          notifications: ['notifications', 'alerts'],
          payments:      ['payments', 'billing'],
        };

        if (tab) {
          if (key === 'dashboard') return false;
          const tabRule = tabRules[key] || [];
          return tabRule.includes(tab);
        }

        const pathRules = {
          dashboard:     ['/dashboard', '/learner/dashboard', '/student/dashboard'],
          my_courses:    ['/courses', '/enrollments', '/learner/courses', '/student/courses'],
          progress:      ['/progress', '/tracking', '/learner/progress'],
          notifications: ['/notifications', '/alerts'],
          payments:      ['/payments', '/billing', '/invoices'],
          explore:       ['/explore', '/catalog', '/catalogue', '/learner/explore'],
        };

        const pathRule = pathRules[key] || [];
        return pathRule.some((item) => path.includes(item));
      },

      linkClass(key, tone) {
        const active = this.isActive(key);
        const baseHover = 'hover:bg-be-ink-50/60 dark:hover:bg-white/10';
        if (!active) return baseHover;
        if (tone === 'sun') return 'bg-be-sun-50 dark:bg-white/10 border border-be-sun-200/70 dark:border-white/10';
        if (tone === 'ink') return 'bg-be-ink-50 dark:bg-white/10 border border-be-ink-100/70 dark:border-white/10';
        return 'bg-be-sky-50 dark:bg-white/10 border border-be-sky-200/70 dark:border-white/10';
      },

      iconClass(key, tone) {
        const active = this.isActive(key);
        if (!active) return 'text-be-ink-600 dark:text-white/80';
        if (tone === 'sun') return 'text-be-sun-700 dark:text-white';
        if (tone === 'ink') return 'text-be-ink-800 dark:text-white';
        return 'text-be-sky-700 dark:text-white';
      },
    }));

  });
}());
