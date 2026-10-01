/* Generic list/detail engine for every page registered in admin-page-configs.js.
   Reads live from Firestore (onSnapshot) for instant updates across staff
   devices; all creates/edits go through Utils.api() -> /api/* so server-side
   validation, availability checks and folio math are never bypassed. */

(function () {
  async function init() {
    const root = document.getElementById("crud-root");
    if (!root) return;
    const pageKey = root.dataset.page;
    const cfg = window.ADMIN_PAGES[pageKey];
    if (!cfg) {
      root.innerHTML = `<div class="empty-state">Unknown page configuration: ${pageKey}</div>`;
      return;
    }

    let allRows = [];
    let filtered = [];
    let pageNum = 1;
    const pageSize = 12;

    root.innerHTML = `
      <div class="panel">
        <div class="table-toolbar">
          <input type="search" id="crudSearch" placeholder="Search ${cfg.title.toLowerCase()}…" style="min-width:220px">
          <span class="spacer"></span>
          ${cfg.createFields ? `<button class="btn btn-primary btn-sm" id="crudAddBtn">+ Add New</button>` : ""}
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${cfg.columns.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
            <tbody id="crudBody">${Utils.skeletonRows(6, cfg.columns.length + 1)}</tbody>
          </table>
        </div>
        <div class="pagination" id="crudPagination"></div>
      </div>
      <dialog id="crudDialog" style="border:none; border-radius:16px; padding:0; width:min(92vw,480px)">
        <form method="dialog" id="crudForm" style="padding:24px">
          <h3 style="margin-bottom:16px">New ${cfg.title.replace(/s$/, "")}</h3>
          <div id="crudFields"></div>
          <div style="display:flex; gap:10px; margin-top:8px">
            <button type="button" class="btn btn-ghost" id="crudCancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-block">Save</button>
          </div>
        </form>
      </dialog>
    `;

    function cell(col, row) {
      const v = row[col.key];
<<<<<<< HEAD
      if (col.roomLabel) return Utils.formatRoomLabel(v);
=======
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
      if (col.bool) return (v === true || v === "true") ? "Yes" : "No";
      if (col.chip && v !== undefined) return `<span class="chip chip-${String(v).toLowerCase().replace(/[\s_-]/g, "")}">${v}</span>`;
      if (col.money) return Utils.formatMoney(v);
      if (col.date) return Utils.formatDate(v?.toDate ? v.toDate() : v);
      if (col.mono) return `<span style="font-family:var(--font-mono)">${v ?? "—"}</span>`;
      return v === undefined || v === null || v === "" ? "—" : v;
    }

    function renderRows() {
      const tbody = document.getElementById("crudBody");
      const start = (pageNum - 1) * pageSize;
      const pageRows = filtered.slice(start, start + pageSize);
      if (!pageRows.length) {
        tbody.innerHTML = `<tr><td colspan="${cfg.columns.length + 1}"><div class="empty-state">No records yet.${cfg.createFields ? " Click “Add New” to create the first one." : ""}</div></td></tr>`;
      } else {
        tbody.innerHTML = pageRows.map((row) => `
          <tr>
            ${cfg.columns.map((c) => `<td>${cell(c, row)}</td>`).join("")}
            <td style="text-align:right">${cfg.apiUpdate ? `<button class="btn btn-ghost btn-sm" data-edit="${row.id}">Edit</button>` : ""}</td>
          </tr>
        `).join("");
      }
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const pager = document.getElementById("crudPagination");
      pager.innerHTML = Array.from({ length: totalPages }).map((_, i) =>
        `<button class="${i + 1 === pageNum ? "active" : ""}" data-page="${i + 1}">${i + 1}</button>`
      ).join("");
      pager.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { pageNum = Number(b.dataset.page); renderRows(); }));

      tbody.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(allRows.find((r) => r.id === b.dataset.edit))));
    }

    function applySearch(term) {
      const t = term.trim().toLowerCase();
      filtered = !t ? allRows : allRows.filter((row) => cfg.columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(t)));
      pageNum = 1;
      renderRows();
    }

    document.getElementById("crudSearch").addEventListener("input", Utils.debounce((e) => applySearch(e.target.value), 200));

    function fieldLabel(f) {
      const overrides = {
        hasAC: "Has Air Conditioning", hasFan: "Has Fan Only (no AC)",
        weeklyDiscountPercent: "Weekly Discount % (7+ nights)", monthlyDiscountPercent: "Monthly Discount % (28+ nights)",
        photoUrl: "Photo URL", basePrice: "Nightly Rate (FCFA)", maxAdults: "Max Adults",
        maxChildren: "Max Children", bedType: "Bed Type", roomCount: "Number of Units",
      };
      return overrides[f] || f.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    }

    function openForm(existing) {
      const dialog = document.getElementById("crudDialog");
      const fieldsWrap = document.getElementById("crudFields");
      fieldsWrap.innerHTML = (cfg.createFields || []).map((f) => {
        if (f === "category") {
          return `<div class="field"><label>${fieldLabel(f)}</label>
            <select name="category">
              <option value="room" ${existing?.category === "room" ? "selected" : ""}>Room</option>
              <option value="apartment" ${existing?.category === "apartment" ? "selected" : ""}>Apartment</option>
            </select></div>`;
        }
        if (f === "hasAC" || f === "hasFan") {
          return `<div class="field"><label>${fieldLabel(f)}</label>
            <select name="${f}">
              <option value="true" ${existing?.[f] === true || existing?.[f] === "true" ? "selected" : ""}>Yes</option>
              <option value="false" ${existing?.[f] === false || existing?.[f] === "false" || existing?.[f] === undefined ? "selected" : ""}>No</option>
            </select></div>`;
        }
        if (f === "description") {
          return `<div class="field"><label>${fieldLabel(f)}</label><textarea name="description" rows="2">${existing?.description ?? ""}</textarea></div>`;
        }
        return `<div class="field"><label>${fieldLabel(f)}</label><input name="${f}" value="${existing ? (existing[f] ?? "") : ""}" /></div>`;
      }).join("");
      dialog.dataset.editingId = existing?.id || "";
      dialog.showModal();
    }

    if (document.getElementById("crudAddBtn")) {
      document.getElementById("crudAddBtn").addEventListener("click", () => openForm(null));
    }
    document.getElementById("crudCancel").addEventListener("click", () => document.getElementById("crudDialog").close());
    document.getElementById("crudForm").addEventListener("submit", async (e) => {
      const dialog = document.getElementById("crudDialog");
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      // Coerce known boolean/numeric fields — HTML forms only ever send
      // strings, but Firestore should store real types so admin dashboards
      // and the public site can filter/compare them correctly.
      ["hasAC", "hasFan", "active", "available", "vip"].forEach((k) => {
        if (k in payload) payload[k] = payload[k] === "true";
      });
      ["basePrice", "maxAdults", "maxChildren", "weeklyDiscountPercent", "monthlyDiscountPercent", "roomCount", "quantity", "minStock", "unitCost", "price", "amount", "discountPercent"].forEach((k) => {
        if (k in payload && payload[k] !== "") payload[k] = Number(payload[k]);
      });
      const editingId = dialog.dataset.editingId;
      try {
        if (editingId && cfg.apiUpdate) {
          await Utils.api(cfg.apiUpdate, { method: "PUT", body: { id: editingId, ...payload } });
          Utils.toast("Updated successfully", "success");
        } else if (cfg.apiCreate) {
          await Utils.api(cfg.apiCreate, { method: "POST", body: payload });
          Utils.toast("Created successfully", "success");
        }
      } catch (err) {
        Utils.toast(err.message, "error");
      }
    });

<<<<<<< HEAD
    // Staff-only data — read through the authenticated API and poll for
    // updates, since Firestore rules can no longer distinguish "logged-in
    // staff" from "anyone" without Firebase Auth (see server/controllers/
    // dataController.js for why). cfg.where (used by a few pages, e.g.
    // vip-guests filtering tier=="vip") is now applied client-side after
    // the fetch instead of as a Firestore query.
    Utils.pollCollection(cfg.collection, (rows) => {
      allRows = cfg.where ? rows.filter((row) => cfg.where.every(([f, op, v]) => matchesWhere(row[f], op, v))) : rows;
      applySearch(document.getElementById("crudSearch").value || "");
    });

    function matchesWhere(fieldValue, op, value) {
      if (op === "==") return fieldValue === value;
      if (op === "!=") return fieldValue !== value;
      if (op === ">") return fieldValue > value;
      if (op === ">=") return fieldValue >= value;
      if (op === "<") return fieldValue < value;
      if (op === "<=") return fieldValue <= value;
      return true;
=======
    // Real-time Firestore listener
    document.addEventListener("firebase-ready", subscribe);
    if (window.firebaseDb) subscribe();

    function subscribe() {
      const { collection, query, where, onSnapshot } = window.fb;
      let q = collection(window.firebaseDb, cfg.collection);
      if (cfg.where) q = query(q, ...cfg.where.map(([f, op, v]) => where(f, op, v)));
      onSnapshot(q, (snap) => {
        allRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        applySearch(document.getElementById("crudSearch").value || "");
      }, (err) => {
        console.error(err);
        document.getElementById("crudBody").innerHTML = `<tr><td colspan="${cfg.columns.length + 1}"><div class="empty-state">Could not load live data — check Firebase config in js/config.js and that Firestore rules allow this role to read “${cfg.collection}”.</div></td></tr>`;
      });
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
