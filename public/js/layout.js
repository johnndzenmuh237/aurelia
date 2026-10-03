/* Renders the public-site header (desktop nav) + mobile drawer + footer.
   Every public page has two empty mount points:
     <div id="app-header"></div>  ...content...  <div id="app-footer"></div>
   and loads this file last. This keeps navigation identical and the mobile
   drawer working the same way on every single page, with one file to edit. */

(function () {
  const NAV_LINKS = [
    { href: "/index.html", label: "Home" },
    { href: "/rooms.html", label: "Rooms & Apartments" },
    { href: "/restaurant.html", label: "Restaurant" },
    { href: "/bar.html", label: "Bar" },
    { href: "/amenities.html", label: "Amenities" },
    { href: "/gallery.html", label: "Gallery" },
    { href: "/offers.html", label: "Offers" },
    { href: "/about.html", label: "About" },
    { href: "/contact.html", label: "Contact" },
  ];

  const path = window.location.pathname.replace(/\/$/, "") || "/index.html";
  const isActive = (href) => path === href || (href === "/index.html" && path === "/");

  function navHtml(extraClass = "") {
    return NAV_LINKS.map(
      (l) => `<a class="${isActive(l.href) ? "active" : ""} ${extraClass}" href="${l.href}">${l.label}</a>`
    ).join("");
  }

  function renderHeader() {
    const mount = document.getElementById("app-header");
    if (!mount) return;
    mount.innerHTML = `
      <header class="site-header">
        <div class="container">
          <a href="/index.html" class="brand"><span class="brand-mark"></span>Aurelia Hotel</a>
          <nav class="main-nav">${navHtml()}</nav>
          <div class="header-actions">
            <a href="/login.html" class="btn btn-ghost btn-sm">Staff Login</a>
            <a href="/booking.html" class="btn btn-primary btn-sm">Book Now</a>
            <button class="menu-toggle" id="drawerOpenBtn" aria-label="Open menu"><span></span></button>
          </div>
        </div>
      </header>
      <div class="drawer-scrim" id="drawerScrim"></div>
      <aside class="drawer" id="drawer" aria-hidden="true">
        <div class="drawer-head">
          <span class="brand"><span class="brand-mark"></span>Aurelia</span>
          <button class="drawer-close" id="drawerCloseBtn" aria-label="Close menu">✕</button>
        </div>
        <nav>${navHtml()}</nav>
        <div class="drawer-cta">
          <a href="/booking.html" class="btn btn-primary btn-block">Book Now</a>
          <a href="/login.html" class="btn btn-outline btn-block">Staff Login</a>
        </div>
      </aside>
    `;

    const open = () => { document.body.classList.add("drawer-open"); document.getElementById("drawer").setAttribute("aria-hidden", "false"); };
    const close = () => { document.body.classList.remove("drawer-open"); document.getElementById("drawer").setAttribute("aria-hidden", "true"); };
    document.getElementById("drawerOpenBtn").addEventListener("click", open);
    document.getElementById("drawerCloseBtn").addEventListener("click", close);
    document.getElementById("drawerScrim").addEventListener("click", close);
    document.querySelectorAll(".drawer nav a").forEach((a) => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  function renderFooter() {
    const mount = document.getElementById("app-footer");
    if (!mount) return;
    mount.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div>
            <a href="/index.html" class="brand" style="color:#fff"><span class="brand-mark"></span>Aurelia Hotel</a>
            <p style="color:#CFE0D8; margin-top:12px; max-width:280px">Rue de la Paix, Douala, Cameroon. A modern independent hotel, run on one connected system.</p>
          </div>
          <div>
            <h4>Explore</h4>
            ${NAV_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join("")}
            <a href="/careers.html">Careers</a>
          </div>
          <div>
            <h4>Guest</h4>
            <a href="/track-booking.html">Track my booking</a>
            <a href="/booking.html">Book a room</a>
          </div>
          <div>
            <h4>Contact</h4>
            <a href="tel:+237600000000">+237 6 00 00 00 00</a>
            <a href="mailto:reservations@aureliahotel.com">reservations@aureliahotel.com</a>
          </div>
        </div>
        <div class="footer-bottom">
          © <span id="year"></span> Aurelia Hotel. All rights reserved. ·
          <a href="/privacy-policy.html" style="color:#9FB8AC">Privacy Policy</a> ·
          <a href="/terms.html" style="color:#9FB8AC">Terms &amp; Conditions</a> ·
          <a href="/refund-policy.html" style="color:#9FB8AC">Refund Policy</a> ·
          <a href="/cookies-policy.html" style="color:#9FB8AC">Cookies Policy</a>
        </div>
      </footer>
    `;
    document.getElementById("year").textContent = new Date().getFullYear();
  }

  renderHeader();
  renderFooter();

  // Cookie consent banner — loaded here so every public page gets it
  // without needing its own <script> tag (see js/cookie-consent.js).
  const consentScript = document.createElement("script");
  consentScript.src = "/js/cookie-consent.js";
  document.body.appendChild(consentScript);
})();
