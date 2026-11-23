import admin from 'firebase-admin';
import crypto from 'crypto';
import { Resend } from 'resend';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify the user who just signed up on signup.html
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const { username, email } = req.body;

    // 2. Generate 6-digit OTP and hash it before storing in Firestore
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const db = admin.firestore();
    await db.collection('otps').doc(uid).set({
      otpHash,
      expiresAt: Date.now() + 10 * 60 * 1000 // Valid for 10 minutes
    });

    await db.collection('users').doc(uid).set({
      username,
      email,
      onboardingStep: 2,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 3. Send OTP email
    await resend.emails.send({
      from: 'UIU Debate Club <onboarding@yourdomain.com>', // Use onboarding@resend.dev while testing
      to: email,
      subject: 'Your Verification Code',
      html: `<p>Hi <strong>${username}</strong>,</p><p>Your 6-digit verification code is: <h2>${otp}</h2></p><p>This code expires in 10 minutes.</p>`
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not send OTP email.' });
  }
}