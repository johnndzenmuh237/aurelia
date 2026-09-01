/* Right-to-left scrolling ticker — used on the homepage header. Content is
   duplicated once so the CSS animation (translateX -50%) loops seamlessly
   with no visible seam. */
(function () {
  const ITEMS = [
    "Best Rate Guaranteed on Direct Bookings",
    "Pay Securely with MTN Mobile Money & Orange Money",
    "Free Wi-Fi in Every Room",
    "24/7 Front Desk",
    "Airport Transfer Available on Request",
    "Restaurant & Bar Open Daily",
  ];

  function render() {
    const mount = document.getElementById("app-ticker");
    if (!mount) return;
    const itemsHtml = ITEMS.map((t) => `<span class="ticker-item"><span class="dot"></span>${t}</span>`).join("");
    mount.innerHTML = `
      <div class="ticker-bar" role="region" aria-label="Hotel announcements">
        <div class="ticker-track">${itemsHtml}${itemsHtml}</div>
      </div>`;
  }

  render();
})();
