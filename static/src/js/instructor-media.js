/**
 * instructor-media.js — Bibliothèque médias instructeur (Alpine CSP build)
 * Component: instructorMediaPremiumPage — x-data="instructorMediaPremiumPage"
 *
 * URLs passed via data-* attributes on the root element:
 *   data-url-media-list, data-url-media-detail-tmpl, data-url-media-update-tmpl,
 *   data-url-media-delete-tmpl, data-url-multipart-init, data-url-multipart-part-url,
 *   data-url-multipart-complete, data-url-multipart-abort, data-url-multipart-list-parts,
 *   data-url-upload-init, data-url-upload-finalize, data-url-signed-get-tmpl,
 *   data-url-courses, data-url-media-detail-page-tmpl
 */

const _MEDIA_UUID_PH = '00000000-0000-0000-0000-000000000000';

document.addEventListener('alpine:init', () => {
  Alpine.data('instructorMediaPremiumPage', () => ({
    endpoints: {},

    media: [],
    filteredMedia: [],
    previewCache: {},
    thumbCache: {},
    thumbLoading: {},

    courses: [],
    bindSections: [],
    bindLessons: [],

    view: 'grid',
    dragover: false,

    filters: { q: '', kind: '', sort: 'recent' },

    stats: { total: 0, video: 0, audio: 0, doc: 0 },

    loading: { media: false, upload: false, courses: false, sections: false, lessons: false },

    pagination: { page: 1, pageSize: 10, count: 0, totalPages: 1 },

    drawers: { upload: false, detail: false },
    modals: { preview: false, edit: false, delete: false },

    previewItem: null,
    previewUrl: '',
    previewLoading: false,

    detailItem: null,
    detailLoading: false,

    editForm: { id: '', title: '', kind: 'video' },
    editSaving: false,

    deleteItem: null,
    deleteLoading: false,

    toast: { show: false, title: '', message: '', type: 'success' },

    upload: {
      file: null, kind: 'video', title: '', progress: 0, error: '',
      upload_id: null, object_key: null, bindEnabled: false,
      course_id: '', section_id: '', lesson_id: '',
      startedAt: null, etaText: '', uploadedBytes: 0, speedText: '',
    },

    init() {
      const ds = this.$el.dataset;
      const mediaDetailTmpl     = ds.urlMediaDetailTmpl     || '';
      const mediaUpdateTmpl     = ds.urlMediaUpdateTmpl     || '';
      const mediaDeleteTmpl     = ds.urlMediaDeleteTmpl     || '';
      const signedGetTmpl       = ds.urlSignedGetTmpl       || '';
      const mediaDetailPageTmpl = ds.urlMediaDetailPageTmpl || '';

      this.endpoints = {
        mediaList:          ds.urlMediaList          || '',
        mediaDetail:        (id) => mediaDetailTmpl.replace(_MEDIA_UUID_PH, id),
        mediaUpdate:        (id) => mediaUpdateTmpl.replace(_MEDIA_UUID_PH, id),
        mediaDelete:        (id) => mediaDeleteTmpl.replace(_MEDIA_UUID_PH, id),
        multipartInit:      ds.urlMultipartInit      || '',
        multipartPartUrl:   ds.urlMultipartPartUrl   || '',
        multipartComplete:  ds.urlMultipartComplete  || '',
        multipartAbort:     ds.urlMultipartAbort     || '',
        multipartListParts: ds.urlMultipartListParts || '',
        uploadInit:         ds.urlUploadInit         || '',
        uploadFinalize:     ds.urlUploadFinalize     || '',
        signedGet:          (id) => signedGetTmpl.replace(_MEDIA_UUID_PH, id),
        courses:            ds.urlCourses            || '',
        courseSections:     (courseId) => '/api/instructor/courses/' + courseId + '/sections/',
        sectionLessons:     (courseId, sectionId) => '/api/instructor/courses/' + courseId + '/sections/' + sectionId + '/lessons/',
        mediaDetailPage:    (id) => mediaDetailPageTmpl.replace(_MEDIA_UUID_PH, id),
      };

      this.loadMedia();
      this.loadCourses();
    },

    getCsrf() {
      const match = document.cookie.match(/csrftoken=([^;]+)/);
      return match ? match[1] : '';
    },

    showToast(title, message, type = 'success') {
      this.toast = { show: true, title, message, type };
      setTimeout(() => { this.toast.show = false; }, 4000);
    },

    /* ============================================================
       CSP helpers — called from template attributes
       ============================================================ */

    closeToast() { this.toast.show = false; },

    toastClass() {
      return this.toast.type === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800';
    },

    /* View toggle */
    isGridView()  { return this.view === 'grid'; },
    isTableView() { return this.view === 'table'; },
    setGridView()  { this.view = 'grid'; },
    setTableView() { this.view = 'table'; },

    gridViewButtonClass() {
      return this.view === 'grid'
        ? 'bg-be-ink-900 text-white'
        : 'text-be-ink-600 dark:text-white/70 hover:bg-be-ink-50 dark:hover:bg-white/10';
    },
    tableViewButtonClass() {
      return this.view === 'table'
        ? 'bg-be-ink-900 text-white'
        : 'text-be-ink-600 dark:text-white/70 hover:bg-be-ink-50 dark:hover:bg-white/10';
    },

    /* Pagination */
    prevDisabled() { return this.pagination.page <= 1 || !!this.loading.media; },
    nextDisabled() { return this.pagination.page >= this.pagination.totalPages || !!this.loading.media; },
    prevPage() { if (!this.prevDisabled()) this.loadMedia(this.pagination.page - 1); },
    nextPage() { if (!this.nextDisabled()) this.loadMedia(this.pagination.page + 1); },

    /* Media grid */
    noMediaFound()         { return !this.loading.media && this.filteredMedia.length === 0; },
    hasPersonalMedia()     { return !this.loading.media && this.personalMedia().length > 0; },
    hasOrganizationMedia() { return !this.loading.media && this.organizationMedia().length > 0; },

    /* Card helpers */
    isVideoWithThumb(m) { return m.kind === 'video' && !!this.thumbCache[m.id]; },
    isVideoNoThumb(m)   { return m.kind === 'video' && !this.thumbCache[m.id]; },
    isAudio(m)          { return m.kind === 'audio'; },
    isDoc(m)            { return m.kind === 'doc'; },

    kindIconClass(m) {
      return m.kind === 'video' ? 'fa-video' : (m.kind === 'audio' ? 'fa-volume-high' : 'fa-file');
    },
    processingIconClass(m) {
      return m.processing_status === 'ready'
        ? 'fa-circle-check'
        : (m.processing_status === 'failed' ? 'fa-circle-xmark' : 'fa-clock');
    },
    mediaTitle(m)       { return m.title || 'Sans titre'; },
    mediaContentType(m) { return m.content_type || '—'; },
    ownerName(m)        { return m.owner_name || '—'; },
    tableTitleOrKey(m)  { return m.title || m.object_key; },

    /* Drag & drop */
    dragoverClass() {
      return this.dragover
        ? 'border-be-sky-300 bg-be-sky-50/80 dark:bg-white/10'
        : 'border-be-ink-200 bg-be-ink-50/60 dark:bg-white/5';
    },

    /* Upload */
    sectionOptionText(s) { return (s.order || '') + ' ' + s.title; },
    lessonOptionText(l)  { return (l.order || '') + ' ' + l.title; },
    sectionSelectDisabled() { return !this.upload.course_id; },
    lessonSelectDisabled()  { return !this.upload.section_id; },
    uploadInProgress()   { return this.upload.progress > 0; },
    uploadBarClass() {
      const pct = Math.max(0, Math.min(100, Math.round(this.upload.progress || 0)));
      return 'w-pct-' + pct;
    },
    uploadProgressText() { return (this.upload.progress || 0) + '%'; },
    speedTextDisplay() { return this.upload.speedText || 'Débit : —'; },
    etaTextDisplay()   { return this.upload.etaText || 'Temps restant : —'; },
    notUploading()     { return !this.loading.upload; },

    /* Preview modal */
    notPreviewLoading() { return !this.previewLoading && !!this.previewItem; },
    isVideoPreview()    { return !!(this.previewItem && this.previewItem.kind === 'video' && this.previewUrl); },
    isAudioPreview()    { return !!(this.previewItem && this.previewItem.kind === 'audio' && this.previewUrl); },
    isDocPreview()      { return !!(this.previewItem && this.previewItem.kind === 'doc' && this.previewUrl); },
    previewPoster()     { return (this.previewItem && this.thumbCache[this.previewItem.id]) ? this.thumbCache[this.previewItem.id] : ''; },
    previewTitle()      { return this.previewItem ? (this.previewItem.title || 'Prévisualisation') : ''; },
    previewObjectKey()  { return this.previewItem ? (this.previewItem.object_key || '') : ''; },
    previewAudioTitle() { return this.previewItem ? (this.previewItem.title || 'Audio') : ''; },
    previewContentType() { return this.previewItem ? (this.previewItem.content_type || '—') : ''; },
    previewItemSize()   { return this.previewItem ? this.humanBytes(this.previewItem.size) : ''; },
    previewItemFormat() { return this.previewItem ? (this.previewItem.content_type || '—') : ''; },

    /* Detail drawer */
    notDetailLoading() { return !this.detailLoading && !!this.detailItem; },
    detailTitle()      { return this.detailItem ? (this.detailItem.title || 'Sans titre') : ''; },

    /* Edit modal */
    notEditSaving() { return !this.editSaving; },

    /* Delete modal */
    deleteItemTitle() { return this.deleteItem ? (this.deleteItem.title || this.deleteItem.object_key || 'Média') : 'Média'; },
    deleteItemKey()   { return this.deleteItem ? (this.deleteItem.object_key || '') : ''; },
    notDeleteLoading() { return !this.deleteLoading; },

    /* ============================================================
       Business methods
       ============================================================ */

    kindLabel(kind) {
      const map = { video: 'Vidéo', audio: 'Audio', doc: 'Document' };
      return map[kind] || kind || '—';
    },

    kindPill(kind) {
      if (kind === 'video') return 'bg-be-sky-50 border-be-sky-200 text-be-sky-700';
      if (kind === 'audio') return 'bg-be-sun-50 border-be-sun-200 text-be-sun-800';
      return 'bg-be-ink-50 border-be-ink-200 text-be-ink-700';
    },

    personalMedia()     { return this.filteredMedia.filter(m => m.scope === 'personal'); },
    organizationMedia() { return this.filteredMedia.filter(m => m.scope === 'organization'); },

    scopeLabel(scope) { return scope === 'personal' ? 'Mes médias' : 'Média organisation'; },

    scopePill(scope) {
      if (scope === 'personal') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      return 'bg-violet-50 border-violet-200 text-violet-700';
    },

    updateUploadEta(uploadedBytes, totalBytes) {
      this.upload.uploadedBytes = uploadedBytes;
      const elapsedSeconds = Math.max(1, (Date.now() - this.upload.startedAt) / 1000);
      const speed = uploadedBytes / elapsedSeconds;
      if (!speed || speed <= 0) {
        this.upload.etaText = 'Temps restant : calcul…';
        this.upload.speedText = 'Débit : —';
        return;
      }
      const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
      const etaSeconds = Math.ceil(remainingBytes / speed);
      this.upload.speedText = 'Débit : ' + this.humanBytes(speed) + '/s';
      this.upload.etaText = 'Temps restant : ' + this.formatEta(etaSeconds);
    },

    formatEta(seconds) {
      const s = Math.max(0, Number(seconds || 0));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
      if (m > 0) return m + 'm ' + String(sec).padStart(2, '0') + 's';
      return sec + 's';
    },

    processingLabel(status) {
      const map = { pending: 'En attente', processing: 'Traitement', ready: 'Prêt', failed: 'Échec' };
      return map[status] || status || '—';
    },

    processingPill(status) {
      if (status === 'ready')      return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      if (status === 'processing') return 'bg-amber-50 border-amber-200 text-amber-700';
      if (status === 'failed')     return 'bg-rose-50 border-rose-200 text-rose-700';
      return 'bg-be-ink-50 border-be-ink-200 text-be-ink-700';
    },

    humanBytes(bytes) {
      const b = Number(bytes || 0);
      const u = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0, v = b;
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
      return v.toFixed(i ? 1 : 0) + ' ' + u[i];
    },

    formatDate(value) {
      if (!value) return '—';
      const d = new Date(value);
      if (isNaN(d.getTime())) return value;
      return d.toLocaleString('fr-FR');
    },

    formatDuration(seconds) {
      const s = Number(seconds || 0);
      if (!s) return '—';
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
      if (m > 0) return m + 'm ' + String(sec).padStart(2, '0') + 's';
      return sec + 's';
    },

    formatResolution(w, h) {
      if (!w || !h) return '—';
      return w + ' × ' + h;
    },

    formatBitrate(v) {
      const value = Number(v || 0);
      if (!value) return '—';
      if (value >= 1000000) return (value / 1000000).toFixed(1) + ' Mbps';
      if (value >= 1000)    return Math.round(value / 1000) + ' kbps';
      return value + ' bps';
    },

    async apiGet(url) {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error('GET ' + url + ' -> ' + res.status);
      return await res.json();
    },

    async apiPost(url, payload = {}) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.getCsrf(), 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch (e) {}
        throw new Error('POST ' + url + ' -> ' + res.status + ' ' + detail);
      }
      return await res.json();
    },

    async apiDelete(url) {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': this.getCsrf(), 'Accept': 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch (e) {}
        throw new Error('DELETE ' + url + ' -> ' + res.status + ' ' + detail);
      }
      return await res.json();
    },

    async loadMedia(page = null) {
      try {
        this.loading.media = true;
        if (page !== null) this.pagination.page = page;
        const u = new URL(this.endpoints.mediaList, window.location.origin);
        u.searchParams.set('page', this.pagination.page);
        u.searchParams.set('page_size', this.pagination.pageSize);
        if (this.filters.kind) u.searchParams.set('kind', this.filters.kind);
        if (this.filters.q)    u.searchParams.set('q', this.filters.q);
        if (this.filters.sort) u.searchParams.set('sort', this.filters.sort);
        const data = await this.apiGet(u.toString());
        this.media = data.results || [];
        this.filteredMedia = this.media;
        this.pagination.count      = data.count || 0;
        this.stats.total           = this.pagination.count;
        this.pagination.page       = data.page || 1;
        this.pagination.pageSize   = data.page_size || 24;
        this.pagination.totalPages = data.total_pages || 1;
        this.computeStats();
        this.preloadVideoThumbs();
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de charger les médias.', 'error');
      } finally {
        this.loading.media = false;
      }
    },

    async preloadVideoThumbs() {
      const videos = (this.media || []).filter(m => m.kind === 'video').slice(0, 12);
      for (const item of videos) {
        if (!this.thumbCache[item.id] && !this.thumbLoading[item.id]) {
          this.thumbLoading[item.id] = true;
          try {
            const resp = await this.apiGet(this.endpoints.signedGet(item.id));
            if (resp.url) {
              const thumb = await this.generateVideoThumbnail(resp.url);
              if (thumb) this.thumbCache[item.id] = thumb;
              this.previewCache[item.id] = resp.url;
            }
          } catch (e) {
            console.error('thumbnail preload failed', e);
          } finally {
            this.thumbLoading[item.id] = false;
          }
        }
      }
    },

    generateVideoThumbnail(videoUrl) {
      return new Promise((resolve) => {
        try {
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous';
          video.muted       = true;
          video.playsInline = true;
          video.preload     = 'metadata';
          video.src         = videoUrl;
          let done = false;
          const finish = (value = null) => { if (done) return; done = true; resolve(value); };
          video.addEventListener('loadeddata', () => {
            const seekTo = Math.min(1, Math.max(0.1, (video.duration || 1) * 0.1));
            try { video.currentTime = seekTo; } catch (e) { finish(null); }
          });
          video.addEventListener('seeked', () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width  = video.videoWidth  || 640;
              canvas.height = video.videoHeight || 360;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              finish(canvas.toDataURL('image/jpeg', 0.82));
            } catch (e) { finish(null); }
          });
          video.addEventListener('error', () => finish(null));
          setTimeout(() => finish(null), 12000);
        } catch (e) { resolve(null); }
      });
    },

    computeStats() {
      this.stats.total = this.pagination.count || this.media.length;
      this.stats.video = this.media.filter(m => m.kind === 'video').length;
      this.stats.audio = this.media.filter(m => m.kind === 'audio').length;
      this.stats.doc   = this.media.filter(m => m.kind === 'doc').length;
    },

    applyFilters() { this.pagination.page = 1; this.loadMedia(1); },

    async loadCourses() {
      try {
        this.loading.courses = true;
        const data = await this.apiGet(this.endpoints.courses);
        this.courses = Array.isArray(data) ? data : (data.results || []);
      } catch (e) { console.error(e); } finally { this.loading.courses = false; }
    },

    async onBindCourseChange() {
      this.upload.section_id = '';
      this.upload.lesson_id  = '';
      this.bindSections      = [];
      this.bindLessons       = [];
      if (!this.upload.course_id) return;
      try {
        this.loading.sections = true;
        this.bindSections = await this.apiGet(this.endpoints.courseSections(this.upload.course_id));
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de charger les sections.', 'error');
      } finally { this.loading.sections = false; }
    },

    async onBindSectionChange() {
      this.upload.lesson_id = '';
      this.bindLessons      = [];
      if (!this.upload.course_id || !this.upload.section_id) return;
      try {
        this.loading.lessons = true;
        this.bindLessons = await this.apiGet(this.endpoints.sectionLessons(this.upload.course_id, this.upload.section_id));
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de charger les leçons.', 'error');
      } finally { this.loading.lessons = false; }
    },

    async openMedia(m) {
      try {
        const resp = await this.apiGet(this.endpoints.signedGet(m.id));
        if (resp.url) window.open(resp.url, '_blank');
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', "Impossible d'ouvrir le média.", 'error');
      }
    },

    async previewMedia(m) {
      try {
        this.previewItem    = m;
        this.previewUrl     = '';
        this.previewLoading = true;
        this.modals.preview = true;
        if (this.previewCache[m.id]) {
          this.previewUrl = this.previewCache[m.id];
        } else {
          const resp = await this.apiGet(this.endpoints.signedGet(m.id));
          this.previewUrl = resp.url || '';
          if (this.previewUrl) this.previewCache[m.id] = this.previewUrl;
        }
        if (m.kind === 'video' && !this.thumbCache[m.id] && this.previewUrl) {
          const thumb = await this.generateVideoThumbnail(this.previewUrl);
          if (thumb) this.thumbCache[m.id] = thumb;
        }
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de prévisualiser le média.', 'error');
      } finally { this.previewLoading = false; }
    },

    closePreview() {
      this.modals.preview = false;
      this.previewItem    = null;
      this.previewUrl     = '';
      this.previewLoading = false;
    },

    async openDetailDrawer(m) {
      try {
        this.drawers.detail = true;
        this.detailItem     = null;
        this.detailLoading  = true;
        this.detailItem = await this.apiGet(this.endpoints.mediaDetail(m.id));
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de charger le détail du média.', 'error');
      } finally { this.detailLoading = false; }
    },

    closeDetailDrawer() { this.drawers.detail = false; this.detailItem = null; this.detailLoading = false; },

    openEditModal(m) {
      this.editForm = { id: m.id, title: m.title || '', kind: m.kind || 'video' };
      this.modals.edit = true;
    },

    closeEditModal() {
      this.modals.edit = false;
      this.editForm    = { id: '', title: '', kind: 'video' };
    },

    async saveEdit() {
      try {
        if (!this.editForm.id) return;
        this.editSaving = true;
        const updated = await this.apiPost(this.endpoints.mediaUpdate(this.editForm.id), { title: this.editForm.title, kind: this.editForm.kind });
        this.media = this.media.map(item => item.id === updated.id ? updated : item);
        this.applyFilters();
        if (this.detailItem && this.detailItem.id === updated.id) this.detailItem = updated;
        this.closeEditModal();
        this.showToast('Succès', 'Le média a été mis à jour.');
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de modifier le média.', 'error');
      } finally { this.editSaving = false; }
    },

    confirmDelete(m)  { this.deleteItem = m; this.modals.delete = true; },
    closeDeleteModal() { this.modals.delete = false; this.deleteItem = null; },

    async deleteMedia() {
      try {
        if (!this.deleteItem || !this.deleteItem.id) return;
        this.deleteLoading = true;
        await this.apiDelete(this.endpoints.mediaDelete(this.deleteItem.id));
        const deletedId = this.deleteItem.id;
        this.media         = this.media.filter(item => item.id !== deletedId);
        this.filteredMedia = this.filteredMedia.filter(item => item.id !== deletedId);
        delete this.previewCache[deletedId];
        delete this.thumbCache[deletedId];
        this.computeStats();
        this.closeDeleteModal();
        this.closeDetailDrawer();
        this.showToast('Succès', 'Le média a été supprimé.');
      } catch (e) {
        console.error(e);
        this.showToast('Erreur', 'Impossible de supprimer le média.', 'error');
      } finally { this.deleteLoading = false; }
    },

    openUploadDrawer() {
      this.upload = {
        file: null, kind: 'video', title: '', progress: 0, error: '',
        upload_id: null, object_key: null, bindEnabled: false,
        course_id: '', section_id: '', lesson_id: '',
        startedAt: null, etaText: '', uploadedBytes: 0, speedText: '',
      };
      this.bindSections = [];
      this.bindLessons  = [];
      this.drawers.upload = true;
    },

    closeUploadDrawer() { this.drawers.upload = false; },

    handleFilePicked(event) {
      const file = (event.target.files && event.target.files[0]) || null;
      if (!file) return;
      this.setPickedFile(file);
    },

    handleDrop(event) {
      this.dragover = false;
      const file = (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) || null;
      if (!file) return;
      this.setPickedFile(file);
    },

    setPickedFile(file) {
      this.upload.file = file;
      if      (file.type.startsWith('video/')) this.upload.kind = 'video';
      else if (file.type.startsWith('audio/')) this.upload.kind = 'audio';
      else                                      this.upload.kind = 'doc';
      if (!this.upload.title) this.upload.title = file.name.replace(/\.[^/.]+$/, '');
    },

    async startUpload() {
      try {
        this.upload.error = '';
        if (!this.upload.file) { this.upload.error = 'Choisissez un fichier.'; return; }
        if (this.upload.bindEnabled) {
          if (!this.upload.course_id || !this.upload.section_id || !this.upload.lesson_id) {
            this.upload.error = 'Sélectionnez le cours, la section et la leçon à lier.';
            return;
          }
        }
        this.loading.upload        = true;
        this.upload.progress       = 1;
        this.upload.startedAt      = Date.now();
        this.upload.etaText        = 'Calcul en cours…';
        this.upload.uploadedBytes  = 0;
        this.upload.speedText      = '';
        await this.multipartUploadFile();
        this.upload.progress  = 100;
        this.drawers.upload   = false;
        this.showToast('Succès', 'Le média a été importé avec succès.');
        await this.loadMedia();
      } catch (e) {
        console.error(e);
        this.upload.error = (e && e.message) || 'Upload échoué.';
        this.showToast('Erreur', this.upload.error, 'error');
      } finally { this.loading.upload = false; }
    },

    uploadStorageKey(file) {
      return 'bestepargne_multipart_' + file.name + '_' + file.size + '_' + file.lastModified;
    },

    saveUploadResumeState(file, state) {
      localStorage.setItem(this.uploadStorageKey(file), JSON.stringify({ ...state, saved_at: new Date().toISOString() }));
    },

    getUploadResumeState(file) {
      try {
        const raw = localStorage.getItem(this.uploadStorageKey(file));
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },

    clearUploadResumeState(file) {
      localStorage.removeItem(this.uploadStorageKey(file));
    },

    async multipartUploadFile() {
      const file = this.upload.file;
      let initResp = this.getUploadResumeState(file);
      if (!initResp || !initResp.upload_id || !initResp.object_key) {
        initResp = await this.apiPost(this.endpoints.multipartInit, {
          filename:     file.name,
          content_type: file.type || 'application/octet-stream',
          size:         file.size,
          kind:         this.upload.kind,
          title:        this.upload.title || '',
        });
        this.saveUploadResumeState(file, {
          upload_id:    initResp.upload_id,
          object_key:   initResp.object_key,
          part_size:    initResp.part_size,
          uploadedParts: [],
        });
      }
      this.upload.upload_id  = initResp.upload_id;
      this.upload.object_key = initResp.object_key;
      const partSize   = initResp.part_size || (25 * 1024 * 1024);
      const totalParts = Math.ceil(file.size / partSize);
      let remoteParts  = [];
      try {
        const listResp = await this.apiPost(this.endpoints.multipartListParts, { upload_id: initResp.upload_id, object_key: initResp.object_key });
        remoteParts = listResp.parts || [];
      } catch (e) { remoteParts = initResp.uploadedParts || []; }
      const uploadedMap = new Map();
      remoteParts.forEach(p => {
        uploadedMap.set(Number(p.PartNumber), { PartNumber: Number(p.PartNumber), ETag: String(p.ETag).replaceAll('"', '') });
      });
      const queue = [];
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        if (!uploadedMap.has(partNumber)) queue.push(partNumber);
      }
      const partProgressMap = new Map();
      remoteParts.forEach(p => { partProgressMap.set(Number(p.PartNumber), 1); });
      const concurrency = 4;
      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0) {
          const partNumber = queue.shift();
          const start = (partNumber - 1) * partSize;
          const end   = Math.min(start + partSize, file.size);
          const blob  = file.slice(start, end);
          const etag  = await this.uploadPartWithFreshUrlRetry(initResp.object_key, initResp.upload_id, blob, partNumber, totalParts, partProgressMap, 3);
          uploadedMap.set(partNumber, { PartNumber: partNumber, ETag: etag });
          const currentParts = Array.from(uploadedMap.values()).sort((a, b) => a.PartNumber - b.PartNumber);
          this.saveUploadResumeState(file, { upload_id: initResp.upload_id, object_key: initResp.object_key, part_size: partSize, uploadedParts: currentParts });
        }
      });
      await Promise.all(workers);
      const finalParts = Array.from(uploadedMap.values()).sort((a, b) => a.PartNumber - b.PartNumber);
      await this.apiPost(this.endpoints.multipartComplete, {
        upload_id:        initResp.upload_id,
        object_key:       initResp.object_key,
        kind:             this.upload.kind,
        title:            this.upload.title || '',
        content_type:     file.type || 'application/octet-stream',
        size:             file.size,
        duration_seconds: null,
        parts:            finalParts,
        bind: this.upload.bindEnabled ? {
          course_id:  Number(this.upload.course_id),
          section_id: Number(this.upload.section_id),
          lesson_id:  Number(this.upload.lesson_id),
        } : null,
      });
      this.clearUploadResumeState(file);
    },

    async uploadPartWithFreshUrlRetry(objectKey, uploadId, blob, partNumber, totalParts, partProgressMap, maxRetries = 3) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const partUrlResp = await this.apiPost(this.endpoints.multipartPartUrl, { object_key: objectKey, upload_id: uploadId, part_number: partNumber });
          return await this.uploadPart(partUrlResp.url, blob, partNumber, totalParts, partProgressMap);
        } catch (e) {
          lastError = e;
          console.warn('Retry part ' + partNumber + '/' + totalParts + ', tentative ' + attempt + '/' + maxRetries, e);
          partProgressMap.delete(partNumber);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
      throw lastError || new Error('Part ' + partNumber + '/' + totalParts + ' échouée après ' + maxRetries + ' tentatives.');
    },

    async uploadPart(url, blob, partNumber, totalParts, partProgressMap) {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.timeout = 0;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            partProgressMap.set(partNumber, e.loaded / e.total);
            let totalProgress = 0;
            for (const value of partProgressMap.values()) totalProgress += value;
            const progressPercent = Math.max(1, Math.min(99, Math.round((totalProgress / totalParts) * 100)));
            this.upload.progress = progressPercent;
            const estimatedUploadedBytes = Math.round((progressPercent / 100) * this.upload.file.size);
            this.updateUploadEta(estimatedUploadedBytes, this.upload.file.size);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const rawEtag = xhr.getResponseHeader('ETag');
            if (!rawEtag) { reject(new Error('ETag absent. Vérifie ExposeHeaders CORS côté MinIO.')); return; }
            partProgressMap.set(partNumber, 1);
            resolve(rawEtag.replaceAll('"', ''));
          } else {
            reject(new Error('Part ' + partNumber + '/' + totalParts + ' échouée HTTP ' + xhr.status));
          }
        };
        xhr.onerror = () => reject(new Error('Erreur réseau/CORS/proxy sur la partie ' + partNumber + '/' + totalParts + '.'));
        xhr.onabort = () => reject(new Error('Upload annulé sur la partie ' + partNumber + '/' + totalParts + '.'));
        xhr.send(blob);
      });
    },

    async putFile(uploadUrl, file, headers) {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.timeout = 0;
        Object.entries(headers || {}).forEach(([k, v]) => { xhr.setRequestHeader(k, v); });
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) this.upload.progress = Math.max(1, Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Upload MinIO échoué HTTP ' + xhr.status + ': ' + (xhr.responseText || 'Réponse vide')));
        };
        xhr.onerror   = () => reject(new Error("Erreur réseau/CORS/proxy pendant l'upload. Vérifiez CORS MinIO, Traefik et HTTPS."));
        xhr.ontimeout = () => reject(new Error('Timeout upload. Le proxy ou MinIO coupe la connexion.'));
        xhr.onabort   = () => reject(new Error('Upload annulé.'));
        xhr.send(file);
      });
    },
  }));
});
