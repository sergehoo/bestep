(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("toggle-password");
    if (!button) return;

    const passwordInput = document.querySelector('input[type="password"][name="password"], input[type="password"]');
    if (!passwordInput) return;

    button.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";
      passwordInput.setAttribute("type", isPassword ? "text" : "password");
      button.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    });
  });
}());
