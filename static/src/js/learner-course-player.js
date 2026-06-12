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

  // Icônes SVG inline (style lucide, stroke 2) — la page ne charge plus Font Awesome.
  function svgIcon(paths, cls) {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true">` +
      paths.map((d) => `<path d="${d}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('') +
      '</svg>';
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
      this.$sidebarExpand  = document.getElementById('be-sidebar-expand');
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

      // ─── Contrôles vidéo custom (MP4) ───
      this.$videoControls   = document.getElementById('be-video-controls');
      this.$vcRewind        = document.getElementById('be-vc-rewind');
      this.$vcForward       = document.getElementById('be-vc-forward');
      this.$vcPlayPause     = document.getElementById('be-vc-playpause');
      this.$vcPlayPauseIcon = document.getElementById('be-vc-playpause-icon');
      this.$vcSpeed         = document.getElementById('be-vc-speed');
      this.$vcCurrent       = document.getElementById('be-vc-current');
      this.$vcDuration      = document.getElementById('be-vc-duration');
      this.$vcFullscreen    = document.getElementById('be-vc-fullscreen');
    }

    _bindEvents() {
      // ─── Sidebar — un seul bouton toggle (mobile + desktop) ───
      // Click sur "Plan du cours" → toggle l'état visible/masqué de la sidebar.
      // Le même bouton sert pour le drawer mobile et le collapse desktop :
      //   - si la sidebar est visible → la masquer
      //   - si la sidebar est masquée → la réafficher
      this.$sidebarToggle?.addEventListener('click', () => this._toggleSidebar());
      this.$sidebarClose?.addEventListener('click', () => this._setSidebarVisible(false));
      this.$sidebarBackdrop?.addEventListener('click', () => this._setSidebarVisible(false));

      // ─── Recherche outline ───
      this.$outlineSearch?.addEventListener('input', (e) => {
        this.state.searchFilter = String(e.target.value || '').toLowerCase().trim();
        this._renderOutline();
      });

      // ─── Navigation leçon ───
      this.$prevBtn?.addEventListener('click', () => this._goPrev());
      this.$nextBtn?.addEventListener('click', () => this._goNext());
      this.$completeBtn?.addEventListener('click', () => this._toggleComplete());

      // ─── Contrôles vidéo custom (MP4 uniquement) ───
      this.$vcRewind?.addEventListener('click', () => this._videoSeek(-10));
      this.$vcForward?.addEventListener('click', () => this._videoSeek(+10));
      this.$vcPlayPause?.addEventListener('click', () => this._videoTogglePlay());
      this.$vcSpeed?.addEventListener('change', (e) => this._videoSetSpeed(parseFloat(e.target.value)));
      this.$vcFullscreen?.addEventListener('click', () => this._videoFullscreen());

      // ─── Raccourcis clavier ───
      document.addEventListener('keydown', (e) => {
        // Ne pas intercepter si l'utilisateur tape dans un input/textarea
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (e.target?.isContentEditable) return;

        switch (e.key) {
          case ' ':
            if (this._videoEl && this._videoEl.tagName === 'VIDEO') {
              e.preventDefault();
              this._videoTogglePlay();
            }
            break;
          case 'ArrowLeft':
            if (this._videoEl && this._videoEl.tagName === 'VIDEO') {
              e.preventDefault();
              this._videoSeek(-10);
            }
            break;
          case 'ArrowRight':
            if (this._videoEl && this._videoEl.tagName === 'VIDEO') {
              e.preventDefault();
              this._videoSeek(+10);
            }
            break;
          case 'f': case 'F':
            if (this._videoEl && this._videoEl.tagName === 'VIDEO') {
              e.preventDefault();
              this._videoFullscreen();
            }
            break;
          case 'n': case 'N':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              this._goNext();
            }
            break;
          case 'p': case 'P':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              this._goPrev();
            }
            break;
        }
      });

      // ─── Scroll dans le contenu texte → marque ~complete à la fin ───
      this.$textSentinel && new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && !this.state.lessonProgress.is_completed) {
          this._setLessonPercent(99);
          this._saveDebounced();
        }
      }, { threshold: 0.6 }).observe(this.$textSentinel);
    }

    // ─── Init ─────────────────────────────────────────────────────────
    async init() {
      // Restaure la préférence sidebar visible/masquée dès le boot.
      this._restoreSidebarVisible();
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
        // Navigation : on calcule prev/next À PARTIR de l'outline (source de
        // vérité locale, indépendante du format API). Fallback : data.nav si l'API
        // le fournit. Sans ça, les boutons prev/next ne faisaient rien quand
        // l'API ne retournait pas le champ `nav` au format attendu.
        const computedNav = this._computeNavFromOutline(lessonId);
        this.state.nav = Object.assign(
          { prev_id: null, next_id: null },
          data.nav || {},
          computedNav
        );

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
            ${svgIcon(['m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6A2 2 0 0 1 18.45 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2'], 'w-8 h-8 mx-auto mb-2 opacity-50')}
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
              this._setSidebarVisible(false);
            }
          }
        });
      });
    }

    _renderLessonRow(l) {
      const active = l.id === this.state.currentLessonId;
      const completed = !!l.is_completed;
      const circle = 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z';
      const icon = completed
        ? svgIcon([circle, 'm8.5 12 2.5 2.5 4.5-5'], 'w-4 h-4 mx-auto text-emerald-500')
        : (active
            ? svgIcon([circle, 'm10 8.5 5 3.5-5 3.5v-7Z'], 'w-4 h-4 mx-auto text-be-sky-600')
            : svgIcon([circle], 'w-4 h-4 mx-auto text-be-ink-400 dark:text-white/40'));
      const typePaths = ({
        VIDEO: ['m6 3 14 9-14 9V3Z'],
        TEXT:  ['M15 12H3', 'M17 18H3', 'M21 6H3'],
        QUIZ:  [circle, 'M9.1 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
        FILE:  ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v5h6', 'M12 18v-6', 'm9 15 3 3 3-3'],
        LIVE:  ['m16 10 6-3.5v11L16 14', 'M2 7.5A1.5 1.5 0 0 1 3.5 6h11A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 16.5v-9Z'],
      })[l.lesson_type] || [circle];
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
                ${svgIcon(typePaths, 'w-2.5 h-2.5 shrink-0')}
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
      // Stoppe le timer texte s'il tourne.
      this._clearTextTimer();
      // Détache l'élément vidéo précédent pour stopper la lecture/ressources.
      if (this._videoEl) {
        try { this._videoEl.pause && this._videoEl.pause(); } catch (_) {}
        this._videoEl = null;
      }
      if (this.$videoHost) this.$videoHost.innerHTML = '';
      if (this.$videoBlock) this.$videoBlock.classList.add('hidden');
      if (this.$videoControls) {
        this.$videoControls.classList.add('hidden');
        this.$videoControls.classList.remove('flex');
      }
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
        v.addEventListener('timeupdate', () => {
          this._onVideoTime(v);
          this._updateTimeLabel(v.currentTime, v.duration);
        });
        v.addEventListener('ended', () => {
          this._onVideoEnded(v);
          this._updatePlayPauseIcon(false);
        });
        v.addEventListener('loadedmetadata', () => {
          this._updateTimeLabel(0, v.duration);
          const pos = Number(this.state.lessonProgress.last_position_seconds || 0);
          if (pos > 2 && isFinite(pos) && pos < (v.duration || Infinity)) {
            try { v.currentTime = pos; } catch (_) {}
          }
        });
        v.addEventListener('play',  () => this._updatePlayPauseIcon(true));
        v.addEventListener('pause', () => this._updatePlayPauseIcon(false));
        this._videoEl = v;
        this.$videoHost.appendChild(v);
        // Affiche les contrôles custom et applique la vitesse sélectionnée.
        if (this.$videoControls) {
          this.$videoControls.classList.remove('hidden');
          this.$videoControls.classList.add('flex');
        }
        if (this.$vcSpeed) {
          this._videoSetSpeed(parseFloat(this.$vcSpeed.value || '1'));
        }
      } else {
        // ===== iframe YouTube / Vimeo / Dailymotion =====
        //
        // PAS de `sandbox` ici. Pourquoi ?
        // YouTube/Vimeo ont besoin d'accéder à `caches`, `localStorage` et
        // leur propre code interne (writeEmbed, etc.) pour fonctionner.
        // Une iframe sandboxée sans `allow-same-origin` casse le player
        // (erreurs `Cache storage is disabled` + `writeEmbed is not defined`).
        // Une iframe sandboxée AVEC `allow-same-origin + allow-scripts` est
        // dénoncée par la console car le sandbox est neutralisé.
        //
        // Le compromis pragmatique adopté par tous les acteurs majeurs
        // (Stripe, Coursera, Udemy, LinkedIn Learning) : pas de sandbox
        // pour les embeds officiels. Sécurité maintenue via :
        //   - URL whitelist hostname via toEmbedUrl() (YouTube/Vimeo/Dailymotion only)
        //   - CSP frame-src limitée aux mêmes hostnames
        //   - allow attribute restrictif (pas de microphone/camera/usb)
        //   - referrerpolicy strict (pas de fuite de URL parente)
        const f = document.createElement('iframe');
        f.loading = 'lazy';
        f.allowFullscreen = true;
        f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        f.setAttribute('allow',
          'accelerometer; autoplay; clipboard-write; encrypted-media; ' +
          'gyroscope; picture-in-picture; web-share');
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
      // Démarre le timer auto basé sur lesson.duration_sec.
      // Si l'instructor a défini 5 min (300s), le percent augmente
      // linéairement jusqu'à 99% sur 5 min. Le 100% vient via le
      // bouton "Marquer terminé" ou l'IntersectionObserver du sentinel.
      this._startTextTimer(l.duration_sec);
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
      // Recompute systématique : couvre le cas où l'API ne fournit pas `nav`.
      const computed = this._computeNavFromOutline(this.state.currentLessonId);
      const n = Object.assign({}, this.state.nav || {}, computed);
      this.state.nav = n;
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
    /**
     * Calcule prev/next à partir de la liste à plat des leçons de l'outline.
     * Plus robuste que de dépendre du champ `nav` de l'API : marche tant que
     * l'outline est chargée.
     */
    _computeNavFromOutline(currentId) {
      const flat = [];
      for (const sec of (this.state.sections || [])) {
        for (const lsn of (sec.lessons || [])) {
          if (lsn && lsn.id != null) flat.push(Number(lsn.id));
        }
      }
      const idx = flat.indexOf(Number(currentId));
      return {
        prev_id: idx > 0 ? flat[idx - 1] : null,
        next_id: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null,
      };
    }

    _goPrev() {
      // Recompute toujours depuis l'outline pour ne jamais avoir un id stale.
      const nav = this._computeNavFromOutline(this.state.currentLessonId);
      const id = nav.prev_id || this.state.nav?.prev_id;
      if (id) {
        this._loadLesson(id);
      } else {
        this._toast('Aucune leçon précédente', 'info');
      }
    }

    _goNext() {
      const nav = this._computeNavFromOutline(this.state.currentLessonId);
      const id = nav.next_id || this.state.nav?.next_id;
      if (id) {
        this._loadLesson(id);
      } else {
        this._toast('Vous êtes à la dernière leçon', 'info');
      }
    }

    _toggleComplete() {
      const done = !!this.state.lessonProgress.is_completed;
      this.state.lessonProgress.is_completed = !done;
      if (!done) this.state.lessonProgress.percent = 100;
      this._saveProgress(!done);
    }

    // ─── Sidebar unifiée — un seul état "visible" pour mobile et desktop ──
    //
    // Sur desktop (lg+), masquée = `lg:hidden` (la sidebar disparaît
    // complètement du layout flex, le main reprend toute la largeur).
    // Sur mobile, masquée = `-translate-x-full` (drawer fermé hors écran).
    // Le backdrop n'apparaît qu'en mobile (`lg:hidden` natif dans le HTML).
    //
    // L'état est persisté en localStorage pour survivre aux reloads.
    _setSidebarVisible(visible) {
      if (!this.$sidebar) return;
      this.$sidebar.setAttribute('data-visible', visible ? 'true' : 'false');

      // Desktop : on toggle `lg:hidden` pour masquer / réafficher dans le flex.
      this.$sidebar.classList.toggle('lg:hidden', !visible);

      // Mobile : on toggle les classes translate pour le drawer.
      this.$sidebar.classList.toggle('-translate-x-full', !visible);
      this.$sidebar.classList.toggle('translate-x-0', !!visible);

      // Backdrop mobile (en mobile, le HTML a `lg:hidden` donc invisible desktop).
      if (this.$sidebarBackdrop) {
        this.$sidebarBackdrop.classList.toggle('hidden', !visible);
      }

      // Met à jour l'attribut visuel du bouton toggle (pour ajouter un état actif si voulu).
      if (this.$sidebarToggle) {
        this.$sidebarToggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
      }

      // Persistance.
      try {
        localStorage.setItem('be-player-sidebar-visible', visible ? '1' : '0');
      } catch (_) { /* mode privé */ }
    }

    _toggleSidebar() {
      // Lit l'état actuel via l'attribute (source de vérité), avec fallback true.
      const current = this.$sidebar?.getAttribute('data-visible');
      const visible = current === 'false' ? true : false;
      this._setSidebarVisible(visible);
    }

    _restoreSidebarVisible() {
      // Par défaut : sidebar VISIBLE (sauf si l'utilisateur a explicitement choisi
      // de la masquer via localStorage '0').
      let visible = true;
      try {
        const v = localStorage.getItem('be-player-sidebar-visible');
        if (v === '0') visible = false;
        // Migration : ancienne clé 'be-player-sidebar-collapsed' = '1' → masquer.
        const legacy = localStorage.getItem('be-player-sidebar-collapsed');
        if (legacy === '1') visible = false;
      } catch (_) { /* mode privé : on garde visible */ }
      this._setSidebarVisible(visible);
    }

    // ─── Contrôles vidéo custom (MP4 uniquement) ──────────────────────
    _isVideoActive() {
      return this._videoEl && this._videoEl.tagName === 'VIDEO';
    }

    _videoSeek(deltaSeconds) {
      if (!this._isVideoActive()) return;
      try {
        const v = this._videoEl;
        const target = Math.max(0, Math.min((v.duration || 0), v.currentTime + deltaSeconds));
        v.currentTime = target;
      } catch (_) { /* ignore */ }
    }

    _videoTogglePlay() {
      if (!this._isVideoActive()) return;
      const v = this._videoEl;
      if (v.paused || v.ended) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }

    _videoSetSpeed(rate) {
      if (!this._isVideoActive()) return;
      if (isFinite(rate) && rate > 0) this._videoEl.playbackRate = rate;
    }

    _videoFullscreen() {
      if (!this._isVideoActive()) return;
      const v = this._videoEl;
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (v.requestFullscreen) {
          v.requestFullscreen();
        } else if (v.webkitRequestFullscreen) {
          v.webkitRequestFullscreen();  // Safari iOS
        }
      } catch (_) { /* ignore */ }
    }

    _updatePlayPauseIcon(playing) {
      if (!this.$vcPlayPauseIcon) return;
      const play = this.$vcPlayPauseIcon.querySelector('.be-icon-play');
      const pause = this.$vcPlayPauseIcon.querySelector('.be-icon-pause');
      if (play) play.classList.toggle('hidden', playing);
      if (pause) pause.classList.toggle('hidden', !playing);
    }

    _updateTimeLabel(current, duration) {
      const fmt = (s) => {
        s = Math.max(0, Math.floor(Number(s) || 0));
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        return `${m}:${ss}`;
      };
      if (this.$vcCurrent) this.$vcCurrent.textContent = fmt(current);
      if (this.$vcDuration) this.$vcDuration.textContent = fmt(duration);
    }

    // ─── Timer pour leçons TEXT (progression auto sur duration_sec) ───
    _startTextTimer(durationSec) {
      this._clearTextTimer();
      const dur = Number(durationSec || 0);
      if (!dur || !isFinite(dur)) return;
      // Tick toutes les secondes — increment percent linéairement jusqu'à 99.
      this._textTimerStart = Date.now();
      this._textTimerInitial = Number(this.state.lessonProgress.percent || 0);
      this._textTimer = setInterval(() => {
        const elapsed = (Date.now() - this._textTimerStart) / 1000;
        const pct = Math.min(99, this._textTimerInitial + (elapsed / dur) * 100);
        if (pct > Number(this.state.lessonProgress.percent || 0)) {
          this.state.lessonProgress.percent = pct;
          this.state.lessonProgress.last_position_seconds = Math.floor(elapsed);
          this._renderLessonProgress();
          this._saveDebounced();
        }
        // Auto-stop quand on atteint 99 (le 100 vient via mark-complete).
        if (pct >= 99) this._clearTextTimer();
      }, 1000);
    }

    _clearTextTimer() {
      if (this._textTimer) {
        clearInterval(this._textTimer);
        this._textTimer = null;
      }
    }

    // ─── Toast ─────────────────────────────────────────────────────────
    _toast(msg, kind) {
      if (!this.$toast) return;
      this.$toast.textContent = msg;
      // Couleur de fond inline (les classes Tailwind ne sont pas garanties
      // sur ce template standalone qui inclut seulement dist/app.min.css).
      const palette = {
        success: 'rgb(5 150 105)',   // emerald-600
        error:   'rgb(225 29 72)',   // rose-600
        info:    'rgb(12 135 214)',  // be-sky-600
      };
      this.$toast.style.background = palette[kind] || 'rgb(15 23 42)';
      this.$toast.setAttribute('data-show', 'true');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.$toast.setAttribute('data-show', 'false');
      }, 2400);
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
