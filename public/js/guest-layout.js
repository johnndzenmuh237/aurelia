(function () {
  const TABS = [
    { href: "/guest/dashboard.html", label: "Dashboard" },
    { href: "/guest/reservations.html", label: "My Reservations" },
    { href: "/guest/folio.html", label: "Folio" },
    { href: "/guest/payments.html", label: "Payments" },
    { href: "/guest/receipts.html", label: "Receipts" },
    { href: "/guest/requests.html", label: "Service Requests" },
    { href: "/guest/profile.html", label: "Profile" },
  ];
  const mount = document.getElementById("guest-tabs");
  if (!mount) return;
  const path = window.location.pathname;
  mount.innerHTML = TABS.map((t) => `<a href="${t.href}" class="${t.href === path ? "active" : ""}">${t.label}</a>`).join("");
  Auth.guard(["guest"]);
})();
