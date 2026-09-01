(function () {
  const TABS = [
    { href: "/employee/dashboard.html", label: "Dashboard" },
    { href: "/employee/tasks.html", label: "My Tasks" },
    { href: "/employee/attendance.html", label: "Attendance" },
    { href: "/employee/schedule.html", label: "Schedule" },
    { href: "/employee/profile.html", label: "Profile" },
  ];
  const mount = document.getElementById("emp-tabs");
  if (!mount) return;
  const path = window.location.pathname;
  mount.innerHTML = TABS.map((t) => `<a href="${t.href}" class="${t.href === path ? "active" : ""}">${t.label}</a>`).join("");
  Auth.guard(["employee", "housekeeping", "maintenance", "restaurant", "front_desk", "hr"]);
})();
