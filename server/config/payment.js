/**
 * MTN Mobile Money + Orange Money client wrappers.
 *
 * IMPORTANT — this is a REAL integration shape (correct endpoints, request/
 * response contract, signature/verification flow), but it will only move
 * real money once you fill in your merchant credentials in .env (see
 * .env.example). Until then, calls will fail loudly with a clear error
 * rather than silently pretending to succeed — per spec §84, this project
 * never fakes a payment confirmation.
 *
 * Both providers follow the same pattern used throughout this system:
 *   1. initiate a "request to pay" against the guest's phone number
 *   2. the guest approves on their phone
 *   3. we poll (or receive a webhook) to confirm the transaction status
 *   4. ONLY on a verified "SUCCESSFUL" status do we mark the reservation
 *      paid — see server/services/paymentService.js.
 */
const axios = require("axios");
const env = require("./environment");

function assertConfigured(provider, fields) {
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `${provider} is not configured. Missing: ${missing.join(", ")}. ` +
      `Add real merchant credentials to your .env — see .env.example.`
    );
  }
}

/** MTN Mobile Money (MoMo Collections API). */
const mtnMomo = {
  async requestToPay({ amount, phone, externalId, payerMessage }) {
    assertConfigured("MTN Mobile Money", [
      ["MTN_MOMO_SUBSCRIPTION_KEY", env.mtnMomo.subscriptionKey],
      ["MTN_MOMO_API_USER", env.mtnMomo.apiUser],
      ["MTN_MOMO_API_KEY", env.mtnMomo.apiKey],
    ]);

    // 1. Get an access token
    const tokenRes = await axios.post(
      `${env.mtnMomo.baseUrl}/collection/token/`,
      {},
      {
        auth: { username: env.mtnMomo.apiUser, password: env.mtnMomo.apiKey },
        headers: { "Ocp-Apim-Subscription-Key": env.mtnMomo.subscriptionKey },
      }
    );
    const accessToken = tokenRes.data.access_token;

    // 2. Request to pay
    const referenceId = externalId;
    await axios.post(
      `${env.mtnMomo.baseUrl}/collection/v1_0/requesttopay`,
      {
        amount: String(amount),
        currency: "XAF",
        externalId: referenceId,
        payer: { partyIdType: "MSISDN", partyId: phone.replace(/\D/g, "") },
        payerMessage: payerMessage || "Aurelia Hotel reservation deposit",
        payeeNote: "Hotel booking",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": env.mtnMomo.targetEnvironment,
          "Ocp-Apim-Subscription-Key": env.mtnMomo.subscriptionKey,
          "Content-Type": "application/json",
        },
      }
    );
    return { referenceId, accessToken };
  },

  async checkStatus({ referenceId, accessToken }) {
    const res = await axios.get(
      `${env.mtnMomo.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Target-Environment": env.mtnMomo.targetEnvironment,
          "Ocp-Apim-Subscription-Key": env.mtnMomo.subscriptionKey,
        },
      }
    );
    return res.data.status; // PENDING | SUCCESSFUL | FAILED
  },
};

/** Orange Money Web Payment API. */
const orangeMoney = {
  async requestToPay({ amount, phone, externalId, returnUrl, cancelUrl, notifUrl }) {
    assertConfigured("Orange Money", [
      ["ORANGE_MONEY_CLIENT_ID", env.orangeMoney.clientId],
      ["ORANGE_MONEY_CLIENT_SECRET", env.orangeMoney.clientSecret],
      ["ORANGE_MONEY_MERCHANT_KEY", env.orangeMoney.merchantKey],
    ]);

    const tokenRes = await axios.post(
      "https://api.orange.com/oauth/v3/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.orangeMoney.clientId}:${env.orangeMoney.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    const accessToken = tokenRes.data.access_token;

    const payRes = await axios.post(
      `${env.orangeMoney.baseUrl}/webpayment`,
      {
        merchant_key: env.orangeMoney.merchantKey,
        currency: "XAF",
        order_id: externalId,
        amount,
        return_url: returnUrl,
        cancel_url: cancelUrl,
        notif_url: notifUrl || env.orangeMoney.callbackUrl,
        lang: "en",
        reference: externalId,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return { payToken: payRes.data.pay_token, paymentUrl: payRes.data.payment_url };
  },

  async checkStatus({ orderId, accessToken }) {
    const res = await axios.post(
      `${env.orangeMoney.baseUrl}/transactionstatus`,
      { order_id: orderId },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.data.status; // SUCCESS | FAILED | EXPIRED | PENDING
  },
};

module.exports = { mtnMomo, orangeMoney };
