const topbar = document.querySelector("[data-topbar]");
const countdownNodes = document.querySelectorAll("[data-countdown]");
const offerKey = "standupTherapyOfferEndsAt";
const offerDurationMs = 20 * 60 * 1000;

const updateTopbar = () => {
  topbar?.classList.toggle("is-scrolled", window.scrollY > 24);
};

const getOfferEnd = () => {
  const savedEnd = Number.parseInt(window.localStorage.getItem(offerKey) || "", 10);

  if (Number.isFinite(savedEnd) && savedEnd > Date.now()) {
    return savedEnd;
  }

  const nextEnd = Date.now() + offerDurationMs;
  window.localStorage.setItem(offerKey, String(nextEnd));
  return nextEnd;
};

const offerEnd = getOfferEnd();

const updateCountdown = () => {
  const remaining = Math.max(0, offerEnd - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  countdownNodes.forEach((node) => {
    node.textContent = display;
  });
};

updateTopbar();
updateCountdown();

window.addEventListener("scroll", updateTopbar, { passive: true });
window.setInterval(updateCountdown, 1000);
