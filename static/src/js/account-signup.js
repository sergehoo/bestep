(function () {
  function setDot(element, isValid) {
    if (!element) return;
    element.classList.toggle("bg-gray-300", !isValid);
    element.classList.toggle("bg-green-500", isValid);
  }

  function paintBar(bar, score) {
    if (!bar) return;
    bar.style.width = `${score}%`;
    bar.classList.remove("bg-red-500", "bg-yellow-500", "bg-green-500");
    if (score <= 25) bar.classList.add("bg-red-500");
    else if (score <= 50) bar.classList.add("bg-yellow-500");
    else bar.classList.add("bg-green-500");
  }

  function scorePassword(value, elements) {
    let score = 0;
    const hasLength = value.length >= 8;
    const hasUppercase = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);

    if (hasLength) score += 25;
    if (hasUppercase) score += 25;
    if (hasNumber) score += 25;
    if (hasSpecial) score += 25;

    setDot(elements.dotLength, hasLength);
    setDot(elements.dotUppercase, hasUppercase);
    setDot(elements.dotNumber, hasNumber);
    setDot(elements.dotSpecial, hasSpecial);
    paintBar(elements.bar, score);

    if (!elements.label) return;
    if (score === 0) elements.label.textContent = "—";
    else if (score <= 25) elements.label.textContent = "Faible";
    else if (score <= 50) elements.label.textContent = "Moyen";
    else if (score <= 75) elements.label.textContent = "Bon";
    else elements.label.textContent = "Excellent";
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".toggle-password").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.getAttribute("data-target-name");
        const input = document.querySelector(`input[name="${name}"]`);
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        button.setAttribute("aria-pressed", isPassword ? "true" : "false");
        button.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
      });
    });

    const passwordInput = document.querySelector('input[name="password1"]');
    if (!passwordInput) return;

    const elements = {
      dotLength: document.getElementById("pw-dot-len"),
      dotUppercase: document.getElementById("pw-dot-up"),
      dotNumber: document.getElementById("pw-dot-num"),
      dotSpecial: document.getElementById("pw-dot-sp"),
      bar: document.getElementById("pw-bar"),
      label: document.getElementById("pw-label"),
    };

    passwordInput.addEventListener("input", () => scorePassword(passwordInput.value || "", elements));
    scorePassword(passwordInput.value || "", elements);
  });
}());
