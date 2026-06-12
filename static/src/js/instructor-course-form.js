/**
 * instructor-course-form.js — Création et modification de cours (Alpine CSP build)
 *
 * Config passée via data-* attrs :
 *
 * courseCreatePage :
 *   data-url-create="{% url 'api_instructor_course_create' %}"
 *
 * courseUpdatePage :
 *   data-course-id="{{ course.id }}"
 *   data-url-update="{% url 'api_instructor_course_update' course.id %}"
 *   data-url-publish="/api/instructor/courses/{{ course.id }}/publish/"
 *   data-url-archive="/api/instructor/courses/{{ course.id }}/archive/"
 */

document.addEventListener('alpine:init', () => {

  /* ============================================================
     courseCreatePage
     ============================================================ */
  Alpine.data('courseCreatePage', () => ({

    endpoints: {},

    loading: { save: false },

    toast: { show: false, title: '', message: '', type: 'success' },

    form: {
      title: '',
      subtitle: '',
      description: '',
      course_type: 'PROFESSIONNELLE',
      pricing_type: 'PAID',
      price: 0,
      preview_video_url: '',
      thumbnailFile: null,
    },

    thumbPreview: '',

    /* ---- init ---- */
    init() {
      this.endpoints = {
        create: this.$el.dataset.urlCreate || '',
      };
    },

    /* ---- CSP helpers ---- */
    pageTitle() {
      return this.form.title || 'Créer un nouveau programme';
    },
    fieldClass(val) {
      return val ? 'text-emerald-600' : 'text-rose-600';
    },
    fieldOk(val) {
      return val ? 'OK' : 'Manquant';
    },
    priceClass() {
      return this.isPriceValid() ? 'text-emerald-600' : 'text-rose-600';
    },
    priceOk() {
      return this.isPriceValid() ? 'OK' : 'À corriger';
    },
    toastClass() {
      return this.toast.type === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800';
    },
    closeToast() { this.toast.show = false; },
    isFree() { return this.form.pricing_type === 'FREE'; },
    noThumbPreview() { return !this.thumbPreview; },
    notSaving() { return !this.loading.save; },

    /* ---- methods ---- */
    getCsrf() {
      const match = document.cookie.match(/csrftoken=([^;]+)/);
      return match ? match[1] : '';
    },

    showToast(title, message, type = 'success') {
      this.toast = { show: true, title, message, type };
      setTimeout(() => { this.toast.show = false; }, 4000);
    },

    pricingLabel(type, price, currency = 'XOF') {
      if (type === 'FREE') return 'Gratuit';
      if (type === 'HYBRID') return 'Hybride';
      return 'Payant • ' + this.money(price) + ' ' + currency;
    },

    pricingPill(type) {
      if (type === 'PAID') return 'bg-be-sun-50 dark:bg-be-sun-900/30 border-be-sun-200 dark:border-be-sun-800 text-be-sun-800 dark:text-be-sun-300';
      if (type === 'HYBRID') return 'bg-be-sky-50 dark:bg-be-sky-900/40 border-be-sky-200 dark:border-be-sky-800 text-be-sky-700 dark:text-be-sky-300';
      return 'bg-be-ink-50 dark:bg-white/5 border-be-ink-200 dark:border-white/10 text-be-ink-700 dark:text-white/80';
    },

    courseTypeLabel(type) {
      const labels = {
        PROFESSIONNELLE: 'Professionnelle',
        CERTIFIANTE: 'Certifiante',
        ACADEMIQUE: 'Académique',
        INTERNE: 'Interne',
      };
      return labels[type] || type || '—';
    },

    money(value) {
      return Number(value || 0).toLocaleString('fr-FR');
    },

    onPricingChange() {
      if (this.form.pricing_type === 'FREE') this.form.price = 0;
    },

    isPriceValid() {
      if (this.form.pricing_type === 'FREE') return true;
      return Number(this.form.price || 0) > 0;
    },

    handleThumbnail(event) {
      const files = event.target.files;
      const file = (files && files[0]) ? files[0] : null;
      this.form.thumbnailFile = file;
      if (file) this.thumbPreview = URL.createObjectURL(file);
    },

    resetForm() {
      this.form = {
        title: '',
        subtitle: '',
        description: '',
        course_type: 'PROFESSIONNELLE',
        pricing_type: 'PAID',
        price: 0,
        preview_video_url: '',
        thumbnailFile: null,
      };
      this.thumbPreview = '';
    },

    validate() {
      if (!this.form.title || !this.form.title.trim()) {
        this.showToast('Validation', 'Le titre du cours est obligatoire.', 'error');
        return false;
      }
      if (!this.form.description || !this.form.description.trim()) {
        this.showToast('Validation', 'La description du cours est obligatoire.', 'error');
        return false;
      }
      if (!this.isPriceValid()) {
        this.showToast('Validation', 'Le prix doit être supérieur à 0 pour un cours payant ou hybride.', 'error');
        return false;
      }
      return true;
    },

    async submit() {
      if (!this.validate()) return;
      try {
        this.loading.save = true;
        const fd = new FormData();
        fd.append('title', this.form.title || '');
        fd.append('subtitle', this.form.subtitle || '');
        fd.append('description', this.form.description || '');
        fd.append('course_type', this.form.course_type || 'PROFESSIONNELLE');
        fd.append('pricing_type', this.form.pricing_type || 'PAID');
        fd.append('price', this.form.pricing_type === 'FREE' ? '0' : String(this.form.price || 0));
        fd.append('preview_video_url', this.form.preview_video_url || '');
        if (this.form.thumbnailFile) fd.append('thumbnail', this.form.thumbnailFile);

        const res = await fetch(this.endpoints.create, {
          method: 'POST',
          headers: { 'X-CSRFToken': this.getCsrf(), Accept: 'application/json' },
          body: fd,
          credentials: 'same-origin',
        });

        if (!res.ok) {
          let detail = '';
          try { detail = JSON.stringify(await res.json()); } catch { detail = 'HTTP ' + res.status; }
          throw new Error(detail);
        }

        const data = await res.json();
        this.showToast('Succès', 'Le cours a été créé avec succès.');

        const courseId = data.id || data.pk;
        if (courseId) { window.location.href = '/dashboard/instructor/courses/'; return; }

        this.resetForm();
      } catch (error) {
        console.error(error);
        this.showToast('Erreur', 'Impossible de créer le cours.', 'error');
      } finally {
        this.loading.save = false;
      }
    },
  }));


  /* ============================================================
     courseUpdatePage
     ============================================================ */
  Alpine.data('courseUpdatePage', () => ({

    courseId: null,
    endpoints: {},

    loading: { save: false, publish: false, archive: false },

    toast: { show: false, title: '', message: '', type: 'success' },

    initial: {},
    form: {
      title: '',
      subtitle: '',
      description: '',
      course_type: 'PROFESSIONNELLE',
      pricing_type: 'PAID',
      price: 0,
      preview_video_url: '',
      thumbnailFile: null,
      status: 'DRAFT',
    },

    thumbPreview: '',

    /* ---- init ---- */
    init() {
      const ds = this.$el.dataset;
      this.courseId = ds.courseId ? Number(ds.courseId) : null;
      this.endpoints = {
        update:  ds.urlUpdate  || '',
        publish: ds.urlPublish || '',
        archive: ds.urlArchive || '',
      };

      const node = document.getElementById('initial-course-payload');
      const payload = {
        title:             (node && node.dataset.title)           || '',
        subtitle:          (node && node.dataset.subtitle)        || '',
        description:       (node && node.dataset.description)     || '',
        course_type:       (node && node.dataset.courseType)      || 'PROFESSIONNELLE',
        pricing_type:      (node && node.dataset.pricingType)     || 'PAID',
        price:             (node && node.dataset.price)           || 0,
        preview_video_url: (node && node.dataset.previewVideoUrl) || '',
        thumbnail_url:     (node && node.dataset.thumbnailUrl)    || '',
        status:            (node && node.dataset.status)          || 'DRAFT',
      };

      this.initial = { ...payload };
      this.form = {
        title: payload.title,
        subtitle: payload.subtitle,
        description: payload.description,
        course_type: payload.course_type,
        pricing_type: payload.pricing_type,
        price: payload.price,
        preview_video_url: payload.preview_video_url,
        thumbnailFile: null,
        status: payload.status,
      };
      this.thumbPreview = payload.thumbnail_url || '';
      this.onPricingChange();
    },

    /* ---- CSP helpers ---- */
    pageTitle() {
      return this.form.title || 'Cours sans titre';
    },
    priceDisplay() {
      return this.money(this.form.price) + ' XOF';
    },
    fieldClass(val) {
      return val ? 'text-emerald-600' : 'text-rose-600';
    },
    fieldOk(val) {
      return val ? 'OK' : 'Manquant';
    },
    priceClass() {
      return this.isPriceValid() ? 'text-emerald-600' : 'text-rose-600';
    },
    priceOk() {
      return this.isPriceValid() ? 'OK' : 'À corriger';
    },
    previewVideoClass() {
      return this.form.preview_video_url ? 'text-emerald-600' : 'text-be-ink-400 dark:text-white/40';
    },
    previewVideoOk() {
      return this.form.preview_video_url ? 'Ajoutée' : 'Optionnelle';
    },
    toastClass() {
      return this.toast.type === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800';
    },
    closeToast()    { this.toast.show = false; },
    isFree()        { return this.form.pricing_type === 'FREE'; },
    noThumbPreview(){ return !this.thumbPreview; },
    notSaving()     { return !this.loading.save; },
    notPublishing() { return !this.loading.publish; },
    notArchiving()  { return !this.loading.archive; },

    /* ---- methods ---- */
    getCsrf() {
      const match = document.cookie.match(/csrftoken=([^;]+)/);
      return match ? match[1] : '';
    },

    showToast(title, message, type = 'success') {
      this.toast = { show: true, title, message, type };
      setTimeout(() => { this.toast.show = false; }, 4000);
    },

    statusLabel(status) {
      const labels = { DRAFT: 'Brouillon', REVIEW: 'En validation', PUBLISHED: 'Publié', ARCHIVED: 'Archivé' };
      return labels[status] || status || '—';
    },

    statusPill(status) {
      if (status === 'PUBLISHED') return 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
      if (status === 'REVIEW')    return 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';
      if (status === 'ARCHIVED')  return 'bg-be-ink-50 dark:bg-white/5 border-be-ink-200 dark:border-white/10 text-be-ink-700 dark:text-white/80';
      return 'bg-be-sky-50 dark:bg-be-sky-900/40 border-be-sky-200 dark:border-be-sky-800 text-be-sky-700 dark:text-be-sky-300';
    },

    pricingLabel(type, price, currency = 'XOF') {
      if (type === 'FREE') return 'Gratuit';
      if (type === 'HYBRID') return 'Hybride';
      return 'Payant • ' + this.money(price) + ' ' + currency;
    },

    pricingPill(type) {
      if (type === 'PAID') return 'bg-be-sun-50 dark:bg-be-sun-900/30 border-be-sun-200 dark:border-be-sun-800 text-be-sun-800 dark:text-be-sun-300';
      if (type === 'HYBRID') return 'bg-be-sky-50 dark:bg-be-sky-900/40 border-be-sky-200 dark:border-be-sky-800 text-be-sky-700 dark:text-be-sky-300';
      return 'bg-be-ink-50 dark:bg-white/5 border-be-ink-200 dark:border-white/10 text-be-ink-700 dark:text-white/80';
    },

    courseTypeLabel(type) {
      const labels = {
        PROFESSIONNELLE: 'Professionnelle',
        CERTIFIANTE: 'Certifiante',
        ACADEMIQUE: 'Académique',
        INTERNE: 'Interne',
      };
      return labels[type] || type || '—';
    },

    money(value) {
      return Number(value || 0).toLocaleString('fr-FR');
    },

    onPricingChange() {
      if (this.form.pricing_type === 'FREE') this.form.price = 0;
    },

    isPriceValid() {
      if (this.form.pricing_type === 'FREE') return true;
      return Number(this.form.price || 0) > 0;
    },

    handleThumbnail(event) {
      const files = event.target.files;
      const file = (files && files[0]) ? files[0] : null;
      this.form.thumbnailFile = file;
      if (file) this.thumbPreview = URL.createObjectURL(file);
    },

    resetForm() {
      this.form = {
        title:             this.initial.title             || '',
        subtitle:          this.initial.subtitle          || '',
        description:       this.initial.description       || '',
        course_type:       this.initial.course_type       || 'PROFESSIONNELLE',
        pricing_type:      this.initial.pricing_type      || 'PAID',
        price:             this.initial.price             || 0,
        preview_video_url: this.initial.preview_video_url || '',
        thumbnailFile: null,
        status:            this.initial.status            || 'DRAFT',
      };
      this.thumbPreview = this.initial.thumbnail_url || '';
    },

    validate() {
      if (!this.form.title || !this.form.title.trim()) {
        this.showToast('Validation', 'Le titre du cours est obligatoire.', 'error');
        return false;
      }
      if (!this.isPriceValid()) {
        this.showToast('Validation', 'Le prix doit être supérieur à 0 pour un cours payant ou hybride.', 'error');
        return false;
      }
      return true;
    },

    async submit() {
      if (!this.validate()) return;
      try {
        this.loading.save = true;
        const fd = new FormData();
        fd.append('title', this.form.title || '');
        fd.append('subtitle', this.form.subtitle || '');
        fd.append('description', this.form.description || '');
        fd.append('course_type', this.form.course_type || 'PROFESSIONNELLE');
        fd.append('pricing_type', this.form.pricing_type || 'PAID');
        fd.append('price', this.form.pricing_type === 'FREE' ? '0' : String(this.form.price || 0));
        fd.append('preview_video_url', this.form.preview_video_url || '');
        if (this.form.thumbnailFile) fd.append('thumbnail', this.form.thumbnailFile);

        const res = await fetch(this.endpoints.update, {
          method: 'POST',
          headers: { 'X-CSRFToken': this.getCsrf(), 'X-HTTP-Method-Override': 'PATCH', Accept: 'application/json' },
          body: fd,
          credentials: 'same-origin',
        });

        if (!res.ok) {
          let detail = '';
          try { detail = JSON.stringify(await res.json()); } catch { detail = 'HTTP ' + res.status; }
          throw new Error(detail);
        }

        const data = await res.json();
        this.form.status               = data.status              || this.form.status;
        this.initial.title             = data.title               || this.form.title;
        this.initial.subtitle          = data.subtitle            || this.form.subtitle;
        this.initial.description       = data.description         || this.form.description;
        this.initial.course_type       = data.course_type         || this.form.course_type;
        this.initial.pricing_type      = data.pricing_type        || this.form.pricing_type;
        this.initial.price             = data.price               || this.form.price;
        this.initial.preview_video_url = data.preview_video_url   || this.form.preview_video_url;
        this.initial.status            = data.status              || this.form.status;
        if (data.thumbnail_url) { this.initial.thumbnail_url = data.thumbnail_url; this.thumbPreview = data.thumbnail_url; }
        this.form.thumbnailFile = null;
        this.showToast('Succès', 'Le cours a été mis à jour avec succès.');
      } catch (error) {
        console.error(error);
        this.showToast('Erreur', 'Impossible de mettre à jour le cours.', 'error');
      } finally {
        this.loading.save = false;
      }
    },

    async publishCourse() {
      try {
        this.loading.publish = true;
        const res = await fetch(this.endpoints.publish, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.getCsrf(), Accept: 'application/json' },
          body: JSON.stringify({}),
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        this.form.status = data.status || 'PUBLISHED';
        this.initial.status = this.form.status;
        this.showToast('Publication', 'Le cours a été publié.');
      } catch (error) {
        console.error(error);
        this.showToast('Erreur', 'Publication impossible.', 'error');
      } finally {
        this.loading.publish = false;
      }
    },

    async archiveCourse() {
      try {
        this.loading.archive = true;
        const res = await fetch(this.endpoints.archive, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.getCsrf(), Accept: 'application/json' },
          body: JSON.stringify({}),
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        this.form.status = data.status || 'ARCHIVED';
        this.initial.status = this.form.status;
        this.showToast('Archivage', 'Le cours a été archivé.');
      } catch (error) {
        console.error(error);
        this.showToast('Erreur', 'Archivage impossible.', 'error');
      } finally {
        this.loading.archive = false;
      }
    },
  }));
});
