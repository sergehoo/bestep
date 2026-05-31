/**
 * lesson-player.js — Lecteur vidéo sécurisé (Alpine CSP build)
 * Component: lessonPlayer — x-data="lessonPlayer" data-lesson-id="{{ lesson_id }}"
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('lessonPlayer', () => ({
    lessonId: null,
    loading: true,
    error: null,
    url: null,
    kind: null,
    _expiresAt: null,
    _refreshTimer: null,

    init() {
      this.lessonId = this.$el.dataset.lessonId ? Number(this.$el.dataset.lessonId) : null;
      this.loadStream();
    },

    /* CSP helpers */
    isVideoReady()    { return !this.loading && !this.error && this.kind === 'mp4'; },
    isExternalReady() { return !this.loading && !this.error && this.kind === 'external'; },

    async loadStream() {
      this.loading = true;
      this.error   = null;
      try {
        const response = await fetch('/learn/api/lessons/' + this.lessonId + '/stream/', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (response.status === 404) {
          this.error = 'Vidéo introuvable ou accès non autorisé.';
          return;
        }
        if (response.status === 401 || response.status === 403) {
          this.error = 'Vous devez être inscrit pour visionner cette leçon.';
          return;
        }
        if (!response.ok) {
          this.error = 'Impossible de charger la vidéo (erreur réseau).';
          return;
        }
        const data = await response.json();
        this.url  = data.url;
        this.kind = data.kind || 'mp4';
        if (data.expires_in && data.expires_in > 10) {
          this._scheduleRefresh(data.expires_in - 10);
        }
      } catch (error) {
        this.error = 'Erreur réseau. Vérifiez votre connexion.';
      } finally {
        this.loading = false;
      }
    },

    _scheduleRefresh(seconds) {
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        const video = this.$refs.video;
        if (video && !video.paused) {
          this.loadStream();
        }
      }, seconds * 1000);
    },

    onMediaError()      { this.error = 'La lecture a échoué. Cliquez sur Réessayer.'; },
    onContextMenu(event){ event.preventDefault(); },
    onTimeUpdate()      {},
  }));
});
