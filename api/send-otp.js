const crypto = require("crypto");
const { db, auth, emailKey, hashOtp, verifyCaptcha, isEmail } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const email = String(req.body?.email || "").trim().toLowerCase();
  const { captchaToken } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: "Invalid email" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!(await verifyCaptcha(captchaToken, ip)))
    return res.status(400).json({ error: "Captcha failed. Please try again." });

  // Already registered?
  try {
    await auth.getUserByEmail(email);
    return res.status(409).json({ error: "An account with this email already exists." });
  } catch (e) {
    if (e.code !== "auth/user-not-found") return res.status(500).json({ error: "Server error" });
  }

  const ref = db.collection("otps").doc(emailKey(email));
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists && now - snap.data().sentAt < 60_000)
    return res.status(429).json({ error: "Please wait a minute before requesting another code." });

  const otp = String(crypto.randomInt(100000, 1000000));
  await ref.set({
    hash: hashOtp(email, otp),
    sentAt: now,
    expiresAt: now + 10 * 60_000,
    attempts: 0,
  });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM, // e.g. "Your Site <no-reply@yourdomain.com>"
      to: [email],
      subject: "Your verification code",
      html: `<p>Your verification code is:</p><h2 style="letter-spacing:4px">${otp}</h2><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
    }),
  });

  if (!r.ok) {
    await ref.delete();
    return res.status(502).json({ error: "Could not send email. Try again later." });
  }
  return res.status(200).json({ ok: true });
};
