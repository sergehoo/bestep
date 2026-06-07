/**
 * learner-course-player.js — REFONTE COMPLÈTE.
 *
 * Player vidéo apprenant en vanilla JS pur (no Alpine).
 *
 * Pourquoi vanilla ?
 *   Le composant Alpine précédent (~900 lignes) accumulait des problèmes
 *   avec @alpinejs/csp (timing d'enregistrement, x-html interdit,
 *   expressions sur <iframe> interdites, mots-clés JS comme identifiants
 *   interdits, etc.). Cette refonte élimine la dépendance Alpine sur la
 *   page player pour stabiliser la lecture des cours.
 *
 * Architecture :
 *   - Module IIFE, pas de globals exposés (sauf debug : window.beCoursePlayer).
 *   - Une seule classe CoursePlayer qui orchestre tout.
 *   - DOM API moderne : querySelector, classList, addEventListener.
 *   - fetch() pour toutes les API, AbortController pour annuler les requêtes
 *     orphelines lors d'un changement rapide de leçon.
 *   - Auto-save de la progression avec debounce 800ms.
 *
 * Endpoints consommés (lecture seule pour cette doc) :
 *   - GET  /api/learner/courses/<id>/outline/   → {course, sections[]}
 *   - GET  /api/learner/courses/<id>/continue/  → {lesson_id} (reprise)
 *   - GET  /api/learner/courses/<id>/lessons/<lid>/state/
 *           → {lesson, progress, nav: {prev_id, next_id}}
 *   - POST /api/learner/courses/<id>/lessons/<lid>/progress/
 *           → {percent, is_completed, last_position_seconds}
 *   - POST /api/learner/courses/<id>/set-current/
 *           → {lesson_id}
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Convertit youtu.be / youtube.com/watch / shorts / vimeo / dailymotion
   * vers l'URL embed officielle (autres URLs : passthrough).
   * Indispensable car YouTube refuse l'embed via youtu.be (X-Frame-Options).
   */
  function toEmbedUrl(u) {
    if (!u || typeof u !== 'string') return u;
    if (u.indexOf('youtube.com/embed/') !== -1) return u;
    if (u.indexOf('player.vimeo.com/video/') !== -1) return u;
    let m = u.match(/^https?:\/\/(?:www\.)?youtu\.be\/([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = u.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?[^#]*\bv=([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = u.match(/^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = u.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1];
    m = u.match(/^https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-z0-9]+)/i);
    if (m) return 'https://www.dailymotion.com/embed/video/' + m[1];
    return u;
  }

  function isDirectVideo(u) {
    if (!u) return false;
    const x = String(u).toLowerCase();
    return x.indexOf('.mp4') !== -1 ||
           x.indexOf('.webm') !== -1 ||
           x.indexOf('.mov') !== -1 ||
           x.indexOf('.m3u8') !== -1;
  }

  function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function fmtDuration(sec) {
    sec = Number(sec || 0);
    if (!sec || !isFinite(sec)) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Classe principale
  // ─────────────────────────────────────────────────────────────────────

  class CoursePlayer {
    constructor(cfg) {
      this.cfg = cfg;
      this.state = {
        course: null,
        sections: [],         // [{id, title, lessons:[{id, title, order, lesson_type, is_completed, ...}]}]
        currentLessonId: null,
        currentLesson: null,
        lessonProgress: { percent: 0, is_completed: false, last_position_seconds: 0 },
        nav: { prev_id: null, next_id: null },
        searchFilter: '',
        loading: { outline: false, lesson: false, saving: false },
      };
      this._lessonAbort = null;   // AbortController pour la requête en cours
      this._videoEl = null;        // référence au <video> ou <iframe> courant
      this._saveDebounced = debounce(() => this._saveProgress(false), 800);
      this._lastSaveAt = 0;
      this._toastTimer = null;
      this._cacheDom();
      this._bindEvents();
    }

    // Cache des nodes DOM (un seul querySelector chacun)
    _cacheDom() {
      this.$root           = document.getElementById('be-player-root');
      this.$sidebar        = document.getElementById('be-sidebar');
      this.$sidebarBackdrop = document.getElementById('be-sidebar-backdrop');
      this.$sidebarToggle  = document.getElementById('be-sidebar-toggle');
      this.$sidebarClose   = document.getElementById('be-sidebar-close');
      this.$outlineList    = document.getElementById('be-outline-list');
      this.$outlineSearch  = document.getElementById('be-outline-search');
      this.$courseTitle    = document.getElementById('be-course-title');
      this.$lessonTitle    = document.getElementById('be-lesson-title');
      this.$lessonLoader   = document.getElementById('be-lesson-loader');
      this.$lessonContainer = document.getElementById('be-lesson-container');
      this.$videoBlock     = document.getElementById('be-video-block');
      this.$videoHost      = document.getElementById('be-video-host');
      this.$fileBlock      = document.getElementById('be-file-block');
      this.$fileLink       = document.getElementById('be-file-link');
      this.$textBlock      = document.getElementById('be-text-block');
      this.$textContent    = document.getElementById('be-text-content');
      this.$textSentinel   = document.getElementById('be-text-sentinel');
      this.$otherBlock     = document.getElementById('be-other-block');
      this.$otherMessage   = document.getElementById('be-other-message');
      this.$lessonTypeText = document.getElementById('be-lesson-type-text');
      this.$lessonDuration = document.getElementById('be-lesson-duration');
      this.$lessonPercent  = document.getElementById('be-lesson-percent');
      this.$lessonBar      = document.getElementById('be-lesson-bar');
      this.$overallBar     = document.getElementById('be-overall-bar');
      this.$overallPercent = document.getElementById('be-overall-percent');
      this.$completedCount = document.getElementById('be-completed-count');
      this.$totalCount     = document.getElementById('be-total-count');
      this.$prevBtn        = document.getElementById('be-prev-btn');
      this.$nextBtn        = document.getElementById('be-next-btn');
      this.$completeBtn    = document.getElementById('be-complete-btn');
      this.$completeLabel  = document.getElementById('be-complete-btn-label');
      this.$savingIndicator = document.getElementById('be-saving-indicator');
      this.$toast          = document.getElementById('be-toast');
    }

    _bindEvents() {
      this.$sidebarToggle?.addEventListener('click', () => this._setSidebarOpen(true));
      this.$sidebarClose?.addEventListener('click', () => this._setSidebarOpen(false));
      this.$sidebarBackdrop?.addEventListener('click', () => this._setSidebarOpen(false));
      this.$outlineSearch?.addEventListener('input', (e) => {
        this.state.searchFilter = String(e.target.value || '').toLowerCase().trim();
        this._renderOutline();
      });
      this.$prevBtn?.addEventListener('click', () => this._goPrev());
      this.$nextBtn?.addEventListener('click', () => this._goNext());
      this.$completeBtn?.addEventListener('click', () => this._toggleComplete());

      // Scroll dans le contenu texte → marque complete à la fin
      this.$textSentinel && new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && !this.state.lessonProgress.is_completed) {
          this._setLessonPercent(99);
          this._saveDebounced();
        }
      }, { threshold: 0.6 }).observe(this.$textSentinel);
    }

    // ─── Init ─────────────────────────────────────────────────────────
    async init() {
      try {
        await this._loadOutline();
        const continueLessonId = await this._resolveContinueLesson();
        if (continueLessonId) {
          await this._loadLesson(continueLessonId);
        } else {
          this._showEmpty();
        }
      } catch (err) {
        console.error('CoursePlayer.init error:', err);
        this._toast('Erreur de chargement du cours', 'error');
        this._showEmpty();
      }
    }

    // ─── Fetchers ─────────────────────────────────────────────────────
    async _fetchJson(url, opts = {}) {
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: Object.assign(
          { 'Accept': 'application/json' },
          opts.method && opts.method !== 'GET'
            ? { 'X-CSRFToken': getCsrf(), 'Content-Type': 'application/json' }
            : {}
        ),
        ...opts,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      return res.json();
    }

    async _loadOutline() {
      this.state.loading.outline = true;
      try {
        const data = await this._fetchJson(this.cfg.outline);
        this.state.course = data.course || data || { title: '' };
        this.state.sections = Array.isArray(data.sections) ? data.sections : [];
        if (this.$courseTitle) {
          this.$courseTitle.textContent = (this.state.course.title || 'Cours');
        }
        this._renderOutline();
        this._renderOverallProgress();
      } finally {
        this.state.loading.outline = false;
      }
    }

    async _resolveContinueLesson() {
      // 1. URL hash explicite : #lesson=<id>
      const m = window.location.hash.match(/lesson=(\d+)/);
      if (m) return Number(m[1]);
      // 2. API continue
      try {
        const data = await this._fetchJson(this.cfg.continue);
        return data?.lesson_id || data?.id || null;
      } catch (e) {
        // 3. Fallback : première leçon disponible
        for (const sec of this.state.sections) {
          for (const lsn of (sec.lessons || [])) {
            if (lsn.id) return lsn.id;
          }
        }
        return null;
      }
    }

    async _loadLesson(lessonId) {
      if (!lessonId) return;
      // Cancel précédente requête si l'utilisateur clique vite.
      if (this._lessonAbort) this._lessonAbort.abort();
      this._lessonAbort = new AbortController();

      this.state.currentLessonId = lessonId;
      this.state.loading.lesson = true;
      this._showLoader(true);
      // Met à jour l'URL hash pour permettre les deep-links.
      try { history.replaceState(null, '', `#lesson=${lessonId}`); } catch (_) {}

      try {
        const data = await this._fetchJson(
          this.cfg.lessonStateBase + lessonId + '/state/',
          { signal: this._lessonAbort.signal }
        );
        this.state.currentLesson = data.lesson || data;
        this.state.lessonProgress = Object.assign(
          { percent: 0, is_completed: false, last_position_seconds: 0 },
          data.progress || {}
        );
        this.state.nav = data.nav || { prev_id: null, next_id: null };

        this._renderLesson();
        this._renderOutline();           // re-render pour highlight la leçon active
        this._renderNavigation();
        this._renderLessonProgress();

        // Notifie le serveur que c'est la leçon courante (best-effort).
        this._setCurrentLesson(lessonId);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('loadLesson error:', err);
        this._toast('Impossible de charger la leçon', 'error');
      } finally {
        this.state.loading.lesson = false;
        this._showLoader(false);
      }
    }

    async _setCurrentLesson(lessonId) {
      try {
        await fetch(this.cfg.setCurrent, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRFToken': getCsrf(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ lesson_id: lessonId }),
        });
      } catch (_) { /* best effort */ }
    }

    async _saveProgress(forceComplete) {
      const lid = this.state.currentLessonId;
      if (!lid) return;
      this.state.loading.saving = true;
      this._setSavingIndicator(true);
      try {
        const body = {
          percent: this.state.lessonProgress.percent,
          last_position_seconds: this.state.lessonProgress.last_position_seconds,
        };
        if (forceComplete) body.is_completed = true;
        const data = await this._fetchJson(
          this.cfg.lessonProgressBase + lid + '/progress/',
          { method: 'POST', body: JSON.stringify(body) }
        );
        this.state.lessonProgress = Object.assign(this.state.lessonProgress, data || {});
        // Met à jour le state de l'outline (is_completed sur la leçon).
        for (const sec of this.state.sections) {
          for (const lsn of (sec.lessons || [])) {
            if (lsn.id === lid) {
              lsn.is_completed = !!data?.is_completed || forceComplete;
              lsn.percent = data?.percent ?? this.state.lessonProgress.percent;
            }
          }
        }
        this._renderOutline();
        this._renderOverallProgress();
        this._renderLessonProgress();
        if (forceComplete) {
          this._toast('Leçon marquée terminée', 'success');
          this._renderCompleteButton();
        }
        this._lastSaveAt = Date.now();
      } catch (err) {
        console.error('saveProgress error:', err);
        this._toast('Sauvegarde impossible', 'error');
      } finally {
        this.state.loading.saving = false;
        this._setSavingIndicator(false);
      }
    }

    // ─── Renderers ────────────────────────────────────────────────────
    _renderOutline() {
      if (!this.$outlineList) return;
      const q = this.state.searchFilter;
      const html = [];
      for (const sec of this.state.sections) {
        const lessons = (sec.lessons || []).filter((l) =>
          !q || (l.title || '').toLowerCase().indexOf(q) !== -1
        );
        if (q && lessons.length === 0) continue;
        html.push(`
          <details class="px-1 py-1" ${q || sec.lessons?.some(l => l.id === this.state.currentLessonId) ? 'open' : 'open'}>
            <summary class="px-3 py-2 cursor-pointer text-xs font-bold uppercase tracking-wide
                            text-be-ink-700 dark:text-white/70 select-none
                            hover:text-be-ink-900 dark:hover:text-white">
              ${escapeHtml(sec.title || 'Section')}
            </summary>
            <ul class="mt-1 space-y-0.5" role="list">
              ${lessons.map((l) => this._renderLessonRow(l)).join('')}
            </ul>
          </details>
        `);
      }
      if (!html.length) {
        html.push(`
          <div class="text-center text-sm text-be-ink-500 dark:text-white/60 py-8">
            <i class="fa-solid fa-folder-open text-2xl mb-2 opacity-50"></i>
            <p>${q ? 'Aucune leçon trouvée.' : 'Aucune leçon disponible.'}</p>
          </div>
        `);
      }
      this.$outlineList.innerHTML = html.join('');
      // Bind clicks on lesson rows (delegation).
      this.$outlineList.querySelectorAll('[data-lesson-id]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const id = Number(el.getAttribute('data-lesson-id'));
          if (id && id !== this.state.currentLessonId) {
            this._loadLesson(id);
            if (window.matchMedia('(max-width: 1023px)').matches) {
              this._setSidebarOpen(false);
            }
          }
        });
      });
    }

    _renderLessonRow(l) {
      const active = l.id === this.state.currentLessonId;
      const completed = !!l.is_completed;
      const icon = completed
        ? '<i class="fa-solid fa-circle-check text-emerald-500"></i>'
        : (active
            ? '<i class="fa-solid fa-circle-play text-be-sky-600"></i>'
            : '<i class="fa-regular fa-circle text-be-ink-400"></i>');
      const typeIcon = ({
        VIDEO: 'fa-play',
        TEXT:  'fa-align-left',
        QUIZ:  'fa-clipboard-question',
        FILE:  'fa-file-arrow-down',
        LIVE:  'fa-video',
      })[l.lesson_type] || 'fa-circle';
      const dur = fmtDuration(l.duration_sec);
      return `
        <li>
          <a href="#lesson=${l.id}"
             data-lesson-id="${l.id}"
             data-active="${active}"
             data-completed="${completed}"
             class="be-lesson-row flex items-center gap-2.5 px-3 py-2 rounded-lg
                    hover:bg-be-ink-50 dark:hover:bg-white/5
                    transition cursor-pointer">
            <span class="be-lesson-icon w-5 text-center text-sm" aria-hidden="true">${icon}</span>
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium truncate
                           ${active ? 'text-be-sky-700 dark:text-be-sky-300 font-semibold' : 'text-be-ink-800 dark:text-white/80'}">
                ${escapeHtml(l.title || 'Leçon')}
              </span>
              <span class="block text-[11px] text-be-ink-500 dark:text-white/50 mt-0.5
                           flex items-center gap-1.5">
                <i class="fa-solid ${typeIcon} text-[10px]" aria-hidden="true"></i>
                <span>${l.lesson_type || ''}</span>
                ${dur ? `<span class="opacity-50">•</span><span>${dur}</span>` : ''}
              </span>
            </span>
          </a>
        </li>
      `;
    }

    _renderLesson() {
      const l = this.state.currentLesson || {};
      if (this.$lessonTitle) this.$lessonTitle.textContent = l.title || '';
      if (this.$lessonTypeText) this.$lessonTypeText.textContent = ({
        VIDEO: 'Leçon vidéo',
        TEXT:  'Leçon texte',
        QUIZ:  'Quiz',
        FILE:  'Ressource',
        LIVE:  'Session live',
      })[l.lesson_type] || 'Leçon';
      if (this.$lessonDuration) {
        const d = fmtDuration(l.duration_sec);
        this.$lessonDuration.textContent = d ? `• ${d}` : '';
      }
      if (this.$lessonContainer) this.$lessonContainer.classList.remove('hidden');

      this._unmountAllBlocks();

      switch (l.lesson_type) {
        case 'VIDEO': this._mountVideo(l); break;
        case 'FILE':  this._mountFile(l);  break;
        case 'TEXT':  this._mountText(l);  break;
        default:      this._mountOther(l); break;
      }
      this._renderCompleteButton();
    }

    _unmountAllBlocks() {
      // Détache l'élément vidéo précédent pour stopper la lecture/ressources.
      if (this._videoEl) {
        try { this._videoEl.pause && this._videoEl.pause(); } catch (_) {}
        this._videoEl = null;
      }
      if (this.$videoHost) this.$videoHost.innerHTML = '';
      if (this.$videoBlock) this.$videoBlock.classList.add('hidden');
      if (this.$fileBlock) this.$fileBlock.classList.add('hidden');
      if (this.$textBlock) this.$textBlock.classList.add('hidden');
      if (this.$otherBlock) this.$otherBlock.classList.add('hidden');
    }

    _mountVideo(l) {
      if (!this.$videoBlock || !this.$videoHost) return;
      const url = toEmbedUrl(l.video_url || '');
      if (!url) {
        this._mountOther({ message: 'Vidéo non disponible pour cette leçon.' });
        return;
      }
      this.$videoBlock.classList.remove('hidden');
      if (isDirectVideo(url)) {
        // ===== MP4 / HLS direct =====
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.setAttribute('controlsList', 'nodownload noremoteplayback noplaybackrate');
        v.setAttribute('disablePictureInPicture', '');
        v.oncontextmenu = () => false;
        v.src = url;
        v.addEventListener('timeupdate', () => this._onVideoTime(v));
        v.addEventListener('ended', () => this._onVideoEnded(v));
        v.addEventListener('loadedmetadata', () => {
          const pos = Number(this.state.lessonProgress.last_position_seconds || 0);
          if (pos > 2 && isFinite(pos) && pos < (v.duration || Infinity)) {
            try { v.currentTime = pos; } catch (_) {}
          }
        });
        this._videoEl = v;
        this.$videoHost.appendChild(v);
      } else {
        // ===== iframe YouTube / Vimeo / Dailymotion =====
        const f = document.createElement('iframe');
        f.loading = 'lazy';
        f.allowFullscreen = true;
        f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        // allow-same-origin RETIRÉ → sandbox effectif (sinon warning navigateur).
        f.setAttribute('sandbox',
          'allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox');
        f.src = url;
        this._videoEl = f;
        this.$videoHost.appendChild(f);
      }
    }

    _mountFile(l) {
      if (!this.$fileBlock || !this.$fileLink) return;
      this.$fileBlock.classList.remove('hidden');
      this.$fileLink.href = l.file_url || l.file || '#';
      this.$fileLink.addEventListener('click', () => {
        if (this.state.lessonProgress.percent < 30) {
          this._setLessonPercent(30);
          this._saveDebounced();
        }
      }, { once: true });
    }

    _mountText(l) {
      if (!this.$textBlock || !this.$textContent) return;
      this.$textBlock.classList.remove('hidden');
      // Le HTML est déjà bleach-sanitized côté serveur (V1.D REV-02).
      this.$textContent.innerHTML = l.content || '<p>Contenu vide.</p>';
    }

    _mountOther(l) {
      if (!this.$otherBlock || !this.$otherMessage) return;
      this.$otherBlock.classList.remove('hidden');
      this.$otherMessage.textContent = l.message || ({
        QUIZ: 'Ouvre le quiz depuis le dashboard pour le réaliser.',
        LIVE: 'Session live programmée — rendez-vous à l\'heure indiquée.',
      })[this.state.currentLesson?.lesson_type] || 'Contenu non disponible.';
    }

    _onVideoTime(v) {
      if (!v || !isFinite(v.duration) || !v.duration) return;
      const current = Math.floor(v.currentTime || 0);
      const duration = Math.floor(v.duration || 0);
      const percent = duration ? Math.floor((current / duration) * 100) : 0;
      this.state.lessonProgress.last_position_seconds = current;
      const prev = Number(this.state.lessonProgress.percent || 0);
      this.state.lessonProgress.percent = Math.min(99, Math.max(prev, percent));
      this._renderLessonProgress();
      // Auto-save toutes les ~2.5s en moyenne grâce au debounce 800ms.
      this._saveDebounced();
    }

    _onVideoEnded() {
      this._setLessonPercent(100);
      this._saveProgress(true);
    }

    _setLessonPercent(p) {
      this.state.lessonProgress.percent = Math.max(
        Number(this.state.lessonProgress.percent || 0), p
      );
      this._renderLessonProgress();
    }

    _renderLessonProgress() {
      const p = Math.round(Number(this.state.lessonProgress.percent || 0));
      if (this.$lessonPercent) this.$lessonPercent.textContent = p;
      if (this.$lessonBar) this.$lessonBar.style.width = p + '%';
    }

    _renderOverallProgress() {
      let total = 0, done = 0;
      for (const sec of this.state.sections) {
        for (const l of (sec.lessons || [])) {
          total++;
          if (l.is_completed) done++;
        }
      }
      const pct = total ? Math.round((done / total) * 100) : 0;
      if (this.$completedCount) this.$completedCount.textContent = done;
      if (this.$totalCount) this.$totalCount.textContent = total;
      if (this.$overallPercent) this.$overallPercent.textContent = pct + ' %';
      if (this.$overallBar) this.$overallBar.style.width = pct + '%';
    }

    _renderNavigation() {
      const n = this.state.nav || {};
      if (this.$prevBtn) this.$prevBtn.disabled = !n.prev_id;
      if (this.$nextBtn) this.$nextBtn.disabled = !n.next_id;
    }

    _renderCompleteButton() {
      const done = !!this.state.lessonProgress.is_completed;
      if (this.$completeLabel) {
        this.$completeLabel.textContent = done ? 'Marquer non terminé' : 'Marquer terminé';
      }
      if (this.$completeBtn) {
        this.$completeBtn.classList.toggle('bg-emerald-600', !done);
        this.$completeBtn.classList.toggle('hover:bg-emerald-700', !done);
        this.$completeBtn.classList.toggle('bg-be-ink-500', done);
        this.$completeBtn.classList.toggle('hover:bg-be-ink-600', done);
      }
    }

    _setSavingIndicator(on) {
      if (!this.$savingIndicator) return;
      this.$savingIndicator.classList.toggle('hidden', !on);
    }

    _showLoader(on) {
      if (this.$lessonLoader) this.$lessonLoader.classList.toggle('hidden', !on);
      if (this.$lessonContainer) this.$lessonContainer.classList.toggle('hidden', on);
    }

    _showEmpty() {
      if (this.$lessonLoader) this.$lessonLoader.classList.add('hidden');
      if (this.$lessonContainer) this.$lessonContainer.classList.remove('hidden');
      this._unmountAllBlocks();
      this._mountOther({ message: 'Aucune leçon disponible pour ce cours pour le moment.' });
    }

    // ─── Navigation ────────────────────────────────────────────────────
    _goPrev() {
      const id = this.state.nav?.prev_id;
      if (id) this._loadLesson(id);
    }

    _goNext() {
      const id = this.state.nav?.next_id;
      if (id) this._loadLesson(id);
    }

    _toggleComplete() {
      const done = !!this.state.lessonProgress.is_completed;
      this.state.lessonProgress.is_completed = !done;
      if (!done) this.state.lessonProgress.percent = 100;
      this._saveProgress(!done);
    }

    // ─── Sidebar UI ────────────────────────────────────────────────────
    _setSidebarOpen(open) {
      if (this.$sidebar) this.$sidebar.setAttribute('data-open', open ? 'true' : 'false');
      if (this.$sidebarBackdrop)
        this.$sidebarBackdrop.setAttribute('data-open', open ? 'true' : 'false');
    }

    // ─── Toast ─────────────────────────────────────────────────────────
    _toast(msg, kind) {
      if (!this.$toast) return;
      this.$toast.textContent = msg;
      const palette = {
        success: 'bg-emerald-600',
        error:   'bg-rose-600',
        info:    'bg-be-sky-600',
      };
      // Reset classes de couleur
      this.$toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] ' +
        'px-4 py-2.5 rounded-xl shadow-lift text-sm font-semibold text-white ' +
        'opacity-100 transition-opacity duration-200 ' +
        (palette[kind] || 'bg-be-ink-900');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.$toast.style.opacity = '0';
      }, 2400);
      this.$toast.style.opacity = '1';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────────────────────────────
  function boot() {
    const cfgNode = document.getElementById('player-config');
    if (!cfgNode) {
      console.warn('[course-player] #player-config introuvable, abort.');
      return;
    }
    const ds = cfgNode.dataset;
    const cfg = {
      courseId:           Number(ds.courseId) || null,
      outline:            ds.outlineUrl,
      continue:           ds.continueUrl,
      lessonStateBase:    ds.lessonStateBase,
      lessonProgressBase: ds.lessonProgressBase,
      setCurrent:         ds.setCurrentUrl,
      backUrl:            ds.backUrl || '/',
    };
    const player = new CoursePlayer(cfg);
    window.beCoursePlayer = player; // debug uniquement
    player.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
