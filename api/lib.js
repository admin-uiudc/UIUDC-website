import admin from "firebase-admin";
import crypto from "crypto";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

export const db = admin.firestore();
export const auth = admin.auth();

export const emailKey = (email) =>
  crypto.createHash("sha256").update(email).digest("hex");

export const hashOtp = (email, otp) =>
  crypto.createHmac("sha256", process.env.OTP_SECRET).update(`${email}:${otp}`).digest("hex");

export async function verifyCaptcha(token, ip) {
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

export const isEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
