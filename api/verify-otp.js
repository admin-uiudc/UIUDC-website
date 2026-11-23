import admin from 'firebase-admin';
import crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify Firebase user
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const { otp, turnstileToken } = req.body;
    if (!otp || !turnstileToken) {
      return res.status(400).json({ error: 'OTP and CAPTCHA are required.' });
    }

    // 2. Verify Cloudflare Turnstile CAPTCHA
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: turnstileToken
      })
    });
    const cfData = await cfRes.json();
    if (!cfData.success) {
      return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }

    // 3. Verify OTP hash & expiry from Firestore
    const db = admin.firestore();
    const otpRef = db.collection('otps').doc(uid);
    const otpSnap = await otpRef.get();

    if (!otpSnap.exists) {
      return res.status(400).json({ error: 'No OTP found. Please request a new code.' });
    }

    const { otpHash, expiresAt } = otpSnap.data();
    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    const submittedHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');
    if (submittedHash !== otpHash) {
      return res.status(400).json({ error: 'Invalid OTP. Please check your email and try again.' });
    }

    // 4. Mark email verified, advance onboardingStep to 3, and delete used OTP
    await admin.auth().updateUser(uid, { emailVerified: true });
    await db.collection('users').doc(uid).update({ onboardingStep: 3 });
    await otpRef.delete();

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server verification error.' });
  }
}