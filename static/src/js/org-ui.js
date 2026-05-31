/* ──────────────────────────────────────────────────────────────────────────
   org-ui.js — Alpine components + vanilla helpers for organisation pages
   ────────────────────────────────────────────────────────────────────────── */

/* ── Alpine CSP-compatible components ─────────────────────────────────── */
document.addEventListener('alpine:init', () => {

  /* orgCourseFilter — filter grid on organisation/courses page */
  Alpine.data('orgCourseFilter', () => ({
    q:          '',
    status:     '',
    type:       '',
    pricing:    '',
    instructor: '',

    init() {
      this.$watch('q',          () => this.refresh());
      this.$watch('status',     () => this.refresh());
      this.$watch('type',       () => this.refresh());
      this.$watch('pricing',    () => this.refresh());
      this.$watch('instructor', () => this.refresh());
      this.refresh();
    },

    refresh() {
      document.querySelectorAll('[data-course-row]').forEach(row => {
        const search     = row.dataset.search     || '';
        const status     = row.dataset.status     || '';
        const type       = row.dataset.type       || '';
        const pricing    = row.dataset.pricing    || '';
        const instructor = row.dataset.instructor || '';

        const show =
          (!this.q          || search.includes(this.q.toLowerCase())) &&
          (!this.status     || status     === this.status)     &&
          (!this.type       || type       === this.type)       &&
          (!this.pricing    || pricing    === this.pricing)    &&
          (!this.instructor || instructor === this.instructor);

        row.classList.toggle('hidden', !show);
      });
    },
  }));

  /* orgMemberFilter — filter table on organisation/members page */
  Alpine.data('orgMemberFilter', () => ({
    q:    '',
    role: '',

    init() {
      this.$watch('q',    () => this.refresh());
      this.$watch('role', () => this.refresh());
      this.refresh();
    },

    refresh() {
      document.querySelectorAll('[data-member-row]').forEach(row => {
        const text = row.dataset.search || '';
        const role = row.dataset.role   || '';

        const show =
          (!this.q    || text.includes(this.q.toLowerCase())) &&
          (!this.role || role === this.role);

        row.classList.toggle('hidden', !show);
      });
    },
  }));
});

/* ── Vanilla helpers (no Alpine dependency) ────────────────────────────── */
(function () {
  document.addEventListener('DOMContentLoaded', () => {

    /* Mobile menu toggle (legacy – kept for non-Alpine pages) */
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      document.getElementById('mobile-menu')?.classList.toggle('hidden');
    });

    /* Auto-submit selects */
    document.querySelectorAll('select[data-auto-submit]').forEach(select => {
      select.addEventListener('change', () => select.form?.requestSubmit());
    });

    /* Confirmation dialogs for data-confirm forms */
    document.querySelectorAll('form[data-confirm]').forEach(form => {
      form.addEventListener('submit', event => {
        const message = form.getAttribute('data-confirm') || 'Confirmer cette action ?';
        if (!window.confirm(message)) event.preventDefault();
      });
    });
  });
}());
