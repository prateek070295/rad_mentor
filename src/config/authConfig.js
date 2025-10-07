// src/config/authConfig.js
// Centralised switches for auth UX variants.

const normalizeFlag = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const authConfig = {
  enableSelfSignup: normalizeFlag(process.env.REACT_APP_ENABLE_SELF_SIGNUP) === "true",
  supportEmail: process.env.REACT_APP_SUPPORT_EMAIL || "admin@radmentor.app",
  passwordResetCooldownSeconds: Number(process.env.REACT_APP_RESET_COOLDOWN_SECONDS || 45),
};

export default authConfig;
