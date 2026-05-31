/**
 * admin-shell.js — Shell admin/instructeur premium (Alpine CSP build)
 * Component: appShell — x-data="appShell"
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('appShell', () => ({
    theme: 'light',
    scrolled: false,
    sidebar: {
      collapsed: false,
      mobileOpen: false,
    },

    init() {
      this.initShell();
    },

    initShell() {
      const savedTheme = localStorage.getItem('be_theme');
      const prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.theme = savedTheme || (prefersDark ? 'dark' : 'light');
      this._applyTheme();

      this.sidebar.collapsed = localStorage.getItem('be_sidebar_collapsed') === '1';

      window.__beShell = this;
      this.emitSidebarState();

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

      window.addEventListener('be:sidebar-close', () => this.closeMobile());

      if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (event) => {
          if (!localStorage.getItem('be_theme')) {
            this.theme = event.matches ? 'dark' : 'light';
            this._applyTheme();
          }
        };
        if (media.addEventListener) media.addEventListener('change', handler);
        else if (media.addListener) media.addListener(handler);
      }

      const mediaQuery = window.matchMedia('(min-width: 1024px)');
      const onResize = (event) => {
        if (event.matches) this.closeMobile();
      };
      if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', onResize);
      else if (mediaQuery.addListener) mediaQuery.addListener(onResize);
    },

    _applyTheme() {
      document.documentElement.classList.toggle('dark', this.theme === 'dark');
    },

    /* CSP helpers */
    isDarkTheme()            { return this.theme === 'dark'; },
    isLightTheme()           { return this.theme === 'light'; },
    isDrawerOpen()           { return this.sidebar.mobileOpen; },

    htmlClass() {
      return {
        'dark':           this.theme === 'dark',
        'be-drawer-open': this.sidebar.mobileOpen,
      };
    },
    headerClass()          { return this.scrolled ? 'shadow-lift' : 'shadow-soft'; },
    mobileOpenAria()       { return this.sidebar.mobileOpen ? 'true' : 'false'; },
    collapsedAria()        { return this.sidebar.collapsed ? 'true' : 'false'; },
    toggleCollapseLabel()  { return this.sidebar.collapsed ? 'Étendre le menu' : 'Réduire le menu'; },
    collapseIconClass()    { return this.sidebar.collapsed ? 'rotate-180' : ''; },
    themeToggleLabel()     { return this.theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'; },
    sidebarWidthClass()    { return this.sidebar.collapsed ? 'w-[96px]' : 'w-[320px]'; },

    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('be_theme', this.theme);
      this._applyTheme();
    },

    toggleCollapsed() {
      this.sidebar.collapsed = !this.sidebar.collapsed;
      localStorage.setItem('be_sidebar_collapsed', this.sidebar.collapsed ? '1' : '0');
      this.emitSidebarState();
    },

    openMobile()         { this.sidebar.mobileOpen = true; },
    closeMobile()        { this.sidebar.mobileOpen = false; },
    closeMobileSidebar() { this.closeMobile(); },
    openMobileSidebar()  { this.openMobile(); },

    emitSidebarState() {
      window.dispatchEvent(new CustomEvent('be:sidebar', {
        detail: { collapsed: this.sidebar.collapsed },
      }));
    },

    /* ---- unused stub kept for compat ---- */
    linkClass(name) {
      return this._isActive(name)
        ? 'bg-be-sky-50 text-be-sky-700 border border-be-sky-200 shadow-soft'
        : 'text-be-ink-600 hover:bg-be-ink-50 hover:text-be-ink-900';
    },

    iconClass(name) {
      return this._isActive(name)
        ? 'text-be-sky-600'
        : 'text-be-ink-400 group-hover:text-be-ink-700';
    },

    _isActive(name) {
      const current = window.location.pathname;
      const routes = {
        dashboard:    ['/dashboard/instructor/'],
        courses:      ['/dashboard/instructor/courses/'],
        media:        ['/dashboard/instructor/media/'],
        quizzes:      ['/dashboard/instructor/quizzes/'],
        quiz_create:  ['/dashboard/instructor/quizzes/create/'],
      };
      return (routes[name] || []).some((route) => {
        if (name === 'dashboard') return current === route;
        return current.startsWith(route);
      });
    },
  }));

  /* ============================================================
     workspaceSwitcher — dropdown de changement d'espace (topbar)
     ============================================================ */
  Alpine.data('workspaceSwitcher', () => ({
    open: false,
    toggle()        { this.open = !this.open; },
    close()         { this.open = false; },
    ariaExpanded()  { return String(this.open); },
  }));

  /* ============================================================
     sidebarNav — sidebar partagée (instructor_side.html)
     Requis par admin_base.html qui inclut instructor_side.html.
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
});
