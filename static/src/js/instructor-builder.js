/**
 * instructor-builder.js — Builder de cours (Alpine CSP build)
 *
 * Enregistré via Alpine.data() dans alpine:init pour être compatible
 * avec la build CSP d'Alpine (cdn.csp.min.js).
 *
 * Config passée via data-* attrs sur l'élément racine :
 *   data-course-id="{{ course.id }}"
 *   data-url-upload-init="{% url 'api_media_upload_init' %}"
 *   data-url-upload-finalize="{% url 'api_media_upload_finalize' %}"
 *   data-url-media-list="{% url 'api_instructor_media' %}"
 */

document.addEventListener('alpine:init', () => {

  Alpine.data('instructorBuilderPage', () => ({

    /* ---- config (lue depuis data-* attrs dans init) ---- */
    courseId: null,
    endpoints: {},

    /* ---- state ---- */
    course: null,
    sections: [],
    lessons: [],
    quizzes: [],
    activeSection: null,
    mediaLibrary: [],

    loading: {
      sections: false,
      lessons: false,
      upload: false,
      saveLesson: false,
      quizzes: false,
      saveQuiz: false,
      saveQuestion: false,
    },

    modals: {
      lesson: false,
      quizCreate: false,
      quizAssign: false,
      quizPreview: false,
      quizEdit: false,
      question: false,
    },

    drawers: {
      upload: false,
    },

    lessonForm: {
      id: null,
      title: '',
      lesson_type: 'VIDEO',
      is_preview: false,
      duration_sec: 0,
      content: '',
      video_url: '',
      media_asset_id: '',
    },

    quizForm: {
      id: null,
      title: '',
      passing_score: 70,
      max_attempts: 3,
      section_id: null,
    },

    questionForm: {
      id: null,
      prompt: '',
      topic: '',
      order: 1,
      choices: [
        { text: '', is_correct: true },
        { text: '', is_correct: false },
      ],
    },

    quizAssignTargetSection: null,
    quizPreview: null,
    selectedQuiz: null,

    upload: {
      file: null,
      kind: 'video',
      title: '',
      progress: 0,
      error: '',
      upload_id: null,
      object_key: null,
    },

    /* ============================================================
       init — lit la config depuis les data-* attrs
       ============================================================ */
    init() {
      const ds = this.$el.dataset;
      this.courseId = ds.courseId ? Number(ds.courseId) : null;

      const uploadInit     = ds.urlUploadInit     || '';
      const uploadFinalize = ds.urlUploadFinalize || '';
      const mediaList      = ds.urlMediaList      || '';

      this.endpoints = {
        courseDetail:        (id)                    => `/api/instructor/courses/${id}/`,
        courseSections:      (id)                    => `/api/instructor/courses/${id}/sections/`,
        createSection:       (id)                    => `/api/instructor/courses/${id}/sections/create/`,
        updateSection:       (courseId, sectionId)   => `/api/instructor/courses/${courseId}/sections/${sectionId}/update/`,
        deleteSection:       (courseId, sectionId)   => `/api/instructor/courses/${courseId}/sections/${sectionId}/delete/`,

        sectionLessons:  (courseId, sectionId)            => `/api/instructor/courses/${courseId}/sections/${sectionId}/lessons/`,
        createLesson:    (courseId, sectionId)            => `/api/instructor/courses/${courseId}/sections/${sectionId}/lessons/create/`,
        updateLesson:    (courseId, sectionId, lessonId)  => `/api/instructor/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}/update/`,
        deleteLesson:    (courseId, sectionId, lessonId)  => `/api/instructor/courses/${courseId}/sections/${sectionId}/lessons/${lessonId}/delete/`,

        uploadInit,
        uploadFinalize,
        mediaList,
        signedGet: (assetId) => `/api/media/${assetId}/signed/`,

        courseQuizzes:       (courseId)            => `/api/instructor/courses/${courseId}/quizzes/`,
        createSectionQuiz:   (courseId, sectionId) => `/api/instructor/courses/${courseId}/sections/${sectionId}/quiz/create/`,
        assignSectionQuiz:   (courseId, sectionId) => `/api/instructor/courses/${courseId}/sections/${sectionId}/quiz/assign/`,
        unassignSectionQuiz: (courseId, sectionId) => `/api/instructor/courses/${courseId}/sections/${sectionId}/quiz/unassign/`,
        quizDetail:          (quizId)              => `/api/instructor/quizzes/${quizId}/`,
        quizUpdate:          (quizId)              => `/api/instructor/quizzes/${quizId}/update/`,
        createQuizQuestion:  (quizId)              => `/api/instructor/quizzes/${quizId}/questions/create/`,
        updateQuizQuestion:  (questionId)          => `/api/instructor/questions/${questionId}/update/`,
        deleteQuizQuestion:  (questionId)          => `/api/instructor/questions/${questionId}/delete/`,
      };

      this.loadCourse();
      this.loadSections();
      this.loadQuizzes();
      this.loadMediaLibrary();
    },

    /* ============================================================
       CSP helper methods (remplacent les expressions avec opérateurs)
       ============================================================ */

    /* --- section counts & quiz details --- */
    sectionLessonsCount(s) {
      return (s && s.lessons_count != null) ? s.lessons_count : 0;
    },
    sectionQuizQuestionsCount(s) {
      return (s && s.quiz && s.quiz.questions_count != null) ? s.quiz.questions_count : 0;
    },
    sectionQuizPassingScore(s) {
      return (s && s.quiz && s.quiz.passing_score != null) ? s.quiz.passing_score : 70;
    },
    quizQuestionsCount(q) {
      return (q && q.questions_count != null) ? q.questions_count : 0;
    },
    quizPassingScore(q) {
      return (q && q.passing_score != null) ? q.passing_score : 70;
    },
    quizChoices(q) {
      return (q && q.choices) ? q.choices : [];
    },

    /* --- sections --- */
    activeSectionClass(s) {
      return (this.activeSection && this.activeSection.id === s.id)
        ? 'bg-be-sky-50 dark:bg-be-sky-900/40 border-be-sky-200 dark:border-be-sky-800 shadow-soft'
        : 'bg-white dark:bg-white/5 border-be-ink-100 dark:border-white/10 hover:bg-be-ink-50 dark:hover:bg-white/10';
    },
    sectionTitle(s) {
      return s.order + '. ' + s.title;
    },
    sectionQuizTitle(s) {
      return s.quiz ? s.quiz.title : 'Aucun quiz lié';
    },
    noSections() {
      return !this.loading.sections && this.sections.length === 0;
    },

    /* --- lessons panel --- */
    noActiveSection() {
      return !this.activeSection;
    },
    sectionHasNoQuiz() {
      return !!(this.activeSection && !this.getQuizForSection(this.activeSection.id));
    },
    sectionHasQuiz() {
      return !!(this.activeSection && this.getQuizForSection(this.activeSection.id));
    },
    openQuizForActiveSection() {
      const quiz = this.getQuizForSection(this.activeSection.id);
      if (quiz) this.openEditQuizModal(quiz.id);
    },
    sectionIsLoading() {
      return !!(this.activeSection && this.loading.lessons);
    },
    lessonTitle(l) {
      return l.order + '. ' + l.title;
    },
    lessonContentPreview(l) {
      const text = this.stripHtml(l.content || '');
      return text.length > 140 ? text.slice(0, 140) + '…' : text;
    },
    lessonMediaKey(l) {
      return (l.media_asset && l.media_asset.object_key) ? l.media_asset.object_key : '';
    },
    noLessonsInSection() {
      return !!(this.activeSection && !this.loading.lessons && this.lessons.length === 0);
    },

    /* --- lesson modal --- */
    lessonModalTitle() {
      return this.lessonForm.id ? 'Modifier la leçon' : 'Créer une leçon';
    },
    isTextLesson() {
      return this.lessonForm.lesson_type === 'TEXT';
    },
    isNotTextLesson() {
      return this.lessonForm.lesson_type !== 'TEXT';
    },

    /* --- media library select --- */
    mediaOptionText(m) {
      return m.kind + ' • ' + (m.title || m.object_key);
    },

    /* --- quiz create modal --- */
    closeQuizCreate() {
      this.modals.quizCreate = false;
    },
    noQuizzes() {
      return this.quizzes.length === 0;
    },

    /* --- quiz assign modal --- */
    closeQuizAssign() {
      this.modals.quizAssign = false;
    },

    /* --- quiz preview modal --- */
    quizPreviewTitle() {
      return (this.quizPreview && this.quizPreview.title) ? this.quizPreview.title : 'Quiz';
    },
    quizPreviewPassingScore() {
      return (this.quizPreview && this.quizPreview.passing_score != null)
        ? this.quizPreview.passing_score
        : 70;
    },
    quizPreviewMaxAttempts() {
      return (this.quizPreview && this.quizPreview.max_attempts != null)
        ? this.quizPreview.max_attempts
        : 3;
    },
    quizPreviewEmpty() {
      return !!(this.quizPreview && (!this.quizPreview.questions || this.quizPreview.questions.length === 0));
    },
    quizPreviewQuestions() {
      return (this.quizPreview && this.quizPreview.questions) ? this.quizPreview.questions : [];
    },

    /* --- quiz edit modal --- */
    selectedQuizTitle() {
      return (this.selectedQuiz && this.selectedQuiz.title) ? this.selectedQuiz.title : '';
    },
    emptyAssignedQuestions() {
      return !this.selectedQuiz || !this.selectedQuiz.questions || this.selectedQuiz.questions.length === 0;
    },
    selectedQuizQuestions() {
      return (this.selectedQuiz && this.selectedQuiz.questions) ? this.selectedQuiz.questions : [];
    },

    /* --- question shared --- */
    questionPrompt(q) {
      return q.order + '. ' + q.prompt;
    },
    correctChoiceClass(c) {
      return c.is_correct
        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        : 'bg-white dark:bg-white/5 border-be-ink-100 dark:border-white/10 text-be-ink-700 dark:text-white/80';
    },

    /* --- question modal --- */
    questionModalTitle() {
      return this.questionForm.id ? 'Modifier la question' : 'Créer une question';
    },
    correctChoiceButtonClass(choice) {
      return choice.is_correct
        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
        : 'bg-white dark:bg-white/5 border border-be-ink-100 dark:border-white/10 text-be-ink-700 dark:text-white/80';
    },

    /* --- upload drawer --- */
    closeUploadDrawer() {
      this.drawers.upload = false;
    },
    uploadInProgress() {
      return this.upload.progress > 0;
    },
    uploadBarClass() {
      return 'w-pct-' + Math.max(0, Math.min(100, Math.round(this.upload.progress || 0)));
    },
    uploadProgressText() {
      return this.upload.progress + '%';
    },

    /* ============================================================
       Utilitaires HTTP
       ============================================================ */
    getCsrf() {
      const m = document.cookie.match(/csrftoken=([^;]+)/);
      return m ? m[1] : '';
    },

    stripHtml(value) {
      const div = document.createElement('div');
      div.innerHTML = value || '';
      return div.textContent || div.innerText || '';
    },

    async apiGet(url) {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      return await res.json();
    },

    async apiPost(url, payload = {}) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCsrf(),
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch { /* noop */ }
        throw new Error(`POST ${url} -> ${res.status} ${detail}`);
      }
      return await res.json();
    },

    /* ============================================================
       Chargement des données
       ============================================================ */
    async loadCourse() {
      try {
        this.course = await this.apiGet(this.endpoints.courseDetail(this.courseId));
      } catch (e) { console.error(e); }
    },

    async loadSections() {
      try {
        this.loading.sections = true;
        this.sections = await this.apiGet(this.endpoints.courseSections(this.courseId));
        this.attachQuizzesToSections();

        if (this.sections.length) {
          if (!this.activeSection) {
            await this.selectSection(this.sections[0]);
          } else {
            const found = this.sections.find(s => s.id === this.activeSection.id);
            if (found) {
              this.activeSection = found;
            } else {
              await this.selectSection(this.sections[0]);
            }
          }
        } else {
          this.activeSection = null;
          this.lessons = [];
        }
      } catch (e) { console.error(e); }
      finally { this.loading.sections = false; }
    },

    async selectSection(section) {
      this.activeSection = section;
      await this.loadLessons(section.id);
    },

    async loadLessons(sectionId) {
      try {
        this.loading.lessons = true;
        this.lessons = await this.apiGet(this.endpoints.sectionLessons(this.courseId, sectionId));
      } catch (e) {
        console.error(e);
        this.lessons = [];
      } finally { this.loading.lessons = false; }
    },

    async loadQuizzes() {
      try {
        this.loading.quizzes = true;
        this.quizzes = await this.apiGet(this.endpoints.courseQuizzes(this.courseId));
        this.attachQuizzesToSections();
      } catch (e) {
        console.error(e);
        this.quizzes = [];
      } finally { this.loading.quizzes = false; }
    },

    attachQuizzesToSections() {
      const quizMap = {};
      (this.quizzes || []).forEach(q => { if (q.section_id) quizMap[q.section_id] = q; });
      this.sections = (this.sections || []).map(s => ({ ...s, quiz: quizMap[s.id] || null }));
      if (this.activeSection) {
        const found = this.sections.find(s => s.id === this.activeSection.id);
        if (found) this.activeSection = found;
      }
    },

    getQuizForSection(sectionId) {
      return (this.quizzes || []).find(q => Number(q.section_id) === Number(sectionId)) || null;
    },

    /* ============================================================
       Sections — CRUD
       ============================================================ */
    async createSectionPrompt() {
      const title = prompt('Titre de la section ?');
      if (!title || !title.trim()) return;
      try {
        await this.apiPost(this.endpoints.createSection(this.courseId), { title: title.trim() });
        await this.loadSections();
      } catch (e) { console.error(e); }
    },

    async editSectionPrompt(section) {
      const title = prompt('Nouveau titre ?', section.title);
      if (!title || !title.trim()) return;
      try {
        await this.apiPost(this.endpoints.updateSection(this.courseId, section.id), { title: title.trim() });
        await this.loadSections();
      } catch (e) { console.error(e); }
    },

    async deleteSection(section) {
      if (!confirm('Supprimer cette section ?')) return;
      try {
        await this.apiPost(this.endpoints.deleteSection(this.courseId, section.id), {});
        this.activeSection = null;
        this.lessons = [];
        await this.loadSections();
        await this.loadQuizzes();
      } catch (e) { console.error(e); }
    },

    /* ============================================================
       Bibliothèque média
       ============================================================ */
    async loadMediaLibrary(kind = '') {
      try {
        const url = new URL(this.endpoints.mediaList, window.location.origin);
        if (kind) url.searchParams.set('kind', kind);
        this.mediaLibrary = await this.apiGet(url.toString());
      } catch (e) {
        console.error(e);
        this.mediaLibrary = [];
      }
    },

    /* ============================================================
       Éditeur TinyMCE
       ============================================================ */
    onLessonTypeChanged() {
      const lt = this.lessonForm.lesson_type;
      if (lt === 'TEXT') {
        this.$nextTick(() => this.initTinyMCE());
        return;
      }
      this.destroyTinyMCE();
      if (lt === 'VIDEO') this.loadMediaLibrary('video');
      else if (lt === 'FILE') this.loadMediaLibrary('doc');
      else this.loadMediaLibrary('');
    },

    initTinyMCE() {
      if (!window.tinymce) return;
      const existing = tinymce.get('lesson-content-editor');
      if (existing) existing.remove();
      this.$nextTick(() => {
        tinymce.init({
          selector: '#lesson-content-editor',
          height: 420,
          menubar: 'file edit view insert format tools table help',
          branding: false,
          promotion: false,
          language: 'fr_FR',
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
            'preview', 'anchor', 'searchreplace', 'visualblocks',
            'fullscreen', 'insertdatetime', 'media', 'table',
            'wordcount', 'code', 'help', 'directionality',
            'pagebreak', 'nonbreaking',
          ],
          toolbar: [
            'undo redo',
            'blocks fontfamily fontsize',
            'bold italic underline strikethrough',
            'forecolor backcolor',
            'alignleft aligncenter alignright alignjustify',
            'bullist numlist outdent indent',
            'link image media table',
            'removeformat code preview fullscreen',
          ].join(' | '),
          setup: (editor) => {
            editor.on('init', () => { editor.setContent(this.lessonForm.content || ''); });
            const syncContent = () => { this.lessonForm.content = editor.getContent() || ''; };
            editor.on('change input undo redo keyup setcontent', syncContent);
          },
        });
      });
    },

    destroyTinyMCE() {
      if (!window.tinymce) return;
      const editor = tinymce.get('lesson-content-editor');
      if (editor) editor.remove();
    },

    syncEditorToModel() {
      if (!window.tinymce) return;
      const editor = tinymce.get('lesson-content-editor');
      if (editor) this.lessonForm.content = editor.getContent() || '';
    },

    /* ============================================================
       Leçons — CRUD
       ============================================================ */
    async openLessonEditor(lesson = null) {
      if (!this.activeSection) return;
      if (lesson) {
        this.lessonForm = {
          id: lesson.id,
          title: lesson.title || '',
          lesson_type: lesson.lesson_type || 'VIDEO',
          is_preview: !!lesson.is_preview,
          duration_sec: lesson.duration_sec || 0,
          content: lesson.content || '',
          video_url: lesson.video_url || '',
          media_asset_id: (lesson.media_asset && lesson.media_asset.id) ? lesson.media_asset.id : '',
        };
      } else {
        this.lessonForm = {
          id: null,
          title: '',
          lesson_type: 'VIDEO',
          is_preview: false,
          duration_sec: 0,
          content: '',
          video_url: '',
          media_asset_id: '',
        };
      }
      this.modals.lesson = true;
      this.$nextTick(() => this.onLessonTypeChanged());
    },

    closeLessonModal() {
      this.syncEditorToModel();
      this.destroyTinyMCE();
      this.modals.lesson = false;
    },

    async saveLesson() {
      if (!this.activeSection) return;
      try {
        this.loading.saveLesson = true;
        this.syncEditorToModel();
        const payload = { ...this.lessonForm };
        if (!payload.media_asset_id) payload.media_asset_id = null;
        if (!payload.id) {
          await this.apiPost(this.endpoints.createLesson(this.courseId, this.activeSection.id), payload);
        } else {
          await this.apiPost(this.endpoints.updateLesson(this.courseId, this.activeSection.id, payload.id), payload);
        }
        this.closeLessonModal();
        await this.loadLessons(this.activeSection.id);
        await this.loadSections();
      } catch (e) { console.error(e); }
      finally { this.loading.saveLesson = false; }
    },

    async deleteLesson(lesson) {
      if (!confirm('Supprimer cette leçon ?')) return;
      try {
        await this.apiPost(this.endpoints.deleteLesson(this.courseId, this.activeSection.id, lesson.id), {});
        await this.loadLessons(this.activeSection.id);
        await this.loadSections();
      } catch (e) { console.error(e); }
    },

    /* ============================================================
       Quiz — CRUD
       ============================================================ */
    openCreateQuizModal(section) {
      if (!section) return;
      this.quizForm = {
        id: null,
        title: 'Quiz — ' + section.title,
        passing_score: 70,
        max_attempts: 3,
        section_id: section.id,
      };
      this.modals.quizCreate = true;
    },

    async saveSectionQuiz() {
      try {
        this.loading.saveQuiz = true;
        await this.apiPost(
          this.endpoints.createSectionQuiz(this.courseId, this.quizForm.section_id),
          {
            title: this.quizForm.title,
            passing_score: this.quizForm.passing_score,
            max_attempts: this.quizForm.max_attempts,
          }
        );
        this.modals.quizCreate = false;
        await this.loadQuizzes();
        await this.loadSections();
      } catch (e) {
        console.error(e);
        alert('Impossible de créer le quiz.');
      } finally { this.loading.saveQuiz = false; }
    },

    openAssignQuizModal(section) {
      if (!section) return;
      this.quizAssignTargetSection = section;
      this.modals.quizAssign = true;
    },

    async assignQuizToSection(quizId) {
      try {
        await this.apiPost(
          this.endpoints.assignSectionQuiz(this.courseId, this.quizAssignTargetSection.id),
          { quiz_id: quizId }
        );
        this.modals.quizAssign = false;
        await this.loadQuizzes();
        await this.loadSections();
      } catch (e) { console.error(e); }
    },

    async unassignQuiz(section) {
      try {
        await this.apiPost(this.endpoints.unassignSectionQuiz(this.courseId, section.id), {});
        await this.loadQuizzes();
        await this.loadSections();
      } catch (e) { console.error(e); }
    },

    async openQuizPreview(quiz) {
      try {
        this.quizPreview = await this.apiGet(this.endpoints.quizDetail(quiz.id));
        this.modals.quizPreview = true;
      } catch (e) { console.error(e); }
    },

    closeQuizPreview() {
      this.modals.quizPreview = false;
      this.quizPreview = null;
    },

    async openEditQuizModal(quizId) {
      try {
        const data = await this.apiGet(this.endpoints.quizDetail(quizId));
        this.selectedQuiz = data;
        this.quizForm = {
          id: data.id,
          title: data.title || '',
          passing_score: data.passing_score || 70,
          max_attempts: data.max_attempts || 3,
          section_id: data.section_id || null,
        };
        this.modals.quizEdit = true;
      } catch (e) {
        console.error(e);
        alert('Impossible de charger le quiz.');
      }
    },

    closeQuizEditModal() {
      this.modals.quizEdit = false;
      this.selectedQuiz = null;
    },

    async saveQuizUpdate() {
      if (!this.quizForm.id) return;
      try {
        this.loading.saveQuiz = true;
        await this.apiPost(this.endpoints.quizUpdate(this.quizForm.id), {
          title: this.quizForm.title,
          passing_score: this.quizForm.passing_score,
          max_attempts: this.quizForm.max_attempts,
        });
        await this.loadQuizzes();
        await this.openEditQuizModal(this.quizForm.id);
        await this.loadSections();
      } catch (e) {
        console.error(e);
        alert('Impossible de modifier le quiz.');
      } finally { this.loading.saveQuiz = false; }
    },

    /* ============================================================
       Questions — CRUD
       ============================================================ */
    openQuestionModal(question = null) {
      if (question) {
        this.questionForm = {
          id: question.id,
          prompt: question.prompt || '',
          topic: question.topic || '',
          order: question.order || 1,
          choices: (question.choices || []).map(c => ({ text: c.text, is_correct: !!c.is_correct })),
        };
      } else {
        const qCount = (this.selectedQuiz && this.selectedQuiz.questions)
          ? this.selectedQuiz.questions.length
          : 0;
        this.questionForm = {
          id: null,
          prompt: '',
          topic: '',
          order: qCount + 1,
          choices: [
            { text: '', is_correct: true },
            { text: '', is_correct: false },
          ],
        };
      }
      this.modals.question = true;
    },

    closeQuestionModal() {
      this.modals.question = false;
    },

    addQuestionChoice() {
      this.questionForm.choices.push({ text: '', is_correct: false });
    },

    removeQuestionChoice(index) {
      if (this.questionForm.choices.length <= 2) return;
      this.questionForm.choices.splice(index, 1);
    },

    markCorrectChoice(index) {
      this.questionForm.choices = this.questionForm.choices.map((choice, i) => ({
        ...choice,
        is_correct: i === index,
      }));
    },

    async saveQuestion() {
      if (!this.selectedQuiz || !this.selectedQuiz.id) return;
      try {
        this.loading.saveQuestion = true;
        if (!this.questionForm.id) {
          await this.apiPost(this.endpoints.createQuizQuestion(this.selectedQuiz.id), this.questionForm);
        } else {
          await this.apiPost(this.endpoints.updateQuizQuestion(this.questionForm.id), this.questionForm);
        }
        this.modals.question = false;
        await this.openEditQuizModal(this.selectedQuiz.id);
        await this.loadQuizzes();
        await this.loadSections();
      } catch (e) {
        console.error(e);
        alert("Impossible d'enregistrer la question.");
      } finally { this.loading.saveQuestion = false; }
    },

    async deleteQuestion(questionId) {
      if (!confirm('Supprimer cette question ?')) return;
      try {
        await this.apiPost(this.endpoints.deleteQuizQuestion(questionId), {});
        await this.openEditQuizModal(this.selectedQuiz.id);
        await this.loadQuizzes();
      } catch (e) {
        console.error(e);
        alert('Impossible de supprimer la question.');
      }
    },

    /* ============================================================
       Upload média
       ============================================================ */
    openUploadDrawer() {
      this.upload = {
        file: null,
        kind: 'video',
        title: '',
        progress: 0,
        error: '',
        upload_id: null,
        object_key: null,
      };
      this.drawers.upload = true;
    },

    handleFilePicked(ev) {
      const files = ev.target.files;
      const f = files && files[0] ? files[0] : null;
      if (!f) return;
      this.upload.file = f;
      if (f.type.startsWith('video/')) this.upload.kind = 'video';
      else if (f.type.startsWith('audio/')) this.upload.kind = 'audio';
      else this.upload.kind = 'doc';
    },

    async startUpload() {
      try {
        this.upload.error = '';
        if (!this.upload.file) {
          this.upload.error = 'Choisissez un fichier.';
          return;
        }
        this.loading.upload = true;
        this.upload.progress = 1;

        const initResp = await this.apiPost(this.endpoints.uploadInit, {
          filename: this.upload.file.name,
          content_type: this.upload.file.type || 'application/octet-stream',
          size: this.upload.file.size,
          kind: this.upload.kind,
          title: this.upload.title || '',
        });

        this.upload.upload_id  = initResp.upload_id;
        this.upload.object_key = initResp.object_key;

        await this.putFile(initResp.upload_url, this.upload.file, initResp.headers || {});

        await this.apiPost(this.endpoints.uploadFinalize, {
          upload_id:    this.upload.upload_id,
          object_key:   this.upload.object_key,
          kind:         this.upload.kind,
          title:        this.upload.title || '',
          content_type: this.upload.file.type || 'application/octet-stream',
          size:         this.upload.file.size,
          duration_seconds: null,
          bind: null,
        });

        this.upload.progress = 100;
        this.drawers.upload  = false;
        await this.loadMediaLibrary();
      } catch (e) {
        console.error(e);
        this.upload.error = 'Upload échoué.';
      } finally { this.loading.upload = false; }
    },

    async putFile(uploadUrl, file, headers) {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            this.upload.progress = Math.round((e.loaded / e.total) * 100);
        };
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(xhr.status));
        xhr.onerror = () => reject(new Error('network'));
        xhr.send(file);
      });
    },

    /* ============================================================
       Formatage
       ============================================================ */
    formatDuration(sec) {
      sec = Number(sec || 0);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (m < 60) return m + 'm ' + s + 's';
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return h + 'h ' + mm + 'm';
    },
  }));
});
