(function () {
const state = {
  limit: 20,          // ✅ API: limit (tu as 20 dans la réponse)
  offset: 0,          // ✅ API: offset
  loading: false,
  hasMore: true,
  lastQueryKey: "",
  sort: ""            // "popular" | "recent" | ""
};

const els = {
  container: document.getElementById("courses-container"),
  count: document.getElementById("courses-count"),
  loading: document.getElementById("courses-state"),
  loadMore: document.getElementById("load-more"),
  apply: document.getElementById("apply-filters"),
  reset: document.getElementById("reset-filters"),
  q: document.getElementById("filter-q"),
  level: document.getElementById("filter-level"),
  type: document.getElementById("filter-type"),
  pricing: document.getElementById("filter-pricing"),
  mine: document.getElementById("filter-mine"),
  sortPopular: document.getElementById("sort-popular"),
  sortRecent: document.getElementById("sort-recent"),
};

function debounce(fn, delay = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function getEndpoint() {
  var config = document.body ? document.body.dataset : {};
  if (config.beIsAuth === "true" && config.beLearnerExploreUrl) return config.beLearnerExploreUrl;
  return config.beExploreUrl || "#";
}

function showLoading(show) {
  if (!els.loading) return;
  els.loading.classList.toggle("hidden", !show);
}

function renderSkeleton(count = 8) {
  if (!els.container) return;
  const items = Array.from({length: count}).map(() => `
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div class="aspect-[16/9] skeleton"></div>
      <div class="p-4 space-y-3">
        <div class="h-4 rounded skeleton w-5/6"></div>
        <div class="h-3 rounded skeleton w-4/6"></div>
        <div class="h-3 rounded skeleton w-full"></div>
        <div class="h-9 rounded-xl skeleton w-full mt-2"></div>
      </div>
    </div>
  `).join("");
  els.container.innerHTML = items;
}

function money(amount, currency) {
  const n = Number(amount || 0);
  const cur = currency || "XOF";
  if (cur === "XOF") return n.toLocaleString("fr-FR") + " FCFA";
  return n.toLocaleString("fr-FR") + " " + cur;
}

function safeText(s) {
  // ``s ?? ""`` (nullish coalescing) et ``replaceAll`` cassent sur Safari
  // < 13.1 / Chrome < 85. On utilise le triplet : `== null` + replace
  // global pour rester compatible.
  var v = (s == null) ? "" : String(s);
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener("error", function(event) {
  var img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("js-course-cover-img")) return;
  var parent = img.parentElement;
  if (!parent) return;
  parent.className = "relative aspect-[16/9] bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center";
  parent.innerHTML = '<i class="fas fa-graduation-cap text-white text-5xl"></i>';
}, true);

function badge(label, color = "blue") {
  const map = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    slate: "bg-slate-100 text-slate-700",
    purple: "bg-purple-100 text-purple-700",
    rose: "bg-rose-100 text-rose-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
  };
  return `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold ${map[color] || map.blue}">${safeText(label)}</span>`;
}

function isoToFR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { year:"numeric", month:"short", day:"2-digit" });
}

function buildParams({resetOffset = false} = {}) {
  const q = (els.q.value || "").trim();
  const level = (els.level.value || "").trim();
  const type = (els.type.value || "").trim();
  const pricing = (els.pricing.value || "").trim();
  const mine = ((els.mine && els.mine.value) || "0").trim();

  if (resetOffset) {
    state.offset = 0;
    state.hasMore = true;
  }

  const params = new URLSearchParams();
  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));

  // ✅ On colle au style API que tu as montré (q / level)
  if (q) params.set("q", q);
  if (level) params.set("level", level);

  // ✅ On utilise des noms explicites côté front (si ton API attend d'autres clés, change ici)
  // Recommandé: course_type / pricing_type (aligné avec tes champs)
  if (type) params.set("course_type", type);
  if (pricing) params.set("pricing_type", pricing);

  // mine uniquement si connecté
  if (document.body && document.body.dataset.beIsAuth === "true" && mine === "1") params.set("mine", "1");

  // tri (si ton API le supporte, sinon c’est tri front fallback)
  if (state.sort) params.set("sort", state.sort);

  return params;
}

function pickThumbnail(course) {
  // ✅ API: thumbnail_url
  if (course.thumbnail_url) return course.thumbnail_url;

  // Fallback: “cover” visuel (gradient+icon) si pas d’image
  return null;
}

function renderCourseCard(course) {
  // Champs API pris en compte
  const title = course.title || "Cours";
  const subtitle = course.subtitle || "";
  const desc = course.description || "";
  const category = course.category_name || "";
  const courseType = course.course_type_label || course.course_type || "";
  const pricingLabel = course.pricing_type_label || course.pricing_type || "";
  const price = course.price;
  const currency = course.currency || "XOF";
  const pricePeriod = course.price_period || "cours";
  const status = course.status || "";
  const publishedAt = isoToFR(course.published_at);
  const companyOnly = !!course.company_only;

  const levelLabel = course.level_label || course.level || "Niveau";
  const levelColor = course.level_color || "blue";

  const enrolledCount = Number(course.enrolled_count || 0).toLocaleString("fr-FR");
  const rating = (typeof course.rating === "number") ? course.rating.toFixed(1) : (course.rating == null ? "—" : course.rating);
  const isPopular = !!course.is_popular;

  const instructorName = course.instructor_name || "Formateur";
  const instructorInitials = course.instructor_initials || (instructorName.trim()[0] || "F");

  const thumb = pickThumbnail(course);

  const detailUrl = course.detail_url || course.preview_url || "#";
  const previewUrl = course.preview_url || detailUrl;
  const enrollUrl = course.enroll_url || detailUrl;
  const previewVideoUrl = course.preview_video_url || "";

  // CTA logique (visiteur vs connecté)
  // NB: ton endpoint learner peut renvoyer is_enrolled/continue_url : on les supporte si présents
  const isEnrolled = !!course.is_enrolled;
  const continueUrl = course.continue_url || detailUrl;

  const _isAuth = !!(document.body && document.body.dataset.beIsAuth === "true");
  const ctaLabel = isEnrolled ? "Continuer" : (_isAuth ? "S'inscrire" : "Voir le cours");
  const ctaUrl = isEnrolled ? continueUrl : (_isAuth ? enrollUrl : previewUrl);

  // Prix
  const isFree = (course.pricing_type === "FREE") || Number(price) === 0;
  const priceHtml = isFree
    ? `<div class="text-right">
         <div class="text-[13px] font-bold text-green-700">Gratuit</div>
         <div class="text-[11px] text-gray-500">Accès immédiat</div>
       </div>`
    : `<div class="text-right">
         <div class="text-[13px] font-extrabold text-slate-900">${money(price, currency)}</div>
         <div class="text-[11px] text-gray-500">/ ${safeText(pricePeriod)}</div>
       </div>`;

  // Header badges
  const badges = `
    <div class="absolute top-3 left-3 flex flex-wrap gap-2">
      ${isPopular ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-yellow-500 text-white"><i class="fas fa-star mr-1"></i>Populaire</span>` : ""}
      ${badge(levelLabel, levelColor)}
      ${pricingLabel ? badge(pricingLabel, (course.pricing_type === "PAID" ? "blue" : (course.pricing_type === "HYBRID" ? "yellow" : "green"))) : ""}
      ${companyOnly ? badge("Entreprise", "purple") : ""}
    </div>
  `;

  // Udemy-like mini "hover panel" (tooltip) avec infos complètes
  const hoverPanel = `
    <div class="tooltip-box">
      <div class="bg-white border border-gray-200 rounded-2xl shadow-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-extrabold text-slate-900 text-sm leading-snug">${safeText(title)}</div>
            <div class="text-xs text-gray-500 mt-1">
              ${publishedAt ? `Publié ${publishedAt}` : ""}
              ${status ? `${publishedAt ? " • " : ""}${safeText(status)}` : ""}
            </div>
          </div>
          <div class="shrink-0">
            ${priceHtml}
          </div>
        </div>

        <div class="mt-2 flex flex-wrap gap-2">
          ${category ? badge(category, "slate") : ""}
          ${courseType ? badge(courseType, "slate") : ""}
          ${pricingLabel ? badge(pricingLabel, "slate") : ""}
        </div>

        ${desc ? `<div class="text-sm text-gray-600 mt-3 line-clamp-3">${safeText(desc)}</div>` : ""}

        <div class="mt-3 flex items-center justify-between text-xs text-gray-500">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1 text-yellow-600 font-semibold">
              <i class="fas fa-star"></i> ${rating}
            </span>
            <span class="text-gray-300">•</span>
            <span class="inline-flex items-center gap-1">
              <i class="fas fa-users"></i> ${enrolledCount}
            </span>
          </div>

          ${previewVideoUrl ? `<span class="inline-flex items-center gap-1 text-blue-600 font-semibold"><i class="fas fa-circle-play"></i> Vidéo</span>` : ""}
        </div>

        <div class="mt-3">
          <a href="${ctaUrl}"
             class="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:shadow-lg transition">
            ${safeText(ctaLabel)} <i class="fas fa-arrow-right"></i>
          </a>
        </div>
      </div>
    </div>
  `;

  // Cover: thumbnail si présent sinon gradient+icon (API: icon / color_gradient)
  const coverHtml = thumb
    ? `
      <div class="relative aspect-[16/9] bg-gray-100 overflow-hidden img-zoom">
        <img src="${thumb}" alt="${safeText(title)}"
             class="js-course-cover-img h-full w-full object-cover"
             loading="lazy"
        />
        ${badges}
      </div>
    `
    : `
      <div class="relative aspect-[16/9] bg-gradient-to-r ${(course.color_gradient || "from-blue-600 to-blue-500")} flex items-center justify-center">
        <i class="${(course.icon || "fas fa-graduation-cap")} text-white text-5xl"></i>
        ${badges}
      </div>
    `;

  return `
    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden card-lift tooltip">
      <a href="${detailUrl}" class="block">
        ${coverHtml}
      </a>

      <div class="p-4">
        <a href="${detailUrl}" class="block">
          <h3 class="text-[15px] font-extrabold text-slate-900 leading-snug line-clamp-2">${safeText(title)}</h3>
          ${subtitle ? `<p class="text-[13px] text-gray-600 mt-1 line-clamp-2">${safeText(subtitle)}</p>` : ""}
        </a>

        <div class="mt-2 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[12px] text-gray-500 flex items-center gap-2">
              ${category ? `<span class="font-semibold text-gray-700 truncate">${safeText(category)}</span>` : ""}
              ${(category && courseType) ? `<span class="text-gray-300">•</span>` : ""}
              ${courseType ? `<span class="truncate">${safeText(courseType)}</span>` : ""}
            </div>

            <div class="mt-2 flex items-center gap-2">
              <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span class="text-blue-700 font-extrabold text-xs">${safeText(instructorInitials)}</span>
              </div>
              <div class="min-w-0">
                <div class="text-[12px] font-semibold text-gray-800 truncate">${safeText(instructorName)}</div>
                <div class="text-[11px] text-gray-500 truncate">
                  ${publishedAt ? `Publié ${publishedAt}` : (status ? safeText(status) : "—")}
                </div>
              </div>
            </div>
          </div>

          <!-- rating + price (Udemy-like: price visible) -->
          <div class="shrink-0 text-right">
            <div class="text-[12px] text-yellow-600 font-extrabold flex items-center justify-end gap-1">
              <i class="fas fa-star"></i> <span>${rating}</span>
            </div>
            ${isFree
              ? `<div class="text-[13px] font-extrabold text-green-700">Gratuit</div>`
              : `<div class="text-[13px] font-extrabold text-slate-900">${money(price, currency)}</div>`
            }
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between text-[12px] text-gray-500">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1"><i class="far fa-clock"></i> ${safeText(course.duration || "—")}</span>
            <span class="text-gray-300">•</span>
            <span class="inline-flex items-center gap-1"><i class="fas fa-users"></i> ${enrolledCount}</span>
          </div>
          ${companyOnly ? `<span class="inline-flex items-center gap-1 text-purple-600 font-semibold"><i class="fas fa-building"></i> Entreprise</span>` : ``}
        </div>

        <a href="${ctaUrl}"
           class="block w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-center font-semibold hover:shadow-lg transition">
          ${safeText(ctaLabel)}
        </a>

        ${previewVideoUrl ? `
          <a href="${previewVideoUrl}" target="_blank" rel="noopener"
             class="mt-2 block text-center text-sm text-blue-600 hover:text-blue-700 font-medium">
            <i class="fas fa-circle-play mr-2"></i>Voir la vidéo de prévisualisation
          </a>
        ` : ``}
      </div>

      <!-- Hover panel -->
      ${hoverPanel}
    </div>
  `;
}

function normalizeApi(data) {
  // ✅ Ton API renvoie: success, count, total, limit, offset, results
  const results = data.results || data.courses || [];
  const total = (typeof data.total === "number") ? data.total :
                (typeof data.count === "number") ? data.count :
                results.length;

  const limit = (typeof data.limit === "number") ? data.limit : state.limit;
  const offset = (typeof data.offset === "number") ? data.offset : state.offset;

  return { results, total, limit, offset };
}

function applyClientSort(results) {
  // fallback tri côté front si l’API ne gère pas sort
  if (state.sort === "popular") {
    return [...results].sort((a,b) => {
      const ap = a.is_popular ? 1 : 0;
      const bp = b.is_popular ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const ar = Number(a.rating || 0);
      const br = Number(b.rating || 0);
      if (br !== ar) return br - ar;
      return Number(b.enrolled_count || 0) - Number(a.enrolled_count || 0);
    });
  }
  if (state.sort === "recent") {
    return [...results].sort((a,b) => {
      const da = new Date(a.published_at || 0).getTime() || 0;
      const db = new Date(b.published_at || 0).getTime() || 0;
      return db - da;
    });
  }
  return results;
}

async function fetchCourses({reset = false} = {}) {
  if (state.loading) return;
  if (!state.hasMore && !reset) return;

  state.loading = true;

  if (reset) renderSkeleton(8);
  else showLoading(true);

  const params = buildParams({resetOffset: reset});
  const queryKey = params.toString();
  state.lastQueryKey = queryKey;

  try {
    const url = `${getEndpoint()}?${params.toString()}`;
    const res = await fetch(url, {headers: {"Accept": "application/json"}});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (state.lastQueryKey !== queryKey) return;

    const norm = normalizeApi(data);
    const total = norm.total;
    const results = applyClientSort(norm.results);

    if (reset) els.container.innerHTML = "";
    els.count.textContent = String(total);

    if (!results.length && reset) {
      els.container.innerHTML = `
        <div class="col-span-full text-center py-12">
          <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-face-frown text-gray-500 text-2xl"></i>
          </div>
          <h4 class="text-lg font-semibold text-gray-800 mb-2">Aucun cours trouvé</h4>
          <p class="text-gray-600">Essayez un autre mot-clé ou modifiez les filtres.</p>
        </div>
      `;
    } else {
      els.container.insertAdjacentHTML("beforeend", results.map(renderCourseCard).join(""));
    }

    // Pagination: on se base sur total
    state.offset += state.limit;
    state.hasMore = state.offset < total;
    els.loadMore.classList.toggle("hidden", !state.hasMore);
  } catch (e) {
    console.error("fetchCourses error:", e);
    if (reset) {
      els.container.innerHTML = `
        <div class="col-span-full text-center py-12">
          <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
          </div>
          <h4 class="text-lg font-semibold text-gray-800 mb-2">Erreur de chargement</h4>
          <p class="text-gray-600">Impossible de charger les cours. Réessayez plus tard.</p>
        </div>
      `;
    }
  } finally {
    showLoading(false);
    state.loading = false;
  }
}

function resetFilters() {
  els.q.value = "";
  els.level.value = "";
  els.type.value = "";
  els.pricing.value = "";
  if (els.mine && !els.mine.disabled) els.mine.value = "0";

  state.sort = "";
  state.offset = 0;
  state.hasMore = true;

  // reset UI sort buttons
  if (els.sortPopular) els.sortPopular.classList.remove("bg-slate-900","text-white");
  if (els.sortRecent) els.sortRecent.classList.remove("bg-slate-900","text-white");

  fetchCourses({reset: true});
}

const autoSearch = debounce(() => fetchCourses({reset: true}), 350);

document.addEventListener("DOMContentLoaded", () => {
  if (!els.container || !els.count || !els.apply || !els.reset || !els.loadMore || !els.q) return;

  fetchCourses({reset: true});

  els.apply.addEventListener("click", () => fetchCourses({reset: true}));
  els.reset.addEventListener("click", resetFilters);
  els.loadMore.addEventListener("click", () => fetchCourses({reset: false}));

  els.q.addEventListener("input", autoSearch);

  [els.level, els.type, els.pricing, els.mine].forEach(el => {
    if (!el) return;
    el.addEventListener("change", () => fetchCourses({reset: true}));
  });

  // Tri (toggle) — pas d'optional chaining pour rester compat anciens
  // navigateurs.
  if (els.sortPopular) {
    els.sortPopular.addEventListener("click", () => {
      state.sort = (state.sort === "popular") ? "" : "popular";
      // UI
      els.sortPopular.classList.toggle("bg-slate-900", state.sort === "popular");
      els.sortPopular.classList.toggle("text-white", state.sort === "popular");
      if (els.sortRecent) {
        els.sortRecent.classList.remove("bg-slate-900", "text-white");
      }
      fetchCourses({reset: true});
    });
  }

  if (els.sortRecent) {
    els.sortRecent.addEventListener("click", () => {
      state.sort = (state.sort === "recent") ? "" : "recent";
      // UI
      els.sortRecent.classList.toggle("bg-slate-900", state.sort === "recent");
      els.sortRecent.classList.toggle("text-white", state.sort === "recent");
      if (els.sortPopular) {
        els.sortPopular.classList.remove("bg-slate-900", "text-white");
      }
      fetchCourses({reset: true});
    });
  }
});
}());
