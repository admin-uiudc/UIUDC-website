import crypto from "crypto";
import { db, auth, emailKey, hashOtp, isEmail } from "../lib/server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = String(req.body?.email || "").trim().toLowerCase();
  const otp = String(req.body?.otp || "").trim();
  const password = String(req.body?.password || "");

  if (!isEmail(email) || !/^\d{6}$/.test(otp))
    return res.status(400).json({ error: "Invalid input" });
  if (password.length < 8 || password.length > 128)
    return res.status(400).json({ error: "Password must be 8–128 characters." });

  const ref = db.collection("otps").doc(emailKey(email));
  const snap = await ref.get();
  if (!snap.exists) return res.status(400).json({ error: "No code requested. Please start again." });

  const d = snap.data();
  if (Date.now() > d.expiresAt) {
    await ref.delete();
    return res.status(400).json({ error: "Code expired. Request a new one." });
  }
  if (d.attempts >= 5) {
    await ref.delete();
    return res.status(429).json({ error: "Too many attempts. Request a new code." });
  }

  const given = Buffer.from(hashOtp(email, otp), "hex");
  const stored = Buffer.from(d.hash, "hex");
  const match = given.length === stored.length && crypto.timingSafeEqual(given, stored);

  if (!match) {
    await ref.update({ attempts: d.attempts + 1 });
    return res.status(400).json({ error: "Incorrect code." });
  }

  try {
    await auth.createUser({ email, password, emailVerified: true });
  } catch (e) {
    if (e.code === "auth/email-already-exists")
      return res.status(409).json({ error: "An account with this email already exists." });
    console.error("createUser error", e);
    return res.status(500).json({ error: "Could not create account." });
  }

  await ref.delete();
  return res.status(200).json({ ok: true });
}
