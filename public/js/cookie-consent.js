/* Cookie consent banner — shown once until the guest accepts or declines.
   This site does not use tracking/advertising cookies; the only client-
   side storage is localStorage for staff session tokens (public/js/
   auth.js) and, if the guest is browsing while signed in via a device
   used at the front desk, that login token — nothing about a public
   visitor's browsing is tracked. This banner exists for transparency and
   legal compliance even though the footprint is small. */
(function () {
  const KEY = "aurelia_cookie_consent";
  if (localStorage.getItem(KEY)) return;

  const bar = document.createElement("div");
  bar.id = "cookieConsentBar";
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:300;background:var(--forest-2,#163A30);color:#fff;padding:16px 20px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;box-shadow:0 -4px 16px rgba(0,0,0,.15);font-size:.85rem;";
  bar.innerHTML = `
    <p style="margin:0; max-width:640px; color:#EAF2EE;">
      We use only the essential cookies needed to run this site (like keeping staff logged in) — no advertising or tracking cookies.
      <a href="/cookies-policy.html" style="color:#fff; text-decoration:underline">Learn more</a>
    </p>
    <div style="display:flex; gap:10px; flex-shrink:0">
      <button id="cookieDecline" style="background:transparent; border:1px solid rgba(255,255,255,.4); color:#fff; padding:9px 16px; border-radius:999px; font-size:.82rem; cursor:pointer">Decline non-essential</button>
      <button id="cookieAccept" style="background:#B8874B; border:none; color:#fff; padding:9px 18px; border-radius:999px; font-weight:600; font-size:.82rem; cursor:pointer">Accept</button>
    </div>`;
  document.body.appendChild(bar);

  document.getElementById("cookieAccept").addEventListener("click", () => {
    localStorage.setItem(KEY, "accepted");
    bar.remove();
  });
  document.getElementById("cookieDecline").addEventListener("click", () => {
    localStorage.setItem(KEY, "essential-only");
    bar.remove();
  });
})();
