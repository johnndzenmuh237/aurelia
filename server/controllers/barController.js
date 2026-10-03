const barService = require("../services/barService");
const { ApiError } = require("../utils/errors");

async function createItem(req, res, next) {
  try {
    if (!req.body.category || !req.body.brand) throw new ApiError(400, "category and brand are required.");
    res.status(201).json(await barService.createInventoryItem({ ...req.body, uid: req.user?.uid }));
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    if (!req.body.id) throw new ApiError(400, "id is required.");
    res.json(await barService.updateInventoryItem(req.body, req.user?.uid));
  } catch (err) { next(err); }
}

async function sell(req, res, next) {
  try {
    const { itemId, quantitySold, paymentMethod } = req.body;
    if (!itemId || !quantitySold) throw new ApiError(400, "itemId and quantitySold are required.");
    const result = await barService.sellDrink({ itemId, quantitySold, paymentMethod, uid: req.user?.uid, userName: req.user?.name || req.userProfile?.fullName });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// ---------------- Categories (bar spec §3) ----------------
async function listCategories(req, res, next) {
  try { res.json({ items: await barService.listBarCategories() }); }
  catch (err) { next(err); }
}
async function createCategory(req, res, next) {
  try { res.status(201).json(await barService.createBarCategory(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}

// ---------------- Restock & stock adjustment (bar spec §19-20) ----------------
async function restock(req, res, next) {
  try { res.json(await barService.restockBarItem(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}
async function adjust(req, res, next) {
  try { res.json(await barService.adjustBarStock(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}

// ---------------- Dashboard & reports (bar spec §16, §24) ----------------
async function dashboard(req, res, next) {
  try { res.json(await barService.barFinancialDashboard()); }
  catch (err) { next(err); }
}
async function sellerPerformance(req, res, next) {
  try { res.json({ items: await barService.sellerPerformance({ from: req.query.from, to: req.query.to }) }); }
  catch (err) { next(err); }
}
async function listWithFigures(req, res, next) {
  try { res.json({ items: await barService.listInventoryWithFigures() }); }
  catch (err) { next(err); }
}

module.exports = {
  createItem, updateItem, sell,
  listCategories, createCategory,
  restock, adjust,
  dashboard, sellerPerformance, listWithFigures,
};
