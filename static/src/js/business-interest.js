(function () {
  function toggleModal(modal, visible) {
    if (!modal) return;
    modal.classList.toggle("hidden", !visible);
    modal.classList.toggle("flex", visible);
    document.body.classList.toggle("overflow-hidden", visible);
  }

  function selectCourse(courseId) {
    if (!courseId) return;
    document.querySelectorAll(".interest-course-checkbox").forEach((checkbox) => {
      checkbox.checked = checkbox.value === String(courseId);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const interestModal = document.getElementById("interest-modal");
    const closeInterestModal = document.getElementById("close-interest-modal");
    const mobileMenuButton = document.getElementById("mobile-menu-btn");
    const mobileMenu = document.getElementById("mobile-menu");

    const showInterestModal = (courseId) => {
      toggleModal(interestModal, true);
      selectCourse(courseId);
    };

    const hideInterestModal = () => toggleModal(interestModal, false);

    document.querySelectorAll(".open-interest-modal").forEach((button) => {
      button.addEventListener("click", () => showInterestModal());
    });

    [
      "open-interest-modal",
      "open-interest-modal-hero",
      "open-interest-modal-list",
      "open-interest-modal-bottom",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => showInterestModal());
    });

    document.querySelectorAll(".interest-course-btn").forEach((button) => {
      button.addEventListener("click", () => showInterestModal(button.dataset.courseId));
    });

    closeInterestModal?.addEventListener("click", hideInterestModal);

    interestModal?.addEventListener("click", (event) => {
      if (event.target === interestModal) hideInterestModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideInterestModal();
    });

    mobileMenuButton?.addEventListener("click", () => {
      mobileMenu?.classList.toggle("hidden");
    });
  });
}());
