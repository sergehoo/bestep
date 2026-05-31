function icon(name){
  const icons = {
    courses: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M8 7h8M8 11h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    users: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M17 21a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M9 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="2"/>
      <path d="M23 21a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    money: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M21 7H3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2Z" stroke="currentColor" stroke-width="2"/>
      <path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="2"/>
      <path d="M7 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    star: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    trend: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 7h7v7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  };
  return icons[name] || icons.courses;
}

function instructorApp(cfg){
  return {
    endpoints: cfg.endpoints,

    activeTab: "courses",
    me: {},
    kpis: [],
    courses: [],
    sections: [],
    lessons: [],
    notifications: [],
    reviews: [],
    payouts: [],

    selectedCourse: null,
    activeSection: null,

    filters: { q:"", status:"", pricing:"", type:"" },

    loading: {
      me:false, kpis:false, courses:false,
      sections:false, lessons:false,
      saveCourse:false, publish:false, archive:false,
      upload:false,
      reviews:false, payouts:false, notifications:false,
    },

    modals: { course:false, previewCourse:false, lesson:false, previewLesson:false },
    drawers: { upload:false },

    courseForm: {
      id:null, title:"", subtitle:"", description:"",
      course_type:"PROFESSIONNELLE", pricing_type:"PAID", price:0,
      thumbnailFile:null,
      preview_video_url:""
    },

    lessonForm: {
      id:null, title:"", lesson_type:"VIDEO", is_preview:false, duration_sec:0,
      content:"", video_url:"", media_asset_id:""
    },

    mediaLibrary: [],

    upload: { file:null, kind:"video", title:"", progress:0, error:"", bindLessonId:"", upload_id:null, object_key:null },

    toast: { show:false, title:"", message:"" },

    previewCourse: null,
    previewLesson: null,
    previewLessonSignedUrl: "",

    init(){
      this.loadMe();
      this.loadKpis();
      this.loadCourses();
    },

    showToast(title, message){
      this.toast = { show:true, title, message };
      setTimeout(()=>this.toast.show=false, 3500);
    },

    statusLabel(s){
      const map = { DRAFT:"Brouillon", REVIEW:"En validation", PUBLISHED:"Publié", ARCHIVED:"Archivé" };
      return map[s] || s;
    },
    statusPill(s){
      if (s==="PUBLISHED") return "bg-emerald-50 border-emerald-200 text-emerald-700";
      if (s==="REVIEW") return "bg-be-sun-50 border-be-sun-200 text-be-sun-800";
      if (s==="ARCHIVED") return "bg-be-ink-50 border-be-ink-100 text-be-ink-700";
      return "bg-be-sky-50 border-be-sky-200 text-be-sky-700";
    },
    pricingLabel(p, price, cur){
      if (p==="FREE") return "Gratuit";
      if (p==="HYBRID") return "Hybride";
      return `Payant • ${Number(price||0).toLocaleString('fr-FR')} ${cur||'XOF'}`;
    },
    pricingPill(p){
      if (p==="PAID") return "bg-be-sun-50 border-be-sun-200 text-be-sun-800";
      if (p==="HYBRID") return "bg-be-sky-50 border-be-sky-200 text-be-sky-700";
      return "bg-be-ink-50 border-be-ink-100 text-be-ink-700";
    },
    formatDuration(sec){
      sec = Number(sec||0);
      const m = Math.floor(sec/60), s = sec%60;
      if (m < 60) return `${m}m ${s}s`;
      const h = Math.floor(m/60), mm = m%60;
      return `${h}h ${mm}m`;
    },
    humanBytes(bytes){
      const b = Number(bytes||0);
      const u = ["B","KB","MB","GB"];
      let i=0, v=b;
      while(v>=1024 && i<u.length-1){ v/=1024; i++; }
      return `${v.toFixed(i?1:0)} ${u[i]}`;
    },

    getCsrf(){
      const m = document.cookie.match(/csrftoken=([^;]+)/);
      return m ? m[1] : "";
    },

    async apiGet(url){
      const res = await fetch(url, { headers: { "Accept":"application/json" }, credentials:"same-origin" });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      return await res.json();
    },

    async apiPost(url, payload){
      const res = await fetch(url, {
        method:"POST",
        headers: {
          "Content-Type":"application/json",
          "X-CSRFToken": this.getCsrf(),
          "Accept":"application/json"
        },
        body: JSON.stringify(payload || {}),
        credentials:"same-origin"
      });
      if (!res.ok){
        let detail = "";
        try { detail = JSON.stringify(await res.json()); } catch(e){}
        throw new Error(`POST ${url} -> ${res.status} ${detail}`);
      }
      return await res.json();
    },

    async apiPostForm(url, formData){
      const res = await fetch(url, {
        method:"POST",
        headers: { "X-CSRFToken": this.getCsrf(), "Accept":"application/json" },
        body: formData,
        credentials:"same-origin"
      });
      if (!res.ok){
        let detail=""; try{ detail=JSON.stringify(await res.json()); }catch(e){}
        throw new Error(`POST ${url} -> ${res.status} ${detail}`);
      }
      return await res.json();
    },

    async loadMe(){
      try{ this.loading.me=true; this.me = await this.apiGet(this.endpoints.me); }
      catch(e){ console.error(e); }
      finally{ this.loading.me=false; }
    },

    async loadKpis(){
      try{
        this.loading.kpis = true;
        const data = await this.apiGet(this.endpoints.kpis);
        this.kpis = [
          { key:"courses", label:"Cours", value: data.courses_count ?? "—", hint:"Total publiés + brouillons", tone:"sky", icon: icon("courses") },
          { key:"learners", label:"Inscrits", value: data.enrolled_total ?? "—", hint:"Apprenants cumulés", tone:"sun", icon: icon("users") },
          { key:"revenue", label:"Revenus", value: data.revenue_month ?? "—", hint:"Mois courant", tone:"sun", icon: icon("money") },
          { key:"rating", label:"Note moyenne", value: data.rating_avg ?? "—", hint:"Tous cours", tone:"sky", icon: icon("star") },
          { key:"completion", label:"Complétion", value: (data.completion_avg ?? "—") + (data.completion_avg!=null ? "%" : ""), hint:"Moyenne", tone:"sky", icon: icon("trend") },
        ];
      } catch(e){ console.error(e); }
      finally { this.loading.kpis=false; }
    },

    buildCoursesUrl(){
      const u = new URL(this.endpoints.courses, window.location.origin);
      if (this.filters.q) u.searchParams.set("q", this.filters.q);
      if (this.filters.status) u.searchParams.set("status", this.filters.status);
      if (this.filters.pricing) u.searchParams.set("pricing", this.filters.pricing);
      if (this.filters.type) u.searchParams.set("course_type", this.filters.type);
      return u.toString();
    },

    async loadCourses(){
      try{
        this.loading.courses = true;
        const data = await this.apiGet(this.buildCoursesUrl());
        this.courses = data.results || data;
      } catch(e){
        console.error(e);
        this.showToast("Erreur", "Impossible de charger les cours.");
      } finally { this.loading.courses=false; }
    },

    async openBuilder(course){
      this.selectedCourse = course;
      this.activeTab = "builder";
      await this.loadSections(course.id);
      if (this.sections.length) await this.selectSection(this.sections[0]);
      else { this.activeSection=null; this.lessons=[]; }
    },

    async loadSections(courseId){
      try{
        this.loading.sections = true;
        this.sections = await this.apiGet(this.endpoints.courseSections(courseId));
      } catch(e){
        console.error(e);
        this.showToast("Erreur", "Impossible de charger les sections.");
      } finally { this.loading.sections=false; }
    },

    async selectSection(section){
      this.activeSection = section;
      await this.loadLessons(this.selectedCourse.id, section.id);
    },

    async loadLessons(courseId, sectionId){
      try{
        this.loading.lessons = true;
        this.lessons = await this.apiGet(this.endpoints.sectionLessons(courseId, sectionId));
      } catch(e){
        console.error(e);
        this.showToast("Erreur", "Impossible de charger les leçons.");
      } finally { this.loading.lessons=false; }
    },

    async loadReviews(){
      try{ this.loading.reviews=true; const data = await this.apiGet(this.endpoints.reviews); this.reviews = data.results || data; }
      catch(e){ console.error(e); this.showToast("Erreur","Impossible de charger les avis."); }
      finally{ this.loading.reviews=false; }
    },

    async loadPayouts(){
      try{ this.loading.payouts=true; const data = await this.apiGet(this.endpoints.payouts); this.payouts = data.results || data; }
      catch(e){ console.error(e); this.showToast("Erreur","Impossible de charger les paiements."); }
      finally{ this.loading.payouts=false; }
    },

    async loadNotifications(){
      try{ this.loading.notifications=true; const data = await this.apiGet(this.endpoints.notifications); this.notifications = data.results || data; }
      catch(e){ console.error(e); }
      finally{ this.loading.notifications=false; }
    },

    openCreateCourse(){
      this.courseForm = { id:null, title:"", subtitle:"", description:"", course_type:"PROFESSIONNELLE", pricing_type:"PAID", price:0, thumbnailFile:null, preview_video_url:"" };
      this.modals.course = true;
    },

    openEditCourse(c){
      this.courseForm = {
        id: c.id,
        title: c.title || "",
        subtitle: c.subtitle || "",
        description: c.description || "",
        course_type: c.course_type || "PROFESSIONNELLE",
        pricing_type: c.pricing_type || "PAID",
        price: c.price || 0,
        thumbnailFile: null,
        preview_video_url: c.preview_video_url || ""
      };
      this.modals.course = true;
    },

    courseThumbPicked(ev){
      this.courseForm.thumbnailFile = ev.target.files?.[0] || null;
    },

    closeCourseModal(){ this.modals.course=false; },

    async saveCourse(){
      try{
        this.loading.saveCourse = true;

        const fd = new FormData();
        fd.append("title", this.courseForm.title);
        fd.append("subtitle", this.courseForm.subtitle || "");
        fd.append("description", this.courseForm.description || "");
        fd.append("course_type", this.courseForm.course_type);
        fd.append("pricing_type", this.courseForm.pricing_type);
        fd.append("price", this.courseForm.pricing_type==="FREE" ? "0" : String(this.courseForm.price || 0));
        fd.append("preview_video_url", this.courseForm.preview_video_url || "");

        if (this.courseForm.thumbnailFile){
          fd.append("thumbnail", this.courseForm.thumbnailFile);
        }

        let resp;
        if (!this.courseForm.id){
          resp = await this.apiPostForm(this.endpoints.createCourse, fd);
          this.showToast("Succès", "Cours créé.");
        } else {
          resp = await this.apiPostForm(this.endpoints.updateCourse(this.courseForm.id), fd);
          this.showToast("Succès", "Cours mis à jour.");
        }

        this.modals.course = false;
        await this.loadCourses();

        if (this.selectedCourse && resp.id === this.selectedCourse.id){
          this.selectedCourse = resp;
        }
      } catch(e){
        console.error(e);
        this.showToast("Erreur", "Impossible d’enregistrer le cours.");
      } finally { this.loading.saveCourse=false; }
    },

    async publishCourse(c){
      try{ this.loading.publish=true; await this.apiPost(this.endpoints.publishCourse(c.id), {}); this.showToast("OK","Cours publié."); await this.loadCourses(); }
      catch(e){ console.error(e); this.showToast("Erreur","Publication impossible."); }
      finally{ this.loading.publish=false; }
    },

    async archiveCourse(c){
      try{ this.loading.archive=true; await this.apiPost(this.endpoints.archiveCourse(c.id), {}); this.showToast("OK","Cours archivé."); await this.loadCourses(); }
      catch(e){ console.error(e); this.showToast("Erreur","Archivage impossible."); }
      finally{ this.loading.archive=false; }
    },

    async createSectionPrompt(){
      const title = prompt("Titre de la section ?");
      if (!title) return;
      try{ await this.apiPost(this.endpoints.createSection(this.selectedCourse.id), { title }); await this.loadSections(this.selectedCourse.id); }
      catch(e){ console.error(e); this.showToast("Erreur","Impossible de créer la section."); }
    },

    async editSectionPrompt(s){
      const title = prompt("Nouveau titre ?", s.title);
      if (!title) return;
      try{ await this.apiPost(this.endpoints.updateSection(this.selectedCourse.id, s.id), { title }); await this.loadSections(this.selectedCourse.id); }
      catch(e){ console.error(e); this.showToast("Erreur","Impossible de modifier la section."); }
    },

    async deleteSection(s){
      if (!confirm("Supprimer cette section ?")) return;
      try{
        await this.apiPost(this.endpoints.deleteSection(this.selectedCourse.id, s.id), {});
        await this.loadSections(this.selectedCourse.id);
        if (this.activeSection?.id === s.id){ this.activeSection=null; this.lessons=[]; }
      } catch(e){ console.error(e); this.showToast("Erreur","Impossible de supprimer la section."); }
    },

    async loadMediaLibrary(kind=""){
      try{
        const u = new URL(this.endpoints.mediaList, window.location.origin);
        if (kind) u.searchParams.set("kind", kind);
        this.mediaLibrary = await this.apiGet(u.toString());
      } catch(e){
        console.error(e);
        this.mediaLibrary = [];
      }
    },

    onLessonTypeChanged(){
      // recharge la library en fonction du type
      const lt = this.lessonForm.lesson_type;
      if (lt === "VIDEO") this.loadMediaLibrary("video");
      else if (lt === "FILE") this.loadMediaLibrary("doc");
      else this.loadMediaLibrary("");
    },

    openLessonEditor(l=null){
      if (!this.activeSection) return;

      if (l){
        this.lessonForm = {
          id: l.id,
          title: l.title || "",
          lesson_type: l.lesson_type || "VIDEO",
          is_preview: !!l.is_preview,
          duration_sec: l.duration_sec || 0,
          content: l.content || "",
          video_url: l.video_url || "",
          media_asset_id: l.media_asset?.id || ""
        };
      } else {
        this.lessonForm = { id:null, title:"", lesson_type:"VIDEO", is_preview:false, duration_sec:0, content:"", video_url:"", media_asset_id:"" };
      }

      this.modals.lesson = true;
      this.onLessonTypeChanged();
    },

    async saveLesson(){
      if (!this.activeSection) return;
      try{
        const payload = { ...this.lessonForm };
        // normaliser
        if (!payload.media_asset_id) payload.media_asset_id = null;

        if (!payload.id){
          await this.apiPost(this.endpoints.createLesson(this.selectedCourse.id, this.activeSection.id), payload);
        } else {
          await this.apiPost(this.endpoints.updateLesson(this.selectedCourse.id, this.activeSection.id, payload.id), payload);
        }

        this.modals.lesson = false;
        await this.loadLessons(this.selectedCourse.id, this.activeSection.id);
        await this.loadSections(this.selectedCourse.id);
        this.showToast("OK", "Leçon enregistrée.");
      } catch(e){
        console.error(e);
        this.showToast("Erreur", "Impossible d’enregistrer la leçon.");
      }
    },

    async deleteLesson(l){
      if (!confirm("Supprimer cette leçon ?")) return;
      try{
        await this.apiPost(this.endpoints.deleteLesson(this.selectedCourse.id, this.activeSection.id, l.id), {});
        await this.loadLessons(this.selectedCourse.id, this.activeSection.id);
        await this.loadSections(this.selectedCourse.id);
      } catch(e){ console.error(e); this.showToast("Erreur","Impossible de supprimer la leçon."); }
    },

    openCoursePreview(c){
      this.previewCourse = c;
      this.modals.previewCourse = true;
    },
    closeCoursePreview(){
      this.modals.previewCourse = false;
      this.previewCourse = null;
    },

    async openLessonPreview(l){
      this.previewLesson = l;
      this.previewLessonSignedUrl = "";
      this.modals.previewLesson = true;

      // Si media_asset présent -> signed url (si endpoint exists)
      if (l.media_asset?.id){
        try{
          const resp = await this.apiGet(this.endpoints.signedGet(l.media_asset.id));
          this.previewLessonSignedUrl = resp.url || "";
        } catch(e){
          console.error(e);
        }
      }
    },
    closeLessonPreview(){
      this.modals.previewLesson = false;
      this.previewLesson = null;
      this.previewLessonSignedUrl = "";
    },

    // ---------- Upload MinIO ----------
    openUploadDrawer(){
      if (!this.activeSection) { this.showToast("Info", "Choisis une section avant l’upload."); return; }
      this.upload = { file:null, kind:"video", title:"", progress:0, error:"", bindLessonId:"", upload_id:null, object_key:null };
      this.drawers.upload = true;
    },

    handleFilePicked(ev){
      const f = ev.target.files?.[0];
      if (!f) return;
      this.upload.file = f;
      if (f.type.startsWith("video/")) this.upload.kind = "video";
      else if (f.type.startsWith("audio/")) this.upload.kind = "audio";
      else this.upload.kind = "doc";
    },

    async startUpload(){
      try{
        this.upload.error = "";
        if (!this.upload.file) { this.upload.error = "Choisis un fichier."; return; }

        this.loading.upload = true;
        this.upload.progress = 1;

        // 1) init
        const initResp = await this.apiPost(this.endpoints.uploadInit, {
          filename: this.upload.file.name,
          content_type: this.upload.file.type || "application/octet-stream",
          size: this.upload.file.size,
          kind: this.upload.kind,
          title: this.upload.title || ""
        });

        this.upload.upload_id = initResp.upload_id;
        this.upload.object_key = initResp.object_key;

        // 2) PUT file
        await this.putFile(initResp.upload_url, this.upload.file, initResp.headers || {});

        // 3) finalize
        const finalizePayload = {
          upload_id: this.upload.upload_id,
          object_key: this.upload.object_key,
          kind: this.upload.kind,
          title: this.upload.title || "",
          content_type: this.upload.file.type || "application/octet-stream",
          size: this.upload.file.size,
          duration_seconds: null,
          bind: this.upload.bindLessonId ? {
            course_id: this.selectedCourse.id,
            section_id: this.activeSection.id,
            lesson_id: Number(this.upload.bindLessonId)
          } : null
        };

        await this.apiPost(this.endpoints.uploadFinalize, finalizePayload);

        this.upload.progress = 100;
        this.showToast("Succès", "Upload terminé.");

        await this.loadLessons(this.selectedCourse.id, this.activeSection.id);
        await this.loadSections(this.selectedCourse.id);

        // refresh media library
        this.onLessonTypeChanged();

        this.drawers.upload = false;

      } catch(e){
        console.error(e);
        this.upload.error = "Upload échoué. Vérifie MinIO et l’endpoint.";
        this.showToast("Erreur", "Upload échoué.");
      } finally {
        this.loading.upload = false;
      }
    },

    async putFile(uploadUrl, file, headers){
      await new Promise((resolve, reject)=>{
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        Object.entries(headers || {}).forEach(([k,v])=>xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (e)=>{
          if (e.lengthComputable){
            this.upload.progress = Math.round((e.loaded / e.total) * 100);
          }
        };
        xhr.onload = ()=> (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(xhr.status));
        xhr.onerror = ()=> reject(new Error("network"));
        xhr.send(file);
      });
    },
  }
}
