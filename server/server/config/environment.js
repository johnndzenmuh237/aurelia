/**
 * Loads and validates environment variables once at boot.
 * Never import process.env directly elsewhere — import this instead,
 * so a missing var fails loudly at startup, not silently mid-request.
 */
require("dotenv").config();

function required(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    // eslint-disable-next-line no-console
    console.error(`[config] Missing required environment variable: ${name}`);
  }
  return val;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  hotelName: process.env.HOTEL_NAME || "Aurelia Hotel",
  currency: process.env.HOTEL_CURRENCY || "FCFA",
  taxRatePercent: Number(process.env.TAX_RATE_PERCENT || 10),
  defaultDepositPercent: Number(process.env.DEFAULT_DEPOSIT_PERCENT || 40),
  noShowCutoffHours: Number(process.env.NO_SHOW_CUTOFF_HOURS || 6),
  timezone: process.env.HOTEL_TIMEZONE || "Africa/Douala",

  firebase: {
    projectId: required("FIREBASE_PROJECT_ID"),
    clientEmail: required("FIREBASE_CLIENT_EMAIL"),
    // Escaped newlines from most .env formats need converting back.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  },

  mtnMomo: {
    baseUrl: process.env.MTN_MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com",
    subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY,
    apiUser: process.env.MTN_MOMO_API_USER,
    apiKey: process.env.MTN_MOMO_API_KEY,
    targetEnvironment: process.env.MTN_MOMO_TARGET_ENV || "sandbox",
    callbackUrl: process.env.MTN_MOMO_CALLBACK_URL,
  },

  orangeMoney: {
    baseUrl: process.env.ORANGE_MONEY_BASE_URL || "https://api.orange.com/orange-money-webpay/cm/v1",
    clientId: process.env.ORANGE_MONEY_CLIENT_ID,
    clientSecret: process.env.ORANGE_MONEY_CLIENT_SECRET,
    merchantKey: process.env.ORANGE_MONEY_MERCHANT_KEY,
    callbackUrl: process.env.ORANGE_MONEY_CALLBACK_URL,
  },

  notifications: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    fromEmail: process.env.NOTIFICATIONS_FROM_EMAIL || "reservations@aureliahotel.com",
    smsProvider: process.env.SMS_PROVIDER || "", // e.g. "twilio" — leave blank to disable SMS
    smsAccountSid: process.env.SMS_ACCOUNT_SID,
    smsAuthToken: process.env.SMS_AUTH_TOKEN,
    smsFromNumber: process.env.SMS_FROM_NUMBER,
  },

  isProd: (process.env.NODE_ENV || "development") === "production",
};
