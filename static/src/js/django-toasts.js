(function () {
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.Swal) return;

    const toasts = Array.from(document.querySelectorAll("#django-messages [data-toast]"));
    if (!toasts.length) return;

    const Toast = window.Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 5000,
      timerProgressBar: true,
      background: "#ffffff",
      color: "#1e293b",
      customClass: {
        popup: "shadow-medical-lg border border-gray-200 rounded-xl",
      },
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", window.Swal.stopTimer);
        toast.addEventListener("mouseleave", window.Swal.resumeTimer);
      },
      showClass: { popup: "animate__animated animate__fadeInRight animate__faster" },
      hideClass: { popup: "animate__animated animate__fadeOutRight animate__faster" },
    });

    toasts.forEach((node) => {
      Toast.fire({
        icon: node.dataset.icon || "info",
        iconColor: node.dataset.iconColor || "#0ea5e9",
        title: node.dataset.title || "",
      });
    });
  });
}());
