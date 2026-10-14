const topbar = document.querySelector("[data-topbar]");
const progress = document.querySelector("[data-progress]");
const hero = document.querySelector("[data-hero]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const seatPricing = window.StandupSeatPricing;

let frameRequested = false;
let pricingClockOffset = 0;

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

const formatPrice = (amount) => `$${Number(amount).toLocaleString("es-CO")}`;

const updatePromotion = () => {
  if (!seatPricing) return;

  const now = Date.now() + pricingClockOffset;
  const state = seatPricing.getPricingState(now);
  const lowestTier = state.tiers.reduce(
    (lowest, tier) => (tier.price < lowest.price ? tier : lowest),
    state.tiers[0],
  );

  document.querySelectorAll("[data-price-from]").forEach((element) => {
    element.textContent = formatPrice(lowestTier.price);
  });

  document.querySelectorAll("[data-price-label]").forEach((element) => {
    if (!element.dataset.defaultLabel) element.dataset.defaultLabel = element.textContent;
    element.textContent = state.active
      ? `${state.discountPercent}% de descuento`
      : element.dataset.defaultLabel;
  });

  document.querySelectorAll("[data-price-regular]").forEach((element) => {
    element.textContent = state.active ? `Antes ${formatPrice(lowestTier.basePrice)}` : "";
    element.hidden = !state.active;
  });

  document.querySelectorAll("[data-promotion-banner]").forEach((element) => {
    element.hidden = !state.active;
  });

  document.querySelectorAll("[data-promotion-inline]").forEach((element) => {
    element.hidden = !state.active;
  });

  const mobileBuy = document.querySelector(".mobile-buy");
  if (mobileBuy) {
    mobileBuy.setAttribute(
      "aria-label",
      `Elegir silla desde ${formatPrice(lowestTier.price).replace("$", "")} pesos`,
    );
  }

  if (!state.active) return;

  const remaining = Math.max(0, Date.parse(state.endsAt) - now);
  const hours = String(Math.floor(remaining / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
  const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  document.querySelectorAll("[data-promotion-countdown]").forEach((element) => {
    element.textContent = `${hours}:${minutes}:${seconds}`;
  });
};

const syncPricingClock = async () => {
  try {
    const response = await fetch("/.netlify/functions/public-seats", { cache: "no-store" });
    const data = await response.json();
    const serverTimestamp = Date.parse(data.serverTime);
    if (response.ok && Number.isFinite(serverTimestamp)) {
      pricingClockOffset = serverTimestamp - Date.now();
    }
  } catch {}
  updatePromotion();
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
updatePromotion();
syncPricingClock();
window.setInterval(updatePromotion, 1000);
window.addEventListener("scroll", requestViewportUpdate, { passive: true });
window.addEventListener("resize", requestViewportUpdate, { passive: true });
