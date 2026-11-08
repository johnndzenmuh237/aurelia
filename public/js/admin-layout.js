/* Renders the app shell (sidebar + topbar) into every /admin, /owner,
   /manager and /portal page. Page markup only needs:
     <div id="admin-shell" data-title="Dashboard" data-roles="super_admin,manager">
       <div id="admin-content">...page content...</div>
     </div>
   (omit data-roles for pages any signed-in person may open). admin-layout.js
   wraps that content with the sidebar/topbar and enforces the guard: not
   signed in → login page; wrong role → the person's own home page. The
   sidebar only lists pages the signed-in person may open — the API still
   checks every request on the server. */

(function () {
  const icon = (name, size) => (window.Icons ? window.Icons.svg(name, { size: size || 18 }) : "");
  const navIcon = (name) => `<span class="admin-nav-icon">${icon(name)}</span>`;

  function workspaceGroup(session) {
    if (!session) return null;
    if (session.role === "owner") {
      return { group: "Owner", items: [
        { href: "/owner/dashboard.html", label: "Owner Dashboard", icon: "layout-dashboard" },
        { href: "/owner/managers.html", label: "Managers", icon: "user-cog" },
        { href: "/owner/records.html", label: "Business Records", icon: "database" },
        { href: "/portal/messages.html", label: "Messages", icon: "messages-square" },
        { href: "/portal/notifications.html", label: "Notifications", icon: "bell" },
        { href: "/portal/account.html", label: "My Account & Security", icon: "shield-check" },
      ] };
    }
    if (session.accountId && session.role === "manager") {
      return { group: "Manager", items: [
        { href: "/manager/dashboard.html", label: "Manager Dashboard", icon: "layout-dashboard" },
        { href: "/portal/messages.html", label: "Messages", icon: "messages-square" },
        { href: "/portal/notifications.html", label: "Notifications", icon: "bell" },
        { href: "/portal/account.html", label: "My Account & Security", icon: "shield-check" },
      ] };
    }
    return { group: "Workspace", items: [
      { href: "/portal/messages.html", label: "Messages", icon: "messages-square" },
      { href: "/portal/notifications.html", label: "Notifications", icon: "bell" },
    ] };
  }

  function allowedNav(session) {
    const roles = window.ADMIN_PAGE_ROLES || {};
    const groups = [];
    const ws = workspaceGroup(session);
    if (ws) groups.push(ws);
    // Only the owner and managers get the full admin tree in the sidebar
    // (department staff keep exactly the pages their role already allowed).
    (window.ADMIN_NAV || []).forEach((section) => {
      const items = section.items.filter((i) => {
        const r = roles[i.href];
        return !r || !window.Auth || Auth.can(r);
      });
      if (items.length) groups.push({ group: section.group, items });
    });
    return groups;
  }

  function renderSidebar(activePath, session) {
    const groups = allowedNav(session).map((section) => {
      const items = section.items
        .map((i) => `<a href="${i.href}" class="${i.href === activePath ? "active" : ""}" ${i.href === activePath ? 'aria-current="page"' : ""}>${navIcon(i.icon)}<span>${i.label}</span></a>`)
        .join("");
      return `<div class="admin-nav-group">${section.group ? `<div class="grp-label">${section.group}</div>` : ""}${items}</div>`;
    }).join("");

    const home = window.Auth ? Auth.homeFor(session) : "/admin/dashboard.html";
    return `
      <aside class="admin-sidebar" id="adminSidebar" aria-label="Main navigation">
        <a href="${home}" class="admin-brand"><span class="brand-mark"></span>Aurelia PMS</a>
        ${groups}
        <div class="admin-nav-group" style="margin-top:auto; border-top:1px solid rgba(255,255,255,.1); padding-top:14px;">
          <a href="#" id="adminLogoutBtn">${navIcon("log-out")}<span>Sign out</span></a>
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
    const loginPage = roles.length === 1 && roles[0] === "owner" ? "/owner/login.html" : "/login.html";

    if (window.Auth && !Auth.guard(roles.length ? roles : null, loginPage)) return;
    const session = window.Auth ? Auth.getSession() : null;

    const activePath = window.location.pathname;
    const contentNode = document.getElementById("admin-content");
    const contentHtml = contentNode ? contentNode.innerHTML : "";

    document.body.classList.add("admin-body");
    shell.className = "admin-shell";
    shell.innerHTML = `
      ${renderSidebar(activePath, session)}
      <div class="admin-main">
        <header class="admin-topbar">
          <div style="display:flex; align-items:center; gap:12px; min-width:0">
            <button class="admin-sidebar-toggle" id="sidebarToggle" aria-label="Open menu" aria-controls="adminSidebar">${icon("menu", 20)}</button>
            <h1 class="page-title" style="margin:0">${title}</h1>
          </div>
          <div class="topbar-right">
            <div id="bellMount"></div>
            <div class="user-chip"><b id="adminUserName">—</b><span id="adminUserRole"></span></div>
          </div>
        </header>
        <main class="admin-content" id="admin-content">${contentHtml}</main>
      </div>
    `;

    const open = () => document.body.classList.add("sidebar-open");
    const close = () => document.body.classList.remove("sidebar-open");
    document.getElementById("sidebarToggle").addEventListener("click", open);
    document.getElementById("adminScrim").addEventListener("click", close);
    document.querySelectorAll(".admin-sidebar a").forEach((a) => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    document.getElementById("adminLogoutBtn").addEventListener("click", (e) => {
      e.preventDefault();
      Auth.logout();
    });

    if (session) {
      document.getElementById("adminUserName").textContent = session.name || session.email || "—";
      document.getElementById("adminUserRole").textContent = Auth.roleLabel(session.role);
    }
    document.dispatchEvent(new CustomEvent("shell-ready"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
