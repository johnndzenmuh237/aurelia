/* Renders the admin shell (sidebar + topbar) into every /admin page.
   Page markup only needs:
     <div id="admin-shell" data-title="Dashboard" data-roles="super_admin,manager">
       <div id="admin-content">...page content...</div>
     </div>
   admin-layout.js wraps that content with the sidebar/topbar and enforces
   the role guard (redirects to /login.html if unauthorized). */

(function () {
  function iconFor(item) {
    return `<span class="admin-nav-icon">${item.icon}</span>`;
  }

  function renderSidebar(activePath) {
    const groups = window.ADMIN_NAV.map((section) => {
      const items = section.items
        .map((i) => `<a href="${i.href}" class="${i.href === activePath ? "active" : ""}">${iconFor(i)}${i.label}</a>`)
        .join("");
      return `<div class="admin-nav-group">${section.group ? `<div class="grp-label">${section.group}</div>` : ""}${items}</div>`;
    }).join("");

    return `
      <aside class="admin-sidebar" id="adminSidebar">
        <a href="/admin/dashboard.html" class="admin-brand"><span class="brand-mark"></span>Aurelia PMS</a>
        ${groups}
        <div class="admin-nav-group" style="margin-top:auto; border-top:1px solid rgba(255,255,255,.1); padding-top:14px;">
          <a href="#" id="adminLogoutBtn">${iconFor({ icon: "⎋" })}Sign out</a>
        </div>
      </aside>
      <div class="admin-scrim" id="adminScrim"></div>
    `;
  }

  function init() {
    const shell = document.getElementById("admin-shell");
    if (!shell) return;
    const title = shell.dataset.title || "Dashboard";
    const roles = (shell.dataset.roles || "").split(",").map((s) => s.trim()).filter(Boolean);
    const activePath = window.location.pathname;
    const contentNode = document.getElementById("admin-content");
    const contentHtml = contentNode ? contentNode.innerHTML : "";

    document.body.classList.add("admin-body");
    shell.className = "admin-shell";
    shell.innerHTML = `
      ${renderSidebar(activePath)}
      <div class="admin-main">
        <div class="admin-topbar">
          <div style="display:flex; align-items:center; gap:14px">
            <button class="admin-sidebar-toggle" id="sidebarToggle" aria-label="Open menu"><span style="width:16px;height:2px;background:var(--ink);box-shadow:0 5px 0 var(--ink),0 -5px 0 var(--ink)"></span></button>
            <div class="page-title">${title}</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px">
            <span class="muted" id="adminUserLabel" style="font-size:.85rem">—</span>
          </div>
        </div>
        <div class="admin-content" id="admin-content">${contentHtml}</div>
      </div>
    `;

    const open = () => document.body.classList.add("sidebar-open");
    const close = () => document.body.classList.remove("sidebar-open");
    document.getElementById("sidebarToggle").addEventListener("click", open);
    document.getElementById("adminScrim").addEventListener("click", close);
    document.querySelectorAll(".admin-sidebar a").forEach((a) => a.addEventListener("click", close));

    document.getElementById("adminLogoutBtn").addEventListener("click", (e) => {
      e.preventDefault();
      Auth.logout();
    });

    if (window.Auth) {
      Auth.guard(roles.length ? roles : null);
      Auth.onReady((user, profile) => {
        const label = document.getElementById("adminUserLabel");
        if (label) label.textContent = profile ? `${profile.name || profile.email} · ${profile.role}` : "";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
