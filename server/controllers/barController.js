const barService = require("../services/barService");
const { ApiError } = require("../utils/errors");

async function createItem(req, res, next) {
  try {
    const { category, brand, unit, quantity, unitPrice } = req.body;
    if (!category || !brand) throw new ApiError(400, "category and brand are required.");
    res.status(201).json(await barService.createInventoryItem({ category, brand, unit, quantity, unitPrice, uid: req.user?.uid }));
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
    const { itemId, quantitySold } = req.body;
    if (!itemId || !quantitySold) throw new ApiError(400, "itemId and quantitySold are required.");
    const result = await barService.sellDrink({ itemId, quantitySold, uid: req.user?.uid, userName: req.userProfile?.fullName || req.userProfile?.name });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

module.exports = { createItem, updateItem, sell };
