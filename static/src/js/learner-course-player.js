/**
 * learner-course-player.js — Alpine component for the Udemy-style course player.
 *
 * Registered as: Alpine.data('coursePlayerUdemy')
 * Config is read from the #player-config hidden element (data-* attributes).
 *
 * Helper methods (no JS operators in template expressions):
 *   toastIsOk/Warn/Sync, toggleSidebar, closeSidebar, progressPercent,
 *   lessonProgressPercent, progressBarClass, sidebarClass, showSidebar,
 *   outlineEmpty, sectionChevronClass, lessonIconClass, unknownLessonType,
 *   lessonItemPercent, prevDisabled, nextDisabled, prevNavClass, nextNavClass,
 *   toggleBtnClass, showMarkComplete, lessonLoaded, showVideo, isIframe,
 *   showFile, isTextLesson, isQuizLesson, isLiveLesson, noLessonType,
 *   lessonHtml, quizLoadError, showQuizResult, quizResultClass, quizIconClass,
 *   quizTitleClass, quizSubtitleClass, quizResultTitle, quizFailed,
 *   quizScoreText, quizPassingScoreText, quizAnswersTxt, showRetry,
 *   multiAttempts, showQuizForm, quizPassingDataText, questionPrompt,
 *   choiceClass, choiceChecked, setAnswer, submitDisabled, notSubmitting,
 *   quizSubmitText, notAllAnswered, showQuizLocked, notSavingLesson,
 *   showLastSaved, completedLessons, totalLessons.
 */

document.addEventListener('alpine:init', () => {

  Alpine.data('coursePlayerUdemy', () => {
    /* Read config from the hidden #player-config element */
    const configNode = document.getElementById('player-config');
    const config = configNode ? configNode.dataset : {};
    const cfg = {
      courseId: config.courseId ? Number(config.courseId) : null,
      api: {
        outline:          config.outlineUrl          || '',
        continue:         config.continueUrl         || '',
        lessonStateBase:  config.lessonStateBase     || '',
        lessonProgressBase: config.lessonProgressBase || '',
        setCurrent:       config.setCurrentUrl       || '',
      },
    };

    return {
      courseId: cfg.courseId,
      api: cfg.api || {},

      loading: { outline: true, lesson: true },
      saving:  { any: false, lesson: false },

      course: { id: null, title: '' },
      sections: [],
      progress: { percent: 0, completed_lessons: 0, total_lessons: 0 },

      currentLessonId: null,
      lesson: {
        id: null, title: '', type: '',
        video_url: null, file_url: null, content: null, duration_sec: null,
      },
      lessonProgress: { percent: 0, is_completed: false, last_position_seconds: 0 },

      nav: { prevId: null, nextId: null },
      lastSavedAt: '',
      ui: {
        sidebarOpen: false,
        search: '',
        openSections: {},
        isDesktop: false,
        toast: { show: false, msg: '', type: 'ok', t: null },
      },

      /* Quiz state */
      quiz: {
        loading: false, loaded: false, data: null,
        answers: {}, submitting: false, result: null, error: null, attemptsLeft: 0,
      },

      _outlineRefreshTimer: null,
      _videoSeekDone: false,
      _textObserver: null,
      _saveCount: 0,
      _prefetchCache: new Map(),
      _saveAbort: null,
      _saveDebounceTimer: null,
      _videoTickLastSentAt: 0,
      lastSentPercent: -1,
      lastSentSecond: -1,

      /* ── CSP-safe template helpers ──────────────────────────────── */

      /* Toast */
      toastIsOk()   { return this.ui.toast.type === 'ok'; },
      toastIsWarn() { return this.ui.toast.type === 'warn'; },
      toastIsSync() { return this.ui.toast.type === 'sync'; },

      /* Sidebar */
      toggleSidebar() { this.ui.sidebarOpen = !this.ui.sidebarOpen; },
      closeSidebar()  { this.ui.sidebarOpen = false; },
      showSidebar()   { return this.ui.sidebarOpen || this.ui.isDesktop; },
      sidebarClass()  {
        return this.ui.sidebarOpen
          ? 'fixed inset-y-0 left-0 w-[88%] max-w-sm shadow-2xl'
          : 'hidden lg:block';
      },

      /* Progress */
      progressPercent()       { return (this.progress.percent || 0) + '%'; },
      lessonProgressPercent() { return (this.lessonProgress.percent || 0) + '%'; },
      completedLessons()      { return this.progress.completed_lessons || 0; },
      totalLessons()          { return this.progress.total_lessons || 0; },
      progressBarClass(val)   {
        return 'w-pct-' + Math.max(0, Math.min(100, Math.round(val || 0)));
      },

      /* Course / lesson title helpers */
      courseTitle()   { return this.course.title || 'Cours'; },
      lessonTitle()   { return this.lesson.title || 'Leçon'; },
      lessonTypeText(){ return this.lesson.type || ''; },

      /* Section helpers */
      sectionLessonsCount(s) { return (s && s.lessons) ? s.lessons.length : 0; },
      sectionLessons(s)      { return (s && s.lessons) ? s.lessons : []; },

      /* Lesson-type icon helpers (for sidebar x-if) */
      isVideoType(l) { return l.type === 'VIDEO'; },
      isTextType(l)  { return l.type === 'TEXT'; },
      isQuizType(l)  { return l.type === 'QUIZ'; },
      isLiveType(l)  { return l.type === 'LIVE'; },
      isFileType(l)  { return l.type === 'FILE'; },

      /* Quiz iteration helpers */
      quizQuestions()        { return (this.quiz.data && this.quiz.data.questions) ? this.quiz.data.questions : []; },
      questionChoices(q)     { return (q && q.choices) ? q.choices : []; },
      questionInputName(q)   { return 'q_' + q.id; },

      /* Save button class */
      savingLessonClass()    { return this.saving.lesson ? 'opacity-60 cursor-not-allowed' : ''; },

      /* Outline */
      outlineEmpty()            { return !this.loading.outline && this.filteredSections().length === 0; },
      sectionChevronClass(id)   { return this.ui.openSections[id] ? 'rotate-180' : ''; },
      activeLessonClass(lId)    { return Number(lId) === Number(this.currentLessonId) ? 'bg-be-sky-50' : ''; },
      lessonIconClass(l) {
        if (l.is_completed) return 'bg-emerald-100 text-emerald-700';
        if (Number(l.id) === Number(this.currentLessonId)) return 'bg-be-sky-100 text-be-sky-700';
        return 'bg-be-ink-50 text-be-ink-600';
      },
      unknownLessonType(type)   { return !['VIDEO', 'TEXT', 'QUIZ', 'LIVE', 'FILE'].includes(type); },
      lessonItemPercent(l)      { return (l.percent != null ? l.percent : 0) + '%'; },

      /* Navigation */
      get prevDisabled() { return !this.nav.prevId || this.loading.lesson; },
      get nextDisabled() { return !this.nav.nextId || this.loading.lesson; },
      prevNavClass()   { return this.prevDisabled ? 'opacity-50 cursor-not-allowed' : ''; },
      nextNavClass()   { return this.nextDisabled ? 'opacity-50 cursor-not-allowed' : ''; },
      toggleBtnClass() { return this.loading.lesson ? 'opacity-50 cursor-not-allowed' : ''; },

      /* Lesson display */
      showMarkComplete()  { return !this.lessonProgress.is_completed; },
      lessonLoaded()      { return !this.loading.lesson; },
      showVideo()         { return this.lesson.type === 'VIDEO' && !!this.lesson.video_url; },
      isIframe()          { return !this.isMp4(this.lesson.video_url); },
      showFile()          { return this.lesson.type === 'FILE' && !!this.lesson.file_url; },
      isTextLesson()      { return this.lesson.type === 'TEXT'; },
      isQuizLesson()      { return this.lesson.type === 'QUIZ'; },
      isLiveLesson()      { return this.lesson.type === 'LIVE'; },
      noLessonType()      { return !this.lesson.type; },
      lessonHtml()        { return this.lesson.content || '<p>Contenu vide.</p>'; },

      /* Save state */
      notSavingLesson() { return !this.saving.lesson; },
      showLastSaved()   { return !this.saving.lesson && !!this.lastSavedAt; },

      /* Quiz helpers */
      quizLoadError()   { return !this.quiz.loading && !!this.quiz.error && !this.quiz.loaded; },
      showQuizResult()  { return this.quiz.loaded && !!this.quiz.result; },
      showQuizForm()    { return this.quiz.loaded && !this.quiz.result && !!this.quiz.data; },
      showQuizLocked()  { return this.quiz.loaded && !this.quiz.result && !this.quiz.data; },
      quizFailed()      { return !this.quiz.result.passed; },
      showRetry()       { return !this.quiz.result.passed && !!this.quiz.data && this.quiz.attemptsLeft > 0; },
      multiAttempts()   { return this.quiz.attemptsLeft > 1; },
      quizResultClass() {
        return this.quiz.result.passed
          ? 'border-emerald-100 bg-emerald-50'
          : 'border-amber-100 bg-amber-50';
      },
      quizIconClass() {
        return this.quiz.result.passed
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700';
      },
      quizTitleClass() {
        return this.quiz.result.passed ? 'text-emerald-900' : 'text-amber-900';
      },
      quizSubtitleClass() {
        return this.quiz.result.passed ? 'text-emerald-700' : 'text-amber-700';
      },
      quizResultTitle() {
        return this.quiz.result.passed ? '🎉 Bravo, tu as réussi !' : "Continue à t'entraîner";
      },
      quizScoreText()       { return this.quiz.result.score_percent + '%'; },
      quizPassingScoreText(){ return this.quiz.result.passing_score + '%'; },
      quizAnswersTxt()      { return this.quiz.result.good_answers + '/' + this.quiz.result.total_questions; },
      quizPassingDataText() { return this.quiz.data.passing_score + '%'; },
      questionPrompt(qi, q) { return (qi + 1) + '. ' + q.prompt; },
      choiceClass(q, c) {
        return this.quiz.answers[q.id] == c.id
          ? 'border-be-sky-400 bg-be-sky-50 text-be-sky-800'
          : 'border-be-ink-100 bg-white text-be-ink-700 hover:border-be-ink-200 hover:bg-be-ink-50';
      },
      choiceChecked(q, c) { return this.quiz.answers[q.id] == c.id; },
      setAnswer(q, c)     { this.quiz.answers[q.id] = c.id; },
      get submitDisabled()  { return this.quiz.submitting || !this.quizAllAnswered(); },
      notSubmitting()      { return !this.quiz.submitting; },
      notAllAnswered()     { return !this.quizAllAnswered(); },
      quizSubmitText()     { return this.quiz.submitting ? 'Envoi…' : 'Soumettre mes réponses'; },

      /* ── Core methods (unchanged logic) ─────────────────────────── */

      formatDuration(sec) {
        const n = Number(sec || 0);
        if (!n || n < 0) return '—';
        const m = Math.floor(n / 60);
        const s = Math.floor(n % 60);
        if (m <= 0) return `${s}s`;
        return `${m}m ${String(s).padStart(2, '0')}s`;
      },

      isMp4(url) {
        const u = String(url || '').toLowerCase();
        return u.includes('.mp4') || u.includes('video/mp4') || u.includes('content-type=video');
      },

      nowTime() {
        const d = new Date();
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      },

      toast(msg, type = 'ok') {
        try {
          clearTimeout(this.ui.toast.t);
          this.ui.toast.msg  = msg || '';
          this.ui.toast.type = type || 'ok';
          this.ui.toast.show = true;
          this.ui.toast.t = setTimeout(() => { this.ui.toast.show = false; }, 1800);
        } catch (e) {
          console.warn('toast error', e);
        }
      },

      async apiGet(url) {
        if (!url) throw new Error('Missing GET URL');
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
        return await res.json();
      },

      getCsrf() {
        const m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : '';
      },

      async apiPost(url, payload = {}, signal = null) {
        if (!url) throw new Error('Missing POST URL');
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.getCsrf(),
            Accept: 'application/json',
          },
          body: JSON.stringify(payload || {}),
          credentials: 'same-origin',
          signal,
        });
        if (!res.ok) {
          let d = '';
          try { d = JSON.stringify(await res.json()); } catch (_) {}
          throw new Error(`POST ${url} -> ${res.status} ${d}`);
        }
        return await res.json();
      },

      async init() {
        try {
          const mq = window.matchMedia('(min-width: 1024px)');
          const updateDesktop = () => {
            this.ui.isDesktop = mq.matches;
            if (this.ui.isDesktop) this.ui.sidebarOpen = false;
          };
          updateDesktop();
          if (mq.addEventListener) {
            mq.addEventListener('change', updateDesktop);
          } else if (mq.addListener) {
            mq.addListener(updateDesktop);
          }

          await this.loadOutline();
          await this.resolveContinueLesson();

          if (this.currentLessonId) {
            await this.loadLesson(this.currentLessonId);
            this.computeNav();
            this.prefetchAround();
          } else {
            this.loading.lesson = false;
          }

          this.startAutoRefreshOutline();
          if (!this.ui.isDesktop) this.ui.sidebarOpen = false;
        } catch (e) {
          console.error('init error', e);
          this.loading.outline = false;
          this.loading.lesson  = false;
          this.toast('Erreur de chargement du lecteur', 'warn');
        }
      },

      startAutoRefreshOutline() {
        try {
          clearInterval(this._outlineRefreshTimer);
          this._outlineRefreshTimer = setInterval(() => {
            this.refreshOutline(false).catch(() => {});
          }, 30000);
        } catch (e) {
          console.warn('auto refresh error', e);
        }
      },

      async loadOutline() {
        try {
          this.loading.outline = true;
          const data = await this.apiGet(this.api.outline);

          this.course   = data?.course || this.course;
          this.sections = (data?.sections || []).map(s => ({
            ...s,
            lessons: (s.lessons || []).map(l => ({
              id:           l.id,
              title:        l.title || '',
              type:         l.lesson_type || l.type || '',
              duration_sec: l.duration_sec ?? null,
              percent:      Number(l.progress_percent ?? l.percent ?? 0),
              is_completed: !!(l.completed ?? l.is_completed),
              is_preview:   !!l.is_preview,
            })),
          }));

          this.progress = {
            percent:            Number(data?.progress?.percent ?? 0),
            completed_lessons:  Number(data?.progress?.completed_lessons ?? 0),
            total_lessons:      Number(data?.progress?.total_lessons ?? 0),
          };

          this.currentLessonId = data?.current_lesson_id || this.currentLessonId;

          if (!Object.keys(this.ui.openSections).length && this.sections.length) {
            this.ui.openSections[this.sections[0].id] = true;
          }
        } catch (e) {
          console.error('loadOutline error', e);
          this.toast('Impossible de charger le plan', 'warn');
        } finally {
          this.loading.outline = false;
        }
      },

      async refreshOutline(showToastMsg = false) {
        if (this.loading.outline) return;
        await this.loadOutline();
        this.computeNav();
        if (showToastMsg) this.toast('Plan mis à jour', 'ok');
      },

      async resolveContinueLesson() {
        try {
          if (this.currentLessonId) return;
          const data = await this.apiGet(this.api.continue);
          this.currentLessonId = data?.lesson_id || null;
        } catch (e) {
          console.error('resolveContinueLesson error', e);
        }
      },

      filteredSections() {
        const q = String(this.ui.search || '').trim().toLowerCase();
        if (!q) return this.sections || [];
        return (this.sections || [])
          .map(s => {
            const lessons = (s.lessons || []).filter(l => {
              return String(l.title || '').toLowerCase().includes(q)
                  || String(l.type  || '').toLowerCase().includes(q);
            });
            return lessons.length ? { ...s, lessons } : null;
          })
          .filter(Boolean);
      },

      toggleSection(sectionId) {
        this.ui.openSections[sectionId] = !this.ui.openSections[sectionId];
      },

      /* ── Quiz ────────────────────────────────────────────────────── */
      findSectionIdForLesson(lessonId) {
        for (const s of (this.sections || [])) {
          for (const l of (s.lessons || [])) {
            if (Number(l.id) === Number(lessonId)) return s.id;
          }
        }
        return null;
      },

      async loadQuiz() {
        this.quiz = {
          loading: true, loaded: false, data: null,
          answers: {}, submitting: false, result: null, error: null, attemptsLeft: 0,
        };
        const sectionId = this.findSectionIdForLesson(this.currentLessonId);
        if (!sectionId) {
          this.quiz.loading = false;
          this.quiz.loaded  = true;
          this.quiz.error   = 'Section introuvable pour ce quiz.';
          return;
        }
        try {
          const url  = `/api/learner/courses/${this.courseId}/sections/${sectionId}/quiz/`;
          const data = await this.apiGet(url);
          this.quiz.data         = data;
          this.quiz.attemptsLeft = Math.max(0, (data.max_attempts || 0) - (data.attempts_count || 0));
          this.quiz.loaded       = true;
        } catch (e) {
          this.quiz.error  = e?.detail || 'Impossible de charger le quiz.';
          this.quiz.loaded = true;
        } finally {
          this.quiz.loading = false;
        }
      },

      quizAllAnswered() {
        if (!this.quiz.data?.questions?.length) return false;
        return this.quiz.data.questions.every(q => this.quiz.answers[q.id] != null);
      },

      async submitQuiz() {
        if (!this.quizAllAnswered()) return;
        this.quiz.submitting = true;
        this.quiz.error      = null;
        const sectionId = this.findSectionIdForLesson(this.currentLessonId);
        try {
          const answers = Object.entries(this.quiz.answers).map(([qid, cid]) => ({
            question_id: Number(qid),
            choice_id:   Number(cid),
          }));
          const url    = `/api/learner/courses/${this.courseId}/sections/${sectionId}/quiz/submit/`;
          const result = await this.apiPost(url, { answers });
          this.quiz.result       = result;
          this.quiz.attemptsLeft = Math.max(0, this.quiz.attemptsLeft - 1);
          if (result?.passed) {
            this.$nextTick(() => this.refreshOutlineSilently());
          }
        } catch (e) {
          this.quiz.error = e?.detail || e?.message || 'Erreur lors de la soumission.';
        } finally {
          this.quiz.submitting = false;
        }
      },

      async resetQuiz() { await this.loadQuiz(); },

      async refreshOutlineSilently() {
        try {
          const data = await this.apiGet(this.api.outline);
          this.progress = {
            percent:           Number(data?.progress?.percent ?? 0),
            completed_lessons: Number(data?.progress?.completed_lessons ?? 0),
            total_lessons:     Number(data?.progress?.total_lessons ?? 0),
          };
          (data?.sections || []).forEach(s => {
            const sec = this.sections.find(x => x.id === s.id);
            if (!sec) return;
            (s.lessons || []).forEach(l => {
              const lesson = sec.lessons.find(x => x.id === l.id);
              if (lesson) {
                lesson.is_completed = !!(l.completed ?? l.is_completed);
                lesson.percent      = Number(l.progress_percent ?? l.percent ?? 0);
              }
            });
          });
        } catch (_) { /* silent */ }
      },

      expandAll(open) {
        (this.sections || []).forEach(s => { this.ui.openSections[s.id] = !!open; });
      },

      countCompleted(section) {
        return (section?.lessons || []).filter(l => l.is_completed).length;
      },

      flattenLessons() {
        const out = [];
        (this.sections || []).forEach(s => {
          (s.lessons || []).forEach(l => out.push(l));
        });
        return out;
      },

      computeNav() {
        const list = this.flattenLessons();
        const idx  = list.findIndex(x => Number(x.id) === Number(this.currentLessonId));
        this.nav.prevId = idx > 0 ? list[idx - 1].id : null;
        this.nav.nextId = (idx >= 0 && idx < list.length - 1) ? list[idx + 1].id : null;
      },

      async prevLesson() { if (this.nav.prevId) await this.openLesson(this.nav.prevId); },
      async nextLesson() { if (this.nav.nextId) await this.openLesson(this.nav.nextId); },

      async openLesson(lessonId) {
        if (!lessonId) return;
        if (Number(lessonId) === Number(this.currentLessonId) && !this.loading.lesson) return;

        this.currentLessonId = lessonId;
        this.computeNav();
        if (!this.ui.isDesktop) this.ui.sidebarOpen = false;

        try {
          await this.apiPost(this.api.setCurrent, { lesson_id: lessonId });
        } catch (e) {
          console.warn('setCurrent error', e);
        }
        await this.loadLesson(lessonId);
        this.prefetchAround();
      },

      normalizeLessonState(data) {
        const raw  = data?.lesson || {};
        const type = raw.type || raw.lesson_type || raw.lessonType || '';
        return {
          lesson: {
            ...raw,
            id:           raw.id || null,
            title:        raw.title || '',
            type,
            video_url:    raw.video_url || raw.videoUrl || raw.video || null,
            file_url:     raw.file_url  || raw.fileUrl  || raw.file  || null,
            content:      raw.content   || raw.text     || raw.html  || null,
            duration_sec: raw.duration_sec ?? raw.duration ?? null,
          },
          progress: {
            percent:                Number(data?.progress?.percent ?? data?.progress?.progress_percent ?? 0),
            is_completed:           !!(data?.progress?.is_completed ?? data?.progress?.completed),
            last_position_seconds:  Number(data?.progress?.last_position_seconds ?? 0),
          },
        };
      },

      async loadLesson(lessonId) {
        try {
          this.loading.lesson = true;
          this._videoSeekDone = false;
          this.teardownTextObserver();

          const key = Number(lessonId);
          if (this._prefetchCache.has(key)) {
            const cached = this._prefetchCache.get(key);
            this.lesson         = cached.lesson   || this.lesson;
            this.lessonProgress = cached.progress || this.lessonProgress;
            this.applyOptimisticToSidebar(lessonId, this.lessonProgress);
            this.$nextTick(() => {
              if (this.lesson.type === 'TEXT')  this.setupTextAutoComplete();
              if (this.lesson.type === 'VIDEO') this.seekVideoIfPossible();
              if (this.lesson.type === 'QUIZ')  this.loadQuiz();
            });
            return;
          }

          const url        = `${this.api.lessonStateBase}${lessonId}/state/`;
          const data       = await this.apiGet(url);
          const normalized = this.normalizeLessonState(data);

          this.lesson         = normalized.lesson;
          this.lessonProgress = normalized.progress;
          this.applyOptimisticToSidebar(lessonId, this.lessonProgress);

          this.$nextTick(() => {
            if (this.lesson.type === 'TEXT')  this.setupTextAutoComplete();
            if (this.lesson.type === 'VIDEO') this.seekVideoIfPossible();
            if (this.lesson.type === 'QUIZ')  this.loadQuiz();
          });
        } catch (e) {
          console.error('loadLesson error', e);
          this.lesson = {
            id: null, title: 'Erreur de chargement', type: '',
            video_url: null, file_url: null,
            content: '<p>Impossible de charger cette leçon.</p>',
            duration_sec: null,
          };
          this.lessonProgress = { percent: 0, is_completed: false, last_position_seconds: 0 };
          this.toast('Impossible de charger la leçon', 'warn');
        } finally {
          this.loading.lesson = false;
        }
      },

      prefetchAround() {
        [this.nav.prevId, this.nav.nextId].filter(Boolean).forEach(id => this.prefetchLesson(id));
      },

      async prefetchLesson(lessonId) {
        const key = Number(lessonId);
        if (!key || this._prefetchCache.has(key)) return;
        try {
          const url        = `${this.api.lessonStateBase}${lessonId}/state/`;
          const data       = await this.apiGet(url);
          const normalized = this.normalizeLessonState(data);
          this._prefetchCache.set(key, normalized);
          if (this._prefetchCache.size > 6) {
            const firstKey = this._prefetchCache.keys().next().value;
            this._prefetchCache.delete(firstKey);
          }
        } catch (e) {
          console.warn('prefetchLesson error', e);
        }
      },

      applyOptimisticToSidebar(lessonId, prog) {
        (this.sections || []).forEach(s => {
          (s.lessons || []).forEach(l => {
            if (Number(l.id) === Number(lessonId)) {
              l.percent      = Number(prog?.percent ?? l.percent ?? 0);
              l.is_completed = !!(prog?.is_completed ?? l.is_completed);
            }
          });
        });
      },

      scheduleSave(markDone = false, opts = {}) {
        clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = setTimeout(() => {
          this.saveProgress(markDone, opts).catch(() => {});
        }, opts.delayMs || 450);
      },

      async saveProgress(markDone = false, opts = {}) {
        const force     = !!opts.force;
        const wantToast = !!opts.toast;
        if (!this.currentLessonId) return;

        const percent    = Math.max(0, Math.min(100, Number(this.lessonProgress.percent || 0)));
        const seconds    = Math.max(0, Number(this.lessonProgress.last_position_seconds || 0));
        const is_completed = !!markDone || !!this.lessonProgress.is_completed;

        const percentDelta = Math.abs(percent - (this.lastSentPercent < 0 ? percent : this.lastSentPercent));
        const secondsDelta = Math.abs(seconds - (this.lastSentSecond  < 0 ? seconds : this.lastSentSecond));

        if (!force && !markDone && percentDelta < 2 && secondsDelta < 10) return;

        try { this._saveAbort?.abort(); } catch (_) {}

        this._saveAbort    = new AbortController();
        this.saving.lesson = true;
        this.saving.any    = true;

        try {
          const url     = `${this.api.lessonProgressBase}${this.currentLessonId}/progress/`;
          const payload = { percent, last_position_seconds: seconds, is_completed };

          this.lessonProgress.percent      = percent;
          this.lessonProgress.is_completed = is_completed;
          this.applyOptimisticToSidebar(this.currentLessonId, this.lessonProgress);

          const data = await this.apiPost(url, payload, this._saveAbort.signal);

          if (data?.progress) {
            this.lessonProgress.percent               = Number(data.progress.percent ?? this.lessonProgress.percent);
            this.lessonProgress.is_completed          = !!(data.progress.is_completed ?? this.lessonProgress.is_completed);
            this.lessonProgress.last_position_seconds = Number(data.progress.last_position_seconds ?? this.lessonProgress.last_position_seconds);
            this.applyOptimisticToSidebar(this.currentLessonId, this.lessonProgress);
          }

          this.lastSentPercent = this.lessonProgress.percent;
          this.lastSentSecond  = this.lessonProgress.last_position_seconds;
          this.lastSavedAt     = this.nowTime();

          this._saveCount += 1;
          if (this.lessonProgress.is_completed || this._saveCount % 4 === 0) {
            await this.refreshOutline(false);
          }
          if (wantToast) this.toast('Progress enregistré', 'ok');
        } catch (e) {
          if (e.name !== 'AbortError') {
            console.error('saveProgress error', e);
            this.toast('Erreur de synchronisation', 'warn');
          }
        } finally {
          this.saving.lesson = false;
          this.saving.any    = false;
        }
      },

      async toggleCompleted() {
        if (this.loading.lesson) return;
        if (this.lessonProgress.is_completed) {
          this.lessonProgress.is_completed = false;
          await this.saveProgress(false, { force: true, toast: true });
          return;
        }
        this.lessonProgress.percent      = 100;
        this.lessonProgress.is_completed = true;
        await this.saveProgress(true, { force: true, toast: true });
      },

      onVideoLoaded() { this.seekVideoIfPossible(); },

      seekVideoIfPossible() {
        const v = this.$refs.videoEl;
        if (!v || this._videoSeekDone) return;
        const pos = Number(this.lessonProgress.last_position_seconds || 0);
        if (pos > 2 && isFinite(pos)) {
          try { v.currentTime = pos; } catch (e) { console.warn('seek error', e); }
        }
        this._videoSeekDone = true;
      },

      onVideoTimeUpdate() {
        const v = this.$refs.videoEl;
        if (!v || !isFinite(v.duration) || !v.duration) return;
        const now      = Date.now();
        const current  = Math.floor(v.currentTime || 0);
        const duration = Math.floor(v.duration || 0);
        const percent  = duration ? Math.floor((current / duration) * 100) : 0;

        this.lessonProgress.last_position_seconds = current;
        this.lessonProgress.percent = Math.min(99, Math.max(Number(this.lessonProgress.percent || 0), percent));

        if (now - this._videoTickLastSentAt > 2500) {
          this._videoTickLastSentAt = now;
          this.scheduleSave(false, { force: false, delayMs: 400 });
        }
      },

      async onVideoEnded() {
        this.lessonProgress.percent      = 100;
        this.lessonProgress.is_completed = true;
        await this.saveProgress(true, { force: true, toast: true });
      },

      setupTextAutoComplete() {
        if (this.lessonProgress.is_completed) return;
        const sentinel = this.$refs.textEndSentinel;
        const root     = this.$refs.playerScroll;
        if (!sentinel || !root) return;

        this._textObserver = new IntersectionObserver(async (entries) => {
          const hit = entries.some(e => e.isIntersecting);
          if (!hit) return;
          this.lessonProgress.percent      = 100;
          this.lessonProgress.is_completed = true;
          await this.saveProgress(true, { force: true, toast: true });
          this.teardownTextObserver();
        }, { root, threshold: 0.6 });

        this._textObserver.observe(sentinel);
      },

      teardownTextObserver() {
        if (this._textObserver) {
          try { this._textObserver.disconnect(); } catch (_) {}
          this._textObserver = null;
        }
      },

      onFileOpened() {
        if (this.lessonProgress.is_completed) return;
        this.lessonProgress.percent = Math.max(Number(this.lessonProgress.percent || 0), 30);
        this.scheduleSave(false, { force: false, delayMs: 400 });
        this.toast('Ressource ouverte', 'sync');
      },

    }; // end return
  }); // end Alpine.data

}); // end alpine:init
