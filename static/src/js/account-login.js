(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("toggle-password");
    if (!button) return;

    const passwordInput = document.querySelector('input[type="password"][name="password"], input[type="password"]');
    if (!passwordInput) return;

    button.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";
      passwordInput.setAttribute("type", isPassword ? "text" : "password");
      const eyeIcon = button.querySelector(".icon-eye");
      const eyeSlashIcon = button.querySelector(".icon-eye-slash");
      if (eyeIcon) eyeIcon.classList.toggle("hidden", isPassword);
      if (eyeSlashIcon) eyeSlashIcon.classList.toggle("hidden", !isPassword);
    });
  });
}());
