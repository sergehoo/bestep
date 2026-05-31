/**
 * learner-explore.js — Alpine components for the learner "explore courses" page.
 *
 * Components registered:
 *  - Alpine.store('explore')   – shared filters/event-bus used by topbar + main section
 *  - exploreFilters            – mini-component wrapping the topbar search input
 *  - learnerAvatar             – mini-component for the topbar avatar chip
 *  - exploreApp                – main section component (course grid, modals, pagination)
 *
 * Configuration is passed via data-* attributes on the section element:
 *   data-url-me="<url>"
 *   data-url-explore="<url>"
 *
 * URL patterns that embed a course id are constructed in JS and do not need
 * to come from the template.
 */

document.addEventListener('alpine:init', () => {

  /* ── Shared explore store (filters + event bus) ─────────────────────── */
  Alpine.store('explore', {
    filters: { q: '', type: '', pricing: '', sort: 'recent' },
    _listeners: [],
    on(fn)          { this._listeners.push(fn); },
    emit(reset = true) {
      this._listeners.forEach(fn => { try { fn({ reset }); } catch (e) { console.error(e); } });
    },
  });

  /* ── exploreFilters — topbar search input ───────────────────────────── */
  Alpine.data('exploreFilters', () => ({
    get f() { return Alpine.store('explore').filters; },
    emitSearch() { Alpine.store('explore').emit(true); },
  }));

  /* ── learnerAvatar — topbar user chip ───────────────────────────────── */
  Alpine.data('learnerAvatar', () => ({
    me: {},
    init() { this.me = window.__beLearnerMe || {}; },
    initials() { return this.me.initials || 'A'; },
    fullName()  { return this.me.full_name || 'Apprenant'; },
  }));

  /* ── exploreApp — main course-grid component ─────────────────────────── */
  Alpine.data('exploreApp', () => ({

    endpoints: {},
    me: {},
    courses: [],
    meta: { count: 0, limit: 24, offset: 0 },
    loading: { me: false, explore: false, enrollId: null, detail: false },
    toast:   { show: false, title: '', message: '' },
    modals:  { detail: false },
    detail:  null,

    /* ── lifecycle ─────────────────────────────────────────────────────── */
    init() {
      const el = this.$el;
      this.endpoints = {
        me:           el.dataset.urlMe,
        explore:      el.dataset.urlExplore,
        enroll:       (id) => `/api/learner/courses/${id}/enroll/`,
        courseDetail: (id) => `/api/learner/courses/${id}/`,
      };

      const store = Alpine.store('explore');
      store.on(({ reset }) => this.loadExplore(!!reset));

      this.loadMe();
      this.loadExplore(true);
    },

    /* ── toast ─────────────────────────────────────────────────────────── */
    showToast(title, message) {
      this.toast = { show: true, title, message };
      setTimeout(() => { this.toast.show = false; }, 3500);
    },
    clearToast() { this.toast.show = false; },

    /* ── pagination computed ────────────────────────────────────────────── */
    paginationEnd() {
      return Math.min(this.meta.offset + this.meta.limit, this.meta.count);
    },
    get prevDisabled() {
      return this.loading.explore || this.meta.offset <= 0;
    },
    get nextDisabled() {
      return this.loading.explore || (this.meta.offset + this.meta.limit) >= this.meta.count;
    },

    /* ── empty-state helper ─────────────────────────────────────────────── */
    showEmpty() { return !this.loading.explore && this.courses.length === 0; },

    /* ── card-level helpers (take course object `c`) ─────────────────────── */
    courseLevelLabel(c)   { return c.level_label || c.level || 'Niveau'; },
    courseCategoryName(c) { return c.category_name || '—'; },
    courseSubtitle(c)     { return c.subtitle || ''; },
    courseInstructorName(c) { return c.instructor_name || 'Formateur'; },
    courseCourseType(c)   { return c.course_type_label || c.course_type || ''; },
    courseCardClass(c)    { return c.is_enrolled ? 'ring-1 ring-emerald-200/60' : ''; },
    courseNoThumb(c)      { return !c.thumbnail_url; },
    isPaid(c)             { return c.pricing_type !== 'FREE' && Number(c.price || 0) > 0; },
    isFree(c)             { return c.pricing_type === 'FREE' || Number(c.price || 0) === 0; },
    hasEnrolledCount(c)   { return c.enrolled_count != null; },
    notEnrolled(c)        { return !c.is_enrolled; },
    notEnrolling(c)       { return this.loading.enrollId !== c.id; },
    isEnrolling(c)        { return this.loading.enrollId === c.id; },
    enrollDisabled(c)     { return this.loading.enrollId === c.id || c.is_enrolled; },
    enrollBtnClass(c)     {
      return c.is_enrolled
        ? 'bg-be-ink-50 border border-be-ink-100 text-be-ink-700'
        : 'bg-be-sky-600 text-white hover:bg-be-sky-700 shadow-soft';
    },
    instructorInitials(c) {
      return c.instructor_initials || (c.instructor_name || 'F')[0] || 'F';
    },
    pricingChipClass(c) {
      if (c.pricing_type === 'PAID') return 'bg-be-sun-50 border border-be-sun-200 text-be-sun-800';
      if (c.pricing_type === 'FREE') return 'bg-emerald-50 border border-emerald-200 text-emerald-700';
      return 'bg-be-ink-50 border border-be-ink-100 text-be-ink-700';
    },
    pricePeriod(c)  { return '/ ' + (c.price_period || 'cours'); },
    formatRating(c) { return Number(c.rating || 0).toFixed(1); },
    priceText(c)    { return this.fmtMoney(c.price) + ' ' + this.moneyCur(c.currency); },

    /* ── detail-modal helpers ───────────────────────────────────────────── */
    detailCategoryName()   { return (this.detail && this.detail.category_name) ? this.detail.category_name : '—'; },
    detailCourseType()     { return this.detail ? (this.detail.course_type_label || this.detail.course_type || '—') : '—'; },
    detailInstructorName() { return (this.detail && this.detail.instructor_name) ? this.detail.instructor_name : 'Formateur'; },
    detailLevelLabel()     { return this.detail ? (this.detail.level_label || this.detail.level || '') : ''; },
    detailSubtitle()       { return (this.detail && this.detail.subtitle) ? this.detail.subtitle : ''; },
    detailDescription()    { return (this.detail && this.detail.description) ? this.detail.description : ''; },
    detailPricePeriod()    { return (this.detail && this.detail.price_period) ? this.detail.price_period : 'cours'; },
    detailStatus()         { return (this.detail && this.detail.status) ? this.detail.status : '—'; },
    detailDuration()       { return (this.detail && this.detail.duration) ? this.detail.duration : '—'; },
    detailTitle()          { return (this.detail && this.detail.title) || 'Détails du cours'; },
    detailReady()          { return !this.loading.detail && !!this.detail; },
    detailNoThumb()        { return !this.detail.thumbnail_url; },
    detailEnrolledCount()  { return this.detail.enrolled_count != null ? this.detail.enrolled_count : 0; },
    detailRating()         { return Number(this.detail.rating || 0).toFixed(1); },
    detailIsFree()         { return this.detail.pricing_type === 'FREE' || Number(this.detail.price || 0) === 0; },
    detailIsPaid()         { return this.detail.pricing_type !== 'FREE' && Number(this.detail.price || 0) > 0; },
    detailIsEnrolled()     { return !!(this.detail && this.detail.is_enrolled); },
    detailEnrolling()      { return !!(this.detail && this.loading.enrollId === this.detail.id); },
    showDetailEnrollBtn()  {
      return !!(this.detail && !this.detail.is_enrolled && this.loading.enrollId !== this.detail.id);
    },
    detailEnrollDisabled() {
      return !this.detail || this.loading.enrollId === this.detail.id || this.detail.is_enrolled;
    },
    detailEnrollBtnClass() {
      return (this.detail && this.detail.is_enrolled)
        ? 'bg-be-ink-50 border border-be-ink-100 text-be-ink-700'
        : 'bg-be-sky-600 text-white hover:bg-be-sky-700 shadow-soft';
    },
    detailPricingChipClass() {
      if (!this.detail) return '';
      if (this.detail.pricing_type === 'PAID') return 'bg-be-sun-50 border-be-sun-200 text-be-sun-800';
      if (this.detail.pricing_type === 'FREE') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      return 'bg-be-ink-50 border-be-ink-100 text-be-ink-700';
    },
    enrollDetail() { if (this.detail) this.enroll(this.detail); },

    /* ── store emit alias (used by filter selects inside this component) ── */
    emitSearch() { Alpine.store('explore').emit(true); },

    /* ── API helpers ────────────────────────────────────────────────────── */
    getCsrf() {
      const m = document.cookie.match(/csrftoken=([^;]+)/);
      return m ? m[1] : '';
    },

    async apiGet(url) {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      return await res.json();
    },

    async apiPost(url, payload) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCsrf(),
          Accept: 'application/json',
        },
        body: JSON.stringify(payload || {}),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch (_) {}
        throw new Error(`POST ${url} -> ${res.status} ${detail}`);
      }
      return await res.json();
    },

    /* ── formatting helpers ─────────────────────────────────────────────── */
    fmtMoney(v) { return Number(v || 0).toLocaleString('fr-FR'); },
    moneyCur(cur) {
      if (!cur) return 'XOF';
      return cur === 'XOF' ? 'FCFA' : cur;
    },
    formatDateShort(dt) {
      if (!dt) return '—';
      try {
        return new Date(dt).toLocaleDateString('fr-FR', {
          year: 'numeric', month: 'short', day: '2-digit',
        });
      } catch (_) { return String(dt); }
    },

    pricingChip(c) {
      const p = c.pricing_type;
      if (p === 'FREE' || Number(c.price || 0) === 0) return 'Gratuit';
      if (p === 'HYBRID') return 'Hybride';
      return 'Payant';
    },
    pricingLabel(c) {
      const p = c.pricing_type;
      if (p === 'FREE' || Number(c.price || 0) === 0) return 'Gratuit';
      if (p === 'HYBRID') return `Hybride • ${this.fmtMoney(c.price)} ${this.moneyCur(c.currency)}`;
      return `Payant • ${this.fmtMoney(c.price)} ${this.moneyCur(c.currency)}`;
    },

    /* ── data loaders ───────────────────────────────────────────────────── */
    async loadMe() {
      try {
        this.loading.me = true;
        const data = await this.apiGet(this.endpoints.me);
        const initials = (data.full_name || data.email || 'A')
          .split(' ').filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
        this.me = { ...data, initials };
        window.__beLearnerMe = this.me;
      } catch (e) {
        console.error(e);
      } finally {
        this.loading.me = false;
      }
    },

    buildExploreUrl(resetOffset = false) {
      const store = Alpine.store('explore');
      const f = store.filters || { q: '', type: '', pricing: '', sort: 'recent' };
      const u = new URL(this.endpoints.explore, window.location.origin);
      if (f.q)       u.searchParams.set('q',       f.q);
      if (f.type)    u.searchParams.set('type',    f.type);
      if (f.pricing) u.searchParams.set('pricing', f.pricing);
      if (f.sort)    u.searchParams.set('sort',    f.sort);
      u.searchParams.set('limit',  String(this.meta.limit || 24));
      u.searchParams.set('offset', String(resetOffset ? 0 : (this.meta.offset || 0)));
      return u.toString();
    },

    sortClient(list) {
      const store = Alpine.store('explore');
      const s = (store.filters && store.filters.sort) ? store.filters.sort : 'recent';
      const arr = [...(list || [])];
      if (s === 'popular') {
        return arr.sort((a, b) => {
          const ap = a.is_popular ? 1 : 0;
          const bp = b.is_popular ? 1 : 0;
          if (bp !== ap) return bp - ap;
          return Number(b.enrolled_count || 0) - Number(a.enrolled_count || 0);
        });
      }
      if (s === 'rating')     return arr.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
      if (s === 'price_asc')  return arr.sort((a, b) => Number(a.price || 0)  - Number(b.price || 0));
      if (s === 'price_desc') return arr.sort((a, b) => Number(b.price || 0)  - Number(a.price || 0));
      // recent (default)
      return arr.sort((a, b) => {
        const da = new Date(a.published_at || 0).getTime() || 0;
        const db = new Date(b.published_at || 0).getTime() || 0;
        return db - da;
      });
    },

    async loadExplore(resetOffset = false) {
      try {
        this.loading.explore = true;
        if (resetOffset) this.meta.offset = 0;
        const data = await this.apiGet(this.buildExploreUrl(resetOffset));
        const results = data.results || [];
        this.courses = this.sortClient(results);
        this.meta = {
          count:  (typeof data.total === 'number') ? data.total : (data.count  ?? this.courses.length),
          limit:  data.limit  ?? (this.meta.limit  || 24),
          offset: data.offset ?? (resetOffset ? 0 : (this.meta.offset || 0)),
        };
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de charger les cours publiés.');
      } finally {
        this.loading.explore = false;
      }
    },

    nextPage() {
      if ((this.meta.offset + this.meta.limit) >= this.meta.count) return;
      this.meta.offset = this.meta.offset + this.meta.limit;
      this.loadExplore(false);
    },
    prevPage() {
      if (this.meta.offset <= 0) return;
      this.meta.offset = Math.max(0, this.meta.offset - this.meta.limit);
      this.loadExplore(false);
    },

    async enroll(course) {
      if (!course || course.is_enrolled) return;
      try {
        this.loading.enrollId = course.id;
        await this.apiPost(this.endpoints.enroll(course.id), {});
        this.showToast('Succès', 'Inscription effectuée.');
        this.courses = this.courses.map(x => x.id === course.id ? { ...x, is_enrolled: true } : x);
        if (this.detail && this.detail.id === course.id) {
          this.detail = { ...this.detail, is_enrolled: true };
        }
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', "Impossible de s'inscrire à ce cours.");
      } finally {
        this.loading.enrollId = null;
      }
    },

    async openDetail(course) {
      this.modals.detail = true;
      this.detail = { ...course };
      this.loading.detail = true;
      try {
        const data = await this.apiGet(this.endpoints.courseDetail(course.id));
        this.detail = { ...this.detail, ...data };
      } catch (e) {
        console.error(e);
      } finally {
        this.loading.detail = false;
      }
    },
    closeDetail() {
      this.modals.detail = false;
      this.detail = null;
    },

  })); // end Alpine.data('exploreApp')

}); // end alpine:init
