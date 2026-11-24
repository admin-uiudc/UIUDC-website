const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const db = admin.firestore();
const auth = admin.auth();

const emailKey = (email) =>
  crypto.createHash("sha256").update(email).digest("hex");

const hashOtp = (email, otp) =>
  crypto.createHmac("sha256", process.env.OTP_SECRET).update(`${email}:${otp}`).digest("hex");

async function verifyCaptcha(token, ip) {
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET,
      response: token,
      remoteip: ip || "",
    }),
  });
  const data = await r.json();
  return data.success === true;
}

const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

module.exports = { admin, db, auth, emailKey, hashOtp, verifyCaptcha, isEmail };
