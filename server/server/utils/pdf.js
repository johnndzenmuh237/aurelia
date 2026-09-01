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

module.exports = { renderInvoicePdf };
