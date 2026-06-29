const topbar = document.querySelector("[data-topbar]");

const updateTopbar = () => {
  topbar?.classList.toggle("is-scrolled", window.scrollY > 24);
};

updateTopbar();
window.addEventListener("scroll", updateTopbar, { passive: true });
