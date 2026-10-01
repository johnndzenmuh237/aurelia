const PDFDocument = require("pdfkit");
const env = require("../config/environment");

/**
 * Renders an invoice/receipt to a PDF buffer using pdfkit. Kept deliberately
 * simple and dependency-light; swap in a templated HTML->PDF renderer later
 * if you want a fully branded layout.
 */
function renderInvoicePdf({ invoiceNumber, guestName, room, checkIn, checkOut, items, total, paid, balance }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(env.hotelName, { align: "left" });
    doc.moveDown(0.2).fontSize(10).fillColor("#57635C").text("Invoice").fillColor("#000");
    doc.moveDown(1);
    doc.fontSize(12).text(`Invoice #: ${invoiceNumber}`);
    doc.text(`Guest: ${guestName}`);
    if (room) doc.text(`Room: ${room}`);
    if (checkIn) doc.text(`Stay: ${checkIn} to ${checkOut}`);
    doc.moveDown(1);

    doc.fontSize(12).text("Charges", { underline: true });
    (items || []).forEach((it) => {
      doc.text(`${it.description || it.category}    ${it.amount} ${env.currency}`);
    });
    doc.moveDown(1);
    doc.text(`Total: ${total} ${env.currency}`);
    doc.text(`Paid: ${paid} ${env.currency}`);
    doc.text(`Balance: ${balance} ${env.currency}`, { underline: balance > 0 });

    doc.end();
  });
}

<<<<<<< HEAD
module.exports = { renderInvoicePdf, renderTablePdf };

/**
 * Renders any tabular report (expenses, debts, salaries, inventory,
 * sales...) to a simple PDF: a title, an optional summary line, and a
 * row per record. Deliberately plain/dependency-light, same philosophy
 * as renderInvoicePdf above — swap in a templated layout later if you
 * want hotel branding on these.
 */
function renderTablePdf({ title, summary, columns, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`${env.hotelName} — ${title}`);
    if (summary) doc.moveDown(0.3).fontSize(10).fillColor("#57635C").text(summary).fillColor("#000");
    doc.moveDown(1);

    const colWidth = (doc.page.width - 80) / columns.length;
    doc.fontSize(9).font("Helvetica-Bold");
    columns.forEach((c, i) => doc.text(String(c.label), 40 + i * colWidth, doc.y, { width: colWidth, continued: false }));
    doc.moveDown(0.5).font("Helvetica");

    rows.forEach((row) => {
      const y = doc.y;
      columns.forEach((c, i) => {
        let value = row[c.key];
        if (value && typeof value.toDate === "function") value = value.toDate().toISOString().slice(0, 10);
        doc.text(value === undefined || value === null ? "" : String(value), 40 + i * colWidth, y, { width: colWidth });
      });
      doc.moveDown(0.4);
      if (doc.y > doc.page.height - 60) doc.addPage({ margin: 40, size: "A4", layout: "landscape" });
    });

    doc.end();
  });
}
=======
module.exports = { renderInvoicePdf };
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
