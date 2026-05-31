(function () {
  window.appShell = function appShell() {
    return {
      theme: "light",
      sidebar: {
        collapsed: false,
        mobileOpen: false,
      },

      initShell() {
        const savedTheme = localStorage.getItem("be_theme");
        const prefersDark = window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
        this.theme = savedTheme || (prefersDark ? "dark" : "light");
        this._applyTheme();

        this.sidebar.collapsed = localStorage.getItem("be_sidebar_collapsed") === "1";

        window.__beShell = this;
        this.emitSidebarState();
        window.addEventListener("be:sidebar-close", () => this.closeMobileSidebar());

        if (window.matchMedia) {
          const media = window.matchMedia("(prefers-color-scheme: dark)");
          const handler = (event) => {
            if (!localStorage.getItem("be_theme")) {
              this.theme = event.matches ? "dark" : "light";
              this._applyTheme();
            }
          };
          if (media.addEventListener) media.addEventListener("change", handler);
          else if (media.addListener) media.addListener(handler);
        }
      },

      _applyTheme() {
        document.documentElement.classList.toggle("dark", this.theme === "dark");
      },

      linkClass(name) {
        return this._isActive(name)
          ? "bg-be-sky-50 text-be-sky-700 border border-be-sky-200 shadow-soft"
          : "text-be-ink-600 hover:bg-be-ink-50 hover:text-be-ink-900";
      },

      iconClass(name) {
        return this._isActive(name)
          ? "text-be-sky-600"
          : "text-be-ink-400 group-hover:text-be-ink-700";
      },

      emitSidebarState() {
        window.dispatchEvent(new CustomEvent("be:sidebar", {
          detail: { collapsed: this.sidebar.collapsed },
        }));
      },

      toggleTheme() {
        this.theme = this.theme === "dark" ? "light" : "dark";
        localStorage.setItem("be_theme", this.theme);
        this._applyTheme();
      },

      toggleCollapsed() {
        this.sidebar.collapsed = !this.sidebar.collapsed;
        localStorage.setItem("be_sidebar_collapsed", this.sidebar.collapsed ? "1" : "0");
        this.emitSidebarState();
      },

      openMobileSidebar() {
        this.sidebar.mobileOpen = true;
      },

      closeMobileSidebar() {
        this.sidebar.mobileOpen = false;
      },

      _isActive(name) {
        const current = window.location.pathname;
        const routes = {
          dashboard: ["/dashboard/instructor/", "/dashboard/organization/"],
          courses: ["/dashboard/instructor/courses/", "/dashboard/organization/courses/"],
          media: ["/dashboard/instructor/media/", "/dashboard/organization/media/"],
          quizzes: ["/dashboard/instructor/quizzes/", "/dashboard/organization/quizzes/"],
          quiz_create: ["/dashboard/instructor/quizzes/create/", "/dashboard/organization/quizzes/create/"],
          members: ["/dashboard/organization/members/"],
          invitations: ["/dashboard/organization/invitations/"],
          analytics: ["/dashboard/organization/analytics/"],
        };
        return (routes[name] || []).some((route) => {
          if (name === "dashboard") return current === route;
          return current.startsWith(route);
        });
      },
    };
  };
}());
