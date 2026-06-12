/**
 * quiz-pages.js — Pages quiz instructeur (Alpine CSP build)
 *
 * quizCreatePage  : x-data="quizCreatePage"
 * quizDetailPage  : x-data="quizDetailPage" data-quiz-id="{{ quiz_id }}"
 * quizUpdatePage  : x-data="quizUpdatePage" data-quiz-id="{{ quiz_id }}"
 * quizListPage    : x-data="quizListPage"
 */

/* ---- utilitaires partagés (pas appelés depuis les templates) ---- */
function _quizCsrf() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

async function _quizApiGet(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('GET ' + url + ' -> ' + response.status);
  return response.json();
}

async function _quizApiPost(url, payload = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': _quizCsrf(),
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'POST ' + url + ' -> ' + response.status);
  return body;
}


document.addEventListener('alpine:init', () => {

  /* ============================================================
     quizListPage
     ============================================================ */
  Alpine.data('quizListPage', () => ({
    quizzes: [],
    loading: false,
    filters: { q: '' },

    async init() {
      await this.loadQuizzes();
    },

    async loadQuizzes() {
      try {
        this.loading = true;
      } catch (error) {
        // Fallback list globale via endpoint custom si besoin.
      } finally {
        this.loading = false;
      }
    },

    /* CSP helpers */
    emptyQuizzes() {
      return !this.loading && this.quizzes.length === 0;
    },
    quizDetailHref(quiz) {
      return '/dashboard/instructor/quizzes/' + quiz.id + '/';
    },
    quizEditHref(quiz) {
      return '/dashboard/instructor/quizzes/' + quiz.id + '/edit/';
    },
    quizQuestionsCount(quiz) {
      return (quiz && quiz.questions_count != null) ? quiz.questions_count : 0;
    },
    quizPassingScore(quiz) {
      return (quiz && quiz.passing_score != null) ? quiz.passing_score : 70;
    },
  }));


  /* ============================================================
     quizCreatePage
     ============================================================ */
  Alpine.data('quizCreatePage', () => ({
    courses: [],
    sections: [],
    saving: false,
    errorMsg: '',
    form: {
      title: '',
      course_id: '',
      section_id: '',
      passing_score: 70,
      max_attempts: 3,
    },

    async init() {
      await this.loadCourses();
    },

    async apiGet(url)            { return _quizApiGet(url); },
    async apiPost(url, payload)  { return _quizApiPost(url, payload); },

    async loadCourses() {
      try {
        const data = await this.apiGet('/api/instructor/courses/');
        this.courses = data.results || data;
      } catch (error) {
        this.errorMsg = 'Impossible de charger les cours.';
      }
    },

    async onCourseChange() {
      this.sections = [];
      this.form.section_id = '';
      if (!this.form.course_id) return;
      try {
        const data = await this.apiGet('/api/instructor/courses/' + this.form.course_id + '/sections/');
        this.sections = data.results || data;
      } catch (error) {
        /* Sections indisponibles : l'utilisateur peut continuer sans. */
      }
    },

    async saveQuiz() {
      this.errorMsg = '';
      if (!this.form.title.trim()) {
        this.errorMsg = 'Le titre est obligatoire.';
        return;
      }
      if (!this.form.course_id) {
        this.errorMsg = 'Veuillez sélectionner un cours.';
        return;
      }
      this.saving = true;
      try {
        const payload = {
          title: this.form.title.trim(),
          course_id: this.form.course_id,
          section_id: this.form.section_id || null,
          passing_score: Number(this.form.passing_score) || 70,
          max_attempts: Number(this.form.max_attempts) || 3,
        };
        const quiz = await this.apiPost('/api/instructor/quizzes/create/', payload);
        if (quiz.id) {
          window.location.href = '/dashboard/instructor/quizzes/' + quiz.id + '/';
        }
      } catch (error) {
        this.errorMsg = error.message || 'Erreur lors de la création du quiz.';
      } finally {
        this.saving = false;
      }
    },

    /* CSP helpers */
    noSections() {
      return !this.sections.length;
    },
    savingText() {
      return this.saving ? 'Création…' : 'Créer le quiz';
    },
  }));


  /* ============================================================
     quizDetailPage
     ============================================================ */
  Alpine.data('quizDetailPage', () => ({
    quizId: null,
    quiz: {},
    modals: { question: false },
    questionForm: {
      prompt: '',
      topic: '',
      choices: [
        { text: '', is_correct: true },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ],
    },

    init() {
      this.quizId = this.$el.dataset.quizId ? Number(this.$el.dataset.quizId) : null;
      this.loadQuiz();
    },

    async apiGet(url)           { return _quizApiGet(url); },
    async apiPost(url, payload) { return _quizApiPost(url, payload); },

    async loadQuiz() {
      this.quiz = await this.apiGet('/api/instructor/quizzes/' + this.quizId + '/');
    },

    openQuestionModal() {
      this.questionForm = {
        prompt: '',
        topic: '',
        choices: [
          { text: '', is_correct: true },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
      };
      this.modals.question = true;
    },
    closeQuestionModal() {
      this.modals.question = false;
    },

    setCorrectChoice(index) {
      this.questionForm.choices = this.questionForm.choices.map((choice, choiceIndex) => ({
        ...choice,
        is_correct: choiceIndex === index,
      }));
    },

    async saveQuestion() {
      await this.apiPost('/api/instructor/quizzes/' + this.quizId + '/questions/create/', this.questionForm);
      this.modals.question = false;
      await this.loadQuiz();
    },

    /* CSP helpers */
    quizPassingScore() {
      return (this.quiz && this.quiz.passing_score != null) ? this.quiz.passing_score : 70;
    },
    quizMaxAttempts() {
      return (this.quiz && this.quiz.max_attempts != null) ? this.quiz.max_attempts : 3;
    },
    quizTitle() {
      return (this.quiz && this.quiz.title) ? this.quiz.title : 'Quiz';
    },
    editHref() {
      return '/dashboard/instructor/quizzes/' + (this.quiz && this.quiz.id ? this.quiz.id : '') + '/edit/';
    },
    noQuestions() {
      return !this.quiz.questions || this.quiz.questions.length === 0;
    },
    quizQuestions() {
      return (this.quiz && this.quiz.questions) ? this.quiz.questions : [];
    },
    questionPrompt(q) {
      return q.order + '. ' + q.prompt;
    },
    quizChoices(q) {
      return q.choices || [];
    },
    choiceClass(choice) {
      return choice.is_correct
        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        : 'bg-white dark:bg-white/5 border-be-ink-100 dark:border-white/10 text-be-ink-700 dark:text-white/80';
    },
    choicePlaceholder(idx) {
      return 'Choix ' + (idx + 1);
    },
  }));


  /* ============================================================
     quizUpdatePage
     ============================================================ */
  Alpine.data('quizUpdatePage', () => ({
    quizId: null,
    form: {
      title: '',
      passing_score: 70,
      max_attempts: 3,
    },

    async init() {
      this.quizId = this.$el.dataset.quizId ? Number(this.$el.dataset.quizId) : null;
      await this.load();
    },

    async apiGet(url)           { return _quizApiGet(url); },
    async apiPost(url, payload) { return _quizApiPost(url, payload); },

    async load() {
      const quiz = await this.apiGet('/api/instructor/quizzes/' + this.quizId + '/');
      this.form.title         = quiz.title         || '';
      this.form.passing_score = quiz.passing_score || 70;
      this.form.max_attempts  = quiz.max_attempts  || 3;
    },

    async save() {
      await this.apiPost('/api/instructor/quizzes/' + this.quizId + '/update/', this.form);
      window.location.href = '/dashboard/instructor/quizzes/' + this.quizId + '/';
    },

    /* CSP helpers */
    detailHref() {
      return '/dashboard/instructor/quizzes/' + this.quizId + '/';
    },
  }));
});
