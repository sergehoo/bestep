// ===== REVIEWS CONFIG =====
const REVIEWS_BASE = String(CoursePageConfig.reviewsBase || "/reviews/courses/");
const REVIEWS_PAGE_SIZE = Number(CoursePageConfig.reviewsPageSize || 6);

function reviewListUrl(courseId, offset, ordering){
  // ordering: new | top | low
  // map -> created_at desc | rating desc | rating asc
  let ord = "-created_at";
  if(ordering === "top") ord = "-rating";
  if(ordering === "low") ord = "rating";
  const params = new URLSearchParams();
  params.set("limit", String(REVIEWS_PAGE_SIZE));
  params.set("offset", String(offset || 0));
  params.set("ordering", ord); // si tu actives OrderingFilter côté DRF
  return `${REVIEWS_BASE}${courseId}/reviews/?${params.toString()}`;
}
function reviewSummaryUrl(courseId){
  return `${REVIEWS_BASE}${courseId}/reviews/summary/`;
}
function reviewMeUrl(courseId){
  return `${REVIEWS_BASE}${courseId}/reviews/me/`;
}

// ===== stars helpers =====
function starsHtml(rating, sizeClass){
  const r = Number(rating || 0);
  const full = Math.floor(r);
  const half = (r - full) >= 0.5;
  const s = [];
  for(let i=1;i<=5;i++){
    if(i <= full) s.push('<i class="fas fa-star"></i>');
    else if(i === full+1 && half) s.push('<i class="fas fa-star-half-stroke"></i>');
    else s.push('<i class="far fa-star"></i>');
  }
  return `<div class="${sizeClass||""} flex gap-1">${s.join("")}</div>`;
}

// ===== modal state =====
const ReviewUI = {
  editing: false,
  currentRating: 0,
  currentComment: "",
};

function openReviewModal({title, rating, comment, editing}){
  const modal = document.getElementById("reviewModal");
  if(!modal) return;

  ReviewUI.editing = !!editing;
  ReviewUI.currentRating = Number(rating || 0);
  ReviewUI.currentComment = comment || "";

  document.getElementById("reviewModalTitle").textContent = title || (editing ? "Modifier votre avis" : "Laisser un avis");
  document.getElementById("reviewComment").value = ReviewUI.currentComment;

  renderRatingPicker(ReviewUI.currentRating);
  hideEl("ratingError");
  hideEl("reviewSaveError");

  modal.classList.remove("hidden");
}
function closeReviewModal(){
  document.getElementById("reviewModal")?.classList.add("hidden");
}
function hideEl(id){ document.getElementById(id)?.classList.add("hidden"); }
function showEl(id){ document.getElementById(id)?.classList.remove("hidden"); }
function setErr(id, msg){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function renderRatingPicker(selected){
  const wrap = document.getElementById("ratingPicker");
  if(!wrap) return;
  wrap.innerHTML = "";
  for(let i=1;i<=5;i++){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hover:scale-[1.05] transition";
    btn.innerHTML = i <= selected ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    btn.addEventListener("click", () => {
      ReviewUI.currentRating = i;
      renderRatingPicker(i);
      setErr("ratingError", "");
    });
    wrap.appendChild(btn);
  }
}

// ===== API calls =====
async function apiFetch(url, options){
  const res = await fetch(url, options || {});
  const data = await res.json().catch(() => null);
  return { res, data };
}

async function createReview(courseId, payload){
  const csrf = getCsrfToken();
  const url = `${REVIEWS_BASE}${courseId}/reviews/`;
  return apiFetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": csrf
    },
    body: JSON.stringify(payload)
  });
}

async function updateMyReview(courseId, payload){
  const csrf = getCsrfToken();
  const url = reviewMeUrl(courseId);
  return apiFetch(url, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": csrf
    },
    body: JSON.stringify(payload)
  });
}

async function deleteMyReview(courseId){
  const csrf = getCsrfToken();
  const url = reviewMeUrl(courseId);
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "X-CSRFToken": csrf }
  });
  return res.ok;
}

// ===== rendering list =====
function reviewCardHtml(r){
  const name = r.user_name || "Apprenant";
  const rating = Number(r.rating || 0).toFixed(1);
  const comment = (r.comment || "").trim();
  const date = r.created_at ? isoToFR(r.created_at) : "";
  const commentHtml = comment
    ? `<p class="text-sm text-gray-700 mt-2 whitespace-pre-line">${safeText(comment)}</p>`
    : `<p class="text-sm text-gray-500 mt-2 italic">Aucun commentaire.</p>`;

  return `
    <div class="rounded-2xl border border-gray-200 p-4 bg-gray-50">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold text-slate-900 truncate">${safeText(name)}</div>
          <div class="text-xs text-gray-500 mt-1">${safeText(date)}</div>
        </div>
        <div class="text-yellow-600 text-sm shrink-0 flex items-center gap-2">
          <span>${starsHtml(r.rating, "")}</span>
          <span class="font-extrabold">${safeText(rating)}</span>
        </div>
      </div>
      ${commentHtml}
    </div>
  `;
}

function renderSummary(summary){
  const avg = summary?.avg;
  const count = summary?.count ?? 0;

  setText(document.getElementById("reviewRatingBig"), avg == null ? "—" : Number(avg).toFixed(1));
  setText(document.getElementById("reviewCount"), `${count.toLocaleString("fr-FR")} avis`);

  setHTML(document.getElementById("reviewStarsBig"), starsHtml(avg || 0, ""));

  // dist
  const dist = summary?.dist_pct || {1:0,2:0,3:0,4:0,5:0};
  const distWrap = document.getElementById("reviewDist");
  const pctClass = (value) => {
    const bounded = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    return `w-pct-${bounded}`;
  };
  if(distWrap){
    distWrap.innerHTML = [5,4,3,2,1].map(k => {
      const pct = Number(dist[k] || 0);
      return `
        <div class="flex items-center gap-3 text-sm">
          <div class="w-10 text-gray-600">${k}★</div>
          <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-yellow-500 ${pctClass(pct)}"></div>
          </div>
          <div class="w-10 text-gray-500 text-right">${pct}%</div>
        </div>
      `;
    }).join("");
  }
}

function renderMyReview(me){
  const wrap = document.getElementById("myReviewWrap");
  if(!wrap) return;

  if(!me?.exists){
    wrap.classList.add("hidden");
    return;
  }

  const r = me.review;
  wrap.classList.remove("hidden");
  setHTML(document.getElementById("myReviewStars"), starsHtml(r.rating, ""));
  setText(document.getElementById("myReviewText"), (r.comment || "").trim() || "—");
}

// ===== loader state =====
const ReviewsState = {
  offset: 0,
  ordering: "new",
  hasMore: true,
  loading: false
};

async function loadReviewsSummary(courseId){
  const hint = document.getElementById("reviewsHint");
  try{
    const { res, data } = await apiFetch(reviewSummaryUrl(courseId));
    if(!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
    renderSummary(data);
    if(hint) hint.textContent = "Lisez les retours des apprenants et partagez votre expérience.";
  }catch(e){
    if(hint) hint.textContent = "Impossible de charger le résumé des avis.";
    console.error(e);
  }
}

async function loadMyReview(courseId){
  if(!IS_AUTH) return;
  try{
    const { res, data } = await apiFetch(reviewMeUrl(courseId));
    if(!res.ok) return;
    renderMyReview(data);
  }catch(e){
    console.error(e);
  }
}

async function loadReviewsList(courseId, reset){
  if(ReviewsState.loading) return;
  ReviewsState.loading = true;

  const list = document.getElementById("reviewsList");
  const moreBtn = document.getElementById("reviewsMore");
  if(!list || !moreBtn){ ReviewsState.loading = false; return; }

  if(reset){
    ReviewsState.offset = 0;
    ReviewsState.hasMore = true;
    list.innerHTML = "";
    moreBtn.classList.add("hidden");
  }

  try{
    const url = reviewListUrl(courseId, ReviewsState.offset, ReviewsState.ordering);
    const { res, data } = await apiFetch(url);
    if(!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);

    // DRF pagination (results) ou liste simple
    const items = Array.isArray(data) ? data : (data?.results || []);
    const next = data?.next;

    if(items.length){
      list.insertAdjacentHTML("beforeend", items.map(reviewCardHtml).join(""));
    } else if(reset){
      list.innerHTML = `
        <div class="rounded-2xl border border-gray-200 p-4 bg-gray-50 text-gray-700">
          Aucun avis pour le moment. Soyez le premier à laisser un retour !
        </div>
      `;
    }

    ReviewsState.offset += items.length;
    ReviewsState.hasMore = !!next || (items.length === REVIEWS_PAGE_SIZE);

    moreBtn.classList.toggle("hidden", !ReviewsState.hasMore);

  }catch(e){
    console.error(e);
    if(reset){
      list.innerHTML = `
        <div class="rounded-2xl border border-red-200 p-4 bg-red-50 text-red-700">
          Impossible de charger les avis. (${safeText(e.message || e)})
        </div>
      `;
    }
  }finally{
    ReviewsState.loading = false;
  }
}

// ===== bind UI =====
function bindReviews(courseId){
  // open modal
  document.getElementById("openReviewModal")?.addEventListener("click", async () => {
    if(!IS_AUTH) return loginWithNext(window.location.pathname + "#tab-reviews");

    // si avis existant → éditer
    try{
      const { res, data } = await apiFetch(reviewMeUrl(courseId));
      if(res.ok && data?.exists){
        openReviewModal({
          title: "Modifier votre avis",
          rating: data.review.rating,
          comment: data.review.comment,
          editing: true
        });
      }else{
        openReviewModal({ title: "Laisser un avis", rating: 0, comment: "", editing: false });
      }
    }catch{
      openReviewModal({ title: "Laisser un avis", rating: 0, comment: "", editing: false });
    }
  });

  // close modal
  document.getElementById("closeReviewModal")?.addEventListener("click", closeReviewModal);
  document.getElementById("reviewCancel")?.addEventListener("click", closeReviewModal);
  document.getElementById("reviewModal")?.addEventListener("click", (e) => {
    if(e.target?.id === "reviewModal") closeReviewModal();
  });

  // save
  document.getElementById("reviewSave")?.addEventListener("click", async () => {
    if(!IS_AUTH) return loginWithNext(window.location.pathname);

    const rating = Number(ReviewUI.currentRating || 0);
    const comment = document.getElementById("reviewComment")?.value || "";

    if(rating < 1 || rating > 5){
      setErr("ratingError", "Choisissez une note entre 1 et 5.");
      return;
    }

    setErr("reviewSaveError", "");
    const btn = document.getElementById("reviewSave");
    btn.classList.add("opacity-80", "pointer-events-none");
    btn.textContent = "Envoi…";

    try{
      let r;
      if(ReviewUI.editing){
        r = await updateMyReview(courseId, { rating, comment });
      }else{
        r = await createReview(courseId, { rating, comment });
      }

      if(r.res.status === 401 || r.res.status === 403){
        return loginWithNext(window.location.pathname);
      }
      if(!r.res.ok){
        throw new Error(r.data?.detail || "Impossible d’enregistrer l’avis.");
      }

      closeReviewModal();

      // refresh summary + my review + list (reset)
      await loadReviewsSummary(courseId);
      await loadMyReview(courseId);
      await loadReviewsList(courseId, true);

    }catch(e){
      setErr("reviewSaveError", e.message || "Erreur.");
    }finally{
      btn.classList.remove("opacity-80", "pointer-events-none");
      btn.textContent = "Publier";
    }
  });

  // sort
  document.getElementById("reviewsSort")?.addEventListener("change", (e) => {
    ReviewsState.ordering = e.target.value || "new";
    loadReviewsList(courseId, true);
  });

  // more
  document.getElementById("reviewsMore")?.addEventListener("click", () => {
    loadReviewsList(courseId, false);
  });

  // edit / delete my review
  document.getElementById("editMyReview")?.addEventListener("click", async () => {
    if(!IS_AUTH) return;
    const { res, data } = await apiFetch(reviewMeUrl(courseId));
    if(res.ok && data?.exists){
      openReviewModal({
        title: "Modifier votre avis",
        rating: data.review.rating,
        comment: data.review.comment,
        editing: true
      });
    }
  });

  document.getElementById("deleteMyReview")?.addEventListener("click", async () => {
    if(!IS_AUTH) return;
    if(!confirm("Supprimer votre avis ?")) return;

    const ok = await deleteMyReview(courseId);
    if(ok){
      await loadReviewsSummary(courseId);
      await loadMyReview(courseId);
      await loadReviewsList(courseId, true);
    }
  });
}

// ===== init reviews (call this inside your DOMContentLoaded after loadCourse()) =====
function initReviews(courseId){
  bindReviews(courseId);
  loadReviewsSummary(courseId);
  loadMyReview(courseId);
  loadReviewsList(courseId, true);
}
