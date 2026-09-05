const topbar = document.querySelector("[data-topbar]");
const progress = document.querySelector("[data-progress]");
const hero = document.querySelector("[data-hero]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let frameRequested = false;

const updateViewportEffects = () => {
  const scrollY = window.scrollY;
  const scrollRange = document.documentElement.scrollHeight - window.innerHeight;

  topbar?.classList.toggle("is-scrolled", scrollY > 24);

  if (progress) {
    const value = scrollRange > 0 ? Math.min(scrollY / scrollRange, 1) : 0;
    progress.style.transform = `scaleX(${value})`;
  }

  if (hero && !reduceMotion.matches) {
    const shift = Math.min(scrollY * 0.1, 90);
    hero.style.setProperty("--hero-shift", `${shift}px`);
  }

  frameRequested = false;
};

const requestViewportUpdate = () => {
  if (frameRequested) return;
  frameRequested = true;
  window.requestAnimationFrame(updateViewportEffects);
};

const revealElements = document.querySelectorAll(".reveal");

if (reduceMotion.matches || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12%", threshold: 0.08 },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

const canUseMagnet = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (canUseMagnet && !reduceMotion.matches) {
  document.querySelectorAll(".magnetic").forEach((button) => {
    button.addEventListener("pointermove", (event) => {
      const bounds = button.getBoundingClientRect();
      const x = (event.clientX - bounds.left - bounds.width / 2) * 0.1;
      const y = (event.clientY - bounds.top - bounds.height / 2) * 0.15;
      button.style.setProperty("--mx", `${x}px`);
      button.style.setProperty("--my", `${y}px`);
    });

    button.addEventListener("pointerleave", () => {
      button.style.setProperty("--mx", "0px");
      button.style.setProperty("--my", "0px");
    });
  });
}

updateViewportEffects();
window.addEventListener("scroll", requestViewportUpdate, { passive: true });
window.addEventListener("resize", requestViewportUpdate, { passive: true });
