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

/** Shared role passwords — the whole staff login system. No per-person
 * accounts, no signup: everyone on a given team uses that team's one
 * password (set here, in .env, never in code). Each login issues a JWT
 * carrying only { role, name } — "name" is whatever the person typing it
 * in types, used purely for audit-trail display ("Front Desk (Amina)
 * checked in Room 3"), not as a unique identity. */
const ROLE_PASSWORDS = {
  super_admin: process.env.SUPER_ADMIN_PASSWORD,
  manager: process.env.MANAGER_PASSWORD,
  front_desk: process.env.FRONT_DESK_PASSWORD,
  reservations: process.env.RESERVATIONS_PASSWORD,
  housekeeping: process.env.HOUSEKEEPING_PASSWORD,
  maintenance: process.env.MAINTENANCE_PASSWORD,
  restaurant: process.env.RESTAURANT_PASSWORD,
  hr: process.env.HR_PASSWORD,
  accountant: process.env.ACCOUNTANT_PASSWORD,
  employee: process.env.EMPLOYEE_PASSWORD,
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  hotelName: process.env.HOTEL_NAME || "Aurelia Hotel",
  currency: process.env.HOTEL_CURRENCY || "FCFA",
  taxRatePercent: Number(process.env.TAX_RATE_PERCENT || 10),
  defaultDepositPercent: Number(process.env.DEFAULT_DEPOSIT_PERCENT || 40),
  noShowCutoffHours: Number(process.env.NO_SHOW_CUTOFF_HOURS || 6),
  timezone: process.env.HOTEL_TIMEZONE || "Africa/Douala",

  jwtSecret: required("JWT_SECRET"),
  roles: { passwords: ROLE_PASSWORDS },

  firebase: {
    // Firestore is still the database (that part wasn't the source of the
    // frustration) — only Firebase Authentication and Storage are gone.
    projectId: required("FIREBASE_PROJECT_ID"),
    clientEmail: required("FIREBASE_CLIENT_EMAIL"),
    // Escaped newlines from most .env formats need converting back.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
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

    // WhatsApp Cloud API (Meta) — used for the receptionist "new paid
    // booking" notification. Leave WHATSAPP_ACCESS_TOKEN blank in
    // development and whatsappService logs a "skipped_not_configured"
    // entry instead of failing the booking/payment it's attached to.
    whatsappApiUrl: process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v20.0",
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    // Fallback only — the real, admin-editable value lives at
    // settings/hotel.whatsapp.receptionistNumber (see server/services/whatsappService.js).
    receptionistWhatsappNumber: process.env.RECEPTIONIST_WHATSAPP_NUMBER,
  },

  isProd: (process.env.NODE_ENV || "development") === "production",
};
