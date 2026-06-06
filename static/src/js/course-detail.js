// ---------- helpers ----------
/**
 * Convertit une URL vidéo "publique" (YouTube share, watch, shorts, Vimeo)
 * vers son URL embed officielle (acceptée par X-Frame-Options et CSP frame-src).
 * Copie locale — voir learner-course-player.js pour la version maître.
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

const CoursePageConfig = document.body ? document.body.dataset : {};
const courseId = Number(CoursePageConfig.courseId || 0);
const IS_AUTH = CoursePageConfig.isAuth === "true";
const PUBLIC_DETAIL_BASE = String(CoursePageConfig.publicDetailBase || "/api/courses/0/").replace("/0/", "/");
const LEARNER_DETAIL_BASE = String(CoursePageConfig.learnerDetailBase || "/api/learner/courses/0/").replace("/0/", "/");
const PLAYER_PAGE_BASE = String(CoursePageConfig.playerPageBase || "/dashboard/learner/courses/0/").replace("/0/", "/");
function money(amount, currency) {
  const n = Number(amount || 0);
  const cur = currency || "XOF";
  if (cur === "XOF") return n.toLocaleString("fr-FR") + " FCFA";
  return n.toLocaleString("fr-FR") + " " + cur;
}
function safeText(s) { return String(s ?? ""); }
document.addEventListener("error", function(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("js-course-thumb")) return;
  const parent = img.parentElement;
  if (!parent) return;
  parent.className = "aspect-[16/9] bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center";
  parent.innerHTML = '<i class="fas fa-graduation-cap text-white text-4xl"></i>';
}, true);
function isoToFR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { year:"numeric", month:"long", day:"2-digit" });
}
function getIdFromPath(){
  let m = window.location.pathname.match(/\/landinghome\/courses\/(\d+)\//);
  if (m) return Number(m[1]);
  m = window.location.pathname.match(/\/courses\/(\d+)\//);
  return m ? Number(m[1]) : null;
}
function setHTML(el, html){ if(el) el.innerHTML = html; }
function setText(el, txt){ if(el) el.textContent = txt; }
function badge(label, cls){
  return `<span class="px-3 py-1 rounded-full text-[11px] font-semibold ${cls}">${label}</span>`;
}
function firstInitials(name){
  name = (name||"").trim();
  if(!name) return "F";
  const parts = name.split(/\s+/).filter(Boolean);
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function embedMedia(targetEl, thumbnailUrl, fallbackGradientClass, iconClass){
  if(!targetEl) return;

  const thumb = thumbnailUrl ? `
    <img src="${thumbnailUrl}" alt="" class="w-full h-full object-cover" loading="lazy">
  ` : "";

  const fallback = `
    <div class="absolute inset-0 flex items-center justify-center">
      <i class="${iconClass || 'fas fa-graduation-cap'} text-white text-5xl"></i>
    </div>
  `;

  targetEl.className = "relative aspect-[16/9] overflow-hidden " + (thumbnailUrl ? "bg-gray-100" : ("bg-gradient-to-r " + (fallbackGradientClass || "from-blue-600 to-blue-500")));
  targetEl.innerHTML = `
    ${thumb}
    ${thumbnailUrl ? "" : fallback}
    <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent"></div>
  `;

  if(thumbnailUrl){
    const img = targetEl.querySelector("img");
    if(img){
      img.addEventListener("error", () => {
        targetEl.className = "relative aspect-[16/9] overflow-hidden bg-gradient-to-r " + (fallbackGradientClass || "from-blue-600 to-blue-500");
        targetEl.innerHTML = `
          ${fallback}
          <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent"></div>
        `;
      }, { once: true });
    }
  }
}

// ---------- tabs ----------
function setupTabs(){
  const btns = document.querySelectorAll(".tab-btn");
  const panels = {
    overview: document.getElementById("tab-overview"),
    content: document.getElementById("tab-content"),
    instructor: document.getElementById("tab-instructor"),
    reviews: document.getElementById("tab-reviews")
  };

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      btns.forEach(b => {
        const isActive = b === btn;
        b.classList.toggle("bg-slate-900", isActive);
        b.classList.toggle("text-white", isActive);
        b.classList.toggle("border", !isActive);
        b.classList.toggle("border-gray-200", !isActive);
        b.classList.toggle("text-gray-700", !isActive);
        b.classList.toggle("hover:bg-gray-50", !isActive);
      });
      Object.keys(panels).forEach(k => panels[k]?.classList.toggle("hidden", k !== tab));
    });
  });
}

// ---------- video modal ----------
function openVideo(url){
  const modal = document.getElementById("videoModal");
  const frame = document.getElementById("videoFrame");
  if(!modal || !frame) return;
  // Normalise youtu.be / watch?v= → /embed/ pour passer X-Frame-Options.
  frame.src = toEmbedUrl(url);
  modal.classList.remove("hidden");
}
function closeVideo(){
  const modal = document.getElementById("videoModal");
  const frame = document.getElementById("videoFrame");
  if(!modal || !frame) return;
  frame.src = "";
  modal.classList.add("hidden");
}
document.getElementById("closeVideo")?.addEventListener("click", closeVideo);
document.getElementById("videoModal")?.addEventListener("click", (e) => {
  if(e.target?.id === "videoModal") closeVideo();
});

// ---------- curriculum fallback ----------
function buildCurriculumFromText(description){
  const txt = (description || "").trim();
  if(!txt) return [];

  const lines = txt.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const bullets = [];
  lines.forEach(l => {
    const parts = l.split(/•|·|-\s+/).map(x => x.trim()).filter(Boolean);
    parts.forEach(p => { if(p.length >= 8 && p.length <= 120) bullets.push(p); });
  });

  const items = bullets.length ? bullets.slice(0, 12) : [txt.slice(0, 140) + (txt.length>140 ? "…" : "")];
  const chunks = [];
  const perSection = 4;
  for(let i=0;i<items.length;i+=perSection){ chunks.push(items.slice(i, i+perSection)); }

  return chunks.map((lessons, idx) => ({
    title: `Section ${idx+1}`,
    lessons: lessons.map((t) => ({ title: t, type: "Leçon", duration: "—" }))
  }));
}

function renderCurriculum(sections){
  const wrap = document.getElementById("curriculum");
  const skel = document.getElementById("content-skel");
  if(!wrap || !skel) return;

  skel.classList.add("hidden");
  wrap.classList.remove("hidden");

  if(!sections?.length){
    wrap.innerHTML = `
      <div class="rounded-2xl border border-gray-200 p-4 bg-gray-50 text-gray-700">
        Aucun contenu détaillé n’est encore publié pour ce cours.
      </div>
    `;
    return;
  }

  wrap.innerHTML = sections.map((sec, i) => {
    const lessonHtml = (sec.lessons||[]).map(ls => `
      <div class="flex items-start justify-between gap-4 py-2">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900 truncate">
            <i class="far fa-circle-play text-gray-400 mr-2"></i>${safeText(ls.title)}
          </div>
          <div class="text-xs text-gray-500 mt-0.5">${safeText(ls.type || "Leçon")}</div>
        </div>
        <div class="text-xs text-gray-500 shrink-0">${safeText(ls.duration || "—")}</div>
      </div>
    `).join("");

    return `
      <details class="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <summary class="cursor-pointer select-none px-4 py-4 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-extrabold text-slate-900">${safeText(sec.title || ("Section " + (i+1)))}</div>
            <div class="text-xs text-gray-500 mt-1">${(sec.lessons?.length || 0)} leçons</div>
          </div>
          <i class="fas fa-chevron-down text-gray-400"></i>
        </summary>
        <div class="px-4 pb-4 border-t">
          ${lessonHtml}
        </div>
      </details>
    `;
  }).join("");
}

// ---------- learn list fallback ----------
function buildLearnList(course){
  const outcomes = course.learning_outcomes || course.outcomes || null;
  if(Array.isArray(outcomes) && outcomes.length) return outcomes.slice(0, 8);

  const lvl = (course.level || "").toLowerCase();
  const isAdv = lvl === "advanced";
  const isInter = lvl === "intermediate";

  const base = [
    "Construire un budget simple et efficace",
    "Mettre en place une stratégie d’épargne durable",
    "Comprendre les erreurs financières courantes",
    "Suivre vos dépenses et optimiser vos objectifs"
  ];
  const plus = isAdv ? [
    "Structurer un plan d’investissement et gérer le risque",
    "Analyser vos performances et ajuster votre stratégie",
    "Mettre en place des indicateurs (KPI) personnels"
  ] : isInter ? [
    "Automatiser votre épargne et planifier vos échéances",
    "Évaluer des opportunités et prioriser vos choix",
    "Améliorer votre discipline financière"
  ] : [
    "Créer des habitudes d’épargne dès la première semaine",
    "Éviter les pièges et gagner en confiance",
    "Appliquer des méthodes simples au quotidien"
  ];

  return [...base, ...plus].slice(0, 8);
}
 const LOGIN_URL = CoursePageConfig.loginUrl || "/accounts/login/";
// ============== RELATED COURSES ==============
function getExploreEndpoint() {
  return CoursePageConfig.exploreUrl || "/landinghome/public/courses/";
}
function normalizeExploreResponse(data){
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.courses)) return data.courses;
  return [];
}
function normalizeDetailUrl(course) {
const u = String(course?.detail_url || course?.preview_url || "").trim();

if (u) {
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) {
    return u;
  }
}

if (course?.id) {
  return `${PUBLIC_DETAIL_BASE}${course.id}/`;
}

return "#";
}
function renderMiniCourseCard(course) {
  const title = course.title || "Cours";
  const subtitle = course.subtitle || "";
  const instructor = course.instructor_name || course.instructor?.full_name || "Formateur";
  const rating = (typeof course.rating === "number") ? course.rating.toFixed(1) : (course.rating ?? "—");

  const isFree = (course.pricing_type === "FREE") || Number(course.price) === 0;
  const priceTxt = isFree ? "Gratuit" : money(course.price, course.currency);

  const detailUrl = normalizeDetailUrl(course);
  const thumb = course.thumbnail_url;

  const cover = thumb
    ? `<img src="${thumb}" class="js-course-thumb w-full h-full object-cover" loading="lazy">`
    : `<div class="w-full h-full flex items-center justify-center">
        <i class="fas fa-graduation-cap text-white text-4xl"></i>
      </div>`;

  const coverWrapClass = thumb
    ? "aspect-[16/9] bg-gray-100 overflow-hidden"
    : "aspect-[16/9] bg-gradient-to-r from-blue-600 to-blue-500 overflow-hidden";

  return `
    <div class="rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition">
      <a href="${detailUrl}" class="block ${coverWrapClass}">${cover}</a>
      <div class="p-4">
        <a href="${detailUrl}" class="block">
          <div class="font-extrabold text-slate-900 text-[14px] leading-snug line-clamp-2">${safeText(title)}</div>
          ${subtitle ? `<div class="text-[12px] text-gray-600 mt-1 line-clamp-2">${safeText(subtitle)}</div>` : ""}
        </a>

        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[12px] text-gray-500 truncate">${safeText(instructor)}</div>
            <div class="text-[12px] text-yellow-600 font-extrabold mt-1 flex items-center gap-1">
              <i class="fas fa-star"></i> <span>${safeText(rating)}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-[13px] font-extrabold ${isFree ? "text-green-700" : "text-slate-900"}">
              ${safeText(priceTxt)}
            </div>
          </div>
        </div>

        <a href="${detailUrl}"
           class="mt-3 block text-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:shadow transition">
          Voir
        </a>
      </div>
    </div>
  `;
}

async function loadRelatedCourses(currentCourse) {
  const grid  = document.getElementById("related-grid");
  const skel  = document.getElementById("related-skel");
  const empty = document.getElementById("related-empty");
  const error = document.getElementById("related-error");

  if (!grid || !skel || !empty || !error) return;

  skel.classList.remove("hidden");
  grid.classList.add("hidden");
  empty.classList.add("hidden");
  error.classList.add("hidden");

  try {
    const endpoint = getExploreEndpoint();
    const params = new URLSearchParams();
    params.set("limit", "12");
    params.set("offset", "0");

    if (currentCourse.category_name) params.set("q", currentCourse.category_name);
    else if (currentCourse.course_type) params.set("type", currentCourse.course_type);

    const url = `${endpoint}?${params.toString()}`;

    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`Explore HTTP ${res.status}`);

    const data = await res.json();
    const items = normalizeExploreResponse(data);

    const results = items
      .filter(x => x && Number(x.id) !== Number(currentCourse.id))
      .slice(0, 6);

    skel.classList.add("hidden");

    if (!results.length) {
      empty.classList.remove("hidden");
      return;
    }

    grid.innerHTML = results.map(renderMiniCourseCard).join("");
    grid.classList.remove("hidden");

  } catch (e) {
    console.error("related courses error:", e);
    skel.classList.add("hidden");
    error.classList.remove("hidden");
    error.innerHTML = `
      <div class="font-semibold">Impossible de charger les cours similaires.</div>
      <div class="text-sm mt-1 opacity-90">Détail : ${safeText(e.message || e)}</div>
    `;
  }
}

// ============== CTA / INSCRIPTION / CONTINUER (FIX REFRESH) ==============
function playerPageUrl(courseId){
  return `${PLAYER_PAGE_BASE}${courseId}/`;
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}
function getCsrfToken() { return getCookie("csrftoken"); }

function loginWithNext(nextUrl) {
const next = encodeURIComponent(nextUrl || (window.location.pathname + window.location.search));
window.location.href = `${LOGIN_URL}?next=${next}`;
}

function lockButtons(btns, label){
  btns.forEach(b => {
    b.dataset.originalText = b.textContent;
    b.classList.add("opacity-80", "pointer-events-none");
    b.textContent = label || "Veuillez patienter…";
  });
}
function unlockButtons(btns){
  btns.forEach(b => {
    b.classList.remove("opacity-80", "pointer-events-none");
    b.textContent = b.dataset.originalText || b.textContent;
  });
}

async function enrollCourseApi(courseId) {
  const csrf = getCsrfToken();
  if (!csrf) throw new Error("CSRF token introuvable (csrftoken).");

  const res = await fetch("/api/learner/enrollments/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": csrf
    },
    body: JSON.stringify({ course_id: courseId })
  });

  if (res.status === 401 || res.status === 403) {
    loginWithNext(playerPageUrl(courseId));
    return { ok: false, data: null };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Erreur inscription (HTTP ${res.status})`);

  return { ok: true, data };
}

// ✅ IMPORTANT : pour éviter le "refresh", on neutralise le comportement <a href="#">
// et on gère la navigation via JS uniquement.
function wireCtaButtons(mode, courseId) {
  // 1) on récupère
  const deskCta = document.getElementById("deskCta");
  const mobileCta = document.getElementById("mobileCta");
  const btns = [deskCta, mobileCta].filter(Boolean);

  // 2) on remplace les noeuds pour supprimer tous anciens listeners (anti double-bind)
  btns.forEach(btn => {
    btn.setAttribute("href", "#");
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
  });

  // 3) on re-sélectionne après clone
  const desk = document.getElementById("deskCta");
  const mob  = document.getElementById("mobileCta");
  const btns2 = [desk, mob].filter(Boolean);

  // 4) label
  if (mode === "continue") btns2.forEach(b => b.textContent = "Continuer");
  else if (mode === "enroll") btns2.forEach(b => b.textContent = "S'inscrire");
  else btns2.forEach(b => b.textContent = "Voir le cours");

  // 5) click behavior
  btns2.forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // preview : on force login puis retour sur player
      if (mode === "preview") {
        return loginWithNext(playerPageUrl(courseId));
      }

      // continue : redirection directe vers la page lecture (TemplateView)
      if (mode === "continue") {
        window.location.href = playerPageUrl(courseId);
        return;
      }

      // enroll : POST puis redirect player
      if (mode === "enroll") {
        if (!IS_AUTH) return loginWithNext(playerPageUrl(courseId));

        lockButtons(btns2, "Inscription…");
        try {
          const r = await enrollCourseApi(courseId);
          if (!r.ok) return;
          window.location.href = playerPageUrl(courseId);
        } catch (e) {
          console.error(e);
          unlockButtons(btns2);
          alert(e.message || "Impossible de s'inscrire.");
        }
      }
    }, { passive: false });
  });
}

// ---------- main loader ----------
async function loadCourse(){
const id = courseId || getIdFromPath();
if(!id) return;

const apiUrl = IS_AUTH
  ? `${LEARNER_DETAIL_BASE}${id}/`
  : `${PUBLIC_DETAIL_BASE}${id}/`;

try{
  const res = await fetch(apiUrl, {headers:{Accept:"application/json"}});
  if(!res.ok) throw new Error("HTTP " + res.status);
  const c = await res.json();

    loadRelatedCourses(c);

    document.title = `Best-Épargne • ${c.title || "Cours"}`;
    setText(document.getElementById("crumb-title"), c.title || "Détails");
    setText(document.getElementById("title"), c.title || "Cours");
    setText(document.getElementById("subtitle"), c.subtitle || "");

    const ratingVal = (typeof c.rating === "number") ? c.rating : (typeof c.rating_avg === "number" ? c.rating_avg : null);
    setText(document.getElementById("rating"), ratingVal != null ? ratingVal.toFixed(1) : "—");
    const rc = Number(c.rating_count || 0);
    setText(document.getElementById("ratingCount"), rc ? `(${rc.toLocaleString("fr-FR")} avis)` : "");
    setText(document.getElementById("enrolledCount"), Number(c.enrolled_count || 0).toLocaleString("fr-FR"));
    setText(document.getElementById("duration"), c.duration || "—");
    setText(document.getElementById("levelLabel"), c.level_label || c.level || "Niveau");

    setText(document.getElementById("instructorName"), c.instructor_name || c.instructor?.full_name || "Formateur");
    setText(document.getElementById("publishedAt"), c.published_at ? `Dernière mise à jour : ${isoToFR(c.published_at)}` : "—");
    setText(document.getElementById("categoryName"), c.category_name || "—");

    const badges = [];
    if(c.course_type_label || c.course_type) badges.push(badge(safeText(c.course_type_label || c.course_type), "bg-white/10 text-white"));
    if(c.pricing_type_label || c.pricing_type) badges.push(badge(safeText(c.pricing_type_label || c.pricing_type), "bg-white/10 text-white"));
    if(c.company_only) badges.push(badge("Entreprise", "bg-purple-500/20 text-purple-100"));
    if(c.is_popular) badges.push(badge("Populaire", "bg-yellow-500 text-white"));
    setHTML(document.getElementById("heroBadges"), badges.join(""));

    setText(document.getElementById("desc"), c.description || "");
    setText(document.getElementById("desc-full"), c.description || "");

    const learn = buildLearnList(c);
    const learnList = document.getElementById("learn-list");
    if(learnList){
      learnList.innerHTML = learn.map(x => `
        <li class="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <i class="fas fa-check text-green-600 mt-0.5"></i>
          <span>${safeText(x)}</span>
        </li>
      `).join("");
    }
    document.getElementById("learn-skel")?.classList.add("hidden");
    document.getElementById("learn-list")?.classList.remove("hidden");

    document.getElementById("desc-skel")?.classList.add("hidden");
    document.getElementById("desc-wrap")?.classList.remove("hidden");

    const instrName = c.instructor_name || c.instructor?.full_name || "Formateur";
    setText(document.getElementById("instrName"), instrName);
    setText(document.getElementById("instrInitials"), c.instructor_initials || firstInitials(instrName));
    setText(document.getElementById("instrRating"), ratingVal != null ? ratingVal.toFixed(1) : "—");
    setText(document.getElementById("instrStudents"), Number(c.enrolled_count || 0).toLocaleString("fr-FR"));
    setText(document.getElementById("instrCourses"), c.instructor_courses_count != null ? String(c.instructor_courses_count) : "—");
    document.getElementById("instr-skel")?.classList.add("hidden");
    document.getElementById("instr")?.classList.remove("hidden");

    setText(document.getElementById("reviewRatingBig"), ratingVal != null ? ratingVal.toFixed(1) : "—");
    setText(document.getElementById("reviewCount"), rc ? `${rc.toLocaleString("fr-FR")} avis` : "— avis");

    const gradient = c.color_gradient || "from-blue-600 to-blue-500";
    const icon = c.icon || "fas fa-graduation-cap";
    embedMedia(document.getElementById("deskMedia"), c.thumbnail_url, gradient, icon);
    embedMedia(document.getElementById("mobileMedia"), c.thumbnail_url, gradient, icon);

    const previewVideoUrl = c.preview_video_url || "";
    const canVideo = !!previewVideoUrl;
    const deskPlay = document.getElementById("deskPlayBtn");
    const mobPlay = document.getElementById("mobilePlayBtn");
    if(canVideo){
      deskPlay?.classList.remove("hidden");
      mobPlay?.classList.remove("hidden");
      deskPlay?.addEventListener("click", () => openVideo(previewVideoUrl));
      mobPlay?.addEventListener("click", () => openVideo(previewVideoUrl));
    }

    const isFree = (c.pricing_type === "FREE") || Number(c.price) === 0;
    const priceText = isFree ? "Gratuit" : money(c.price, c.currency);
    const period = c.price_period ? ` / ${c.price_period}` : "";
    setText(document.getElementById("deskPrice"), priceText);
    setText(document.getElementById("mobilePrice"), priceText);
    setText(document.getElementById("deskPriceHint"), isFree ? "Accès immédiat" : ("Paiement unique" + period));
    setText(document.getElementById("mobilePriceHint"), isFree ? "Accès immédiat" : ("Paiement unique" + period));

    setText(document.getElementById("deskAccess"), c.is_enrolled ? "Déjà inscrit" : (isFree ? "Gratuit" : "Immédiat"));
    setText(document.getElementById("mobileAccess"), c.is_enrolled ? "Déjà inscrit" : (isFree ? "Gratuit" : "Immédiat"));

    // ✅ CTA MODE (continue/enroll/preview)
    if (c.is_enrolled) {
      wireCtaButtons("continue", id);
    } else if (IS_AUTH) {
      wireCtaButtons("enroll", id);
    } else {
      wireCtaButtons("preview", id);
    }

    // curriculum
    const sections = c.sections || c.curriculum || null;
    const curriculum = Array.isArray(sections) && sections.length ? sections : buildCurriculumFromText(c.description);
    renderCurriculum(curriculum);

    // show blocks
    document.getElementById("hero-skel")?.classList.add("hidden");
    document.getElementById("hero")?.classList.remove("hidden");

    document.getElementById("desk-card-skel")?.classList.add("hidden");
    document.getElementById("desk-card")?.classList.remove("hidden");

    document.getElementById("mobile-card-skel")?.classList.add("hidden");
    document.getElementById("mobile-card")?.classList.remove("hidden");

    // description expand
    const moreBtn = document.getElementById("descMoreBtn");
    const descWrap = document.getElementById("desc-wrap");
    const full = document.getElementById("desc-full");
    if(moreBtn && descWrap && full){
      let expanded = false;
      if((c.description || "").length < 260){
        moreBtn.classList.add("hidden");
      } else {
        descWrap.style.maxHeight = "240px";
        descWrap.style.overflow = "hidden";
        moreBtn.addEventListener("click", () => {
          expanded = !expanded;
          if(expanded){
            descWrap.classList.add("hidden");
            full.classList.remove("hidden");
            moreBtn.innerHTML = `Afficher moins <i class="fas fa-chevron-up ml-1 text-xs"></i>`;
            full.insertAdjacentElement("beforebegin", moreBtn);
          } else {
            full.classList.add("hidden");
            descWrap.classList.remove("hidden");
            moreBtn.innerHTML = `Afficher plus <i class="fas fa-chevron-down ml-1 text-xs"></i>`;
            descWrap.appendChild(moreBtn);
          }
        });
      }
    }

    // wishlist mock
    function wish(btn){
      if(!btn) return;
      btn.addEventListener("click", () => {
        const liked = btn.getAttribute("data-liked") === "1";
        btn.setAttribute("data-liked", liked ? "0" : "1");
        btn.innerHTML = liked
          ? `<i class="far fa-heart mr-2"></i>Ajouter à la liste`
          : `<i class="fas fa-heart mr-2 text-rose-600"></i>Ajouté`;
      });
    }
    wish(document.getElementById("deskWishlist"));
    wish(document.getElementById("mobileWishlist"));

  }catch(e){
    console.error(e);
    const heroSkel = document.getElementById("hero-skel");
    if(heroSkel){
      heroSkel.innerHTML = `
        <div class="bg-white/10 border border-white/10 rounded-2xl p-5 text-slate-200">
          <div class="font-extrabold text-white text-lg">Impossible de charger ce cours</div>
          <div class="mt-2 text-sm text-slate-300">Veuillez réessayer plus tard.</div>
          <div class="mt-2 text-xs text-slate-300 opacity-90">Détail : ${safeText(e.message || e)}</div>
          <a href="/#cours" class="inline-flex mt-4 items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-900 font-semibold">
            Retour au catalogue <i class="fas fa-arrow-right text-xs"></i>
          </a>
        </div>
      `;
    }
  }
}

// init
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadCourse();
  const id = courseId || getIdFromPath();
  if(id && typeof initReviews === "function") initReviews(id);
  document.getElementById("expandAll")?.addEventListener("click", () => {
    document.querySelectorAll("#curriculum details").forEach(d => d.open = true);
  });
});
