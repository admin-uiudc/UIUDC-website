import admin from 'firebase-admin';
import crypto from 'crypto';
import { Resend } from 'resend';

if (!admin.apps.length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const resend = new Resend(process.env.RESEND_API_KEY);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export default async function handler(req, res) {
  // CORS: replace * with your site's origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email;                 // trust the token, not the body
    const username = esc(req.body?.username || 'there');
    if (!email) return res.status(400).json({ error: 'No email on account' });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const db = admin.firestore();
    await db.collection('otps').doc(uid).set({
      otpHash,
      attempts: 0,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    await db.collection('users').doc(uid).set({
      username: req.body?.username, email, onboardingStep: 2,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const { error } = await resend.emails.send({
      from: 'UIU Debate Club <onboarding@resend.dev>',
      to: email,
      subject: 'Your Verification Code',
      html: `<p>Hi <strong>${username}</strong>,</p><p>Your 6-digit verification code is:</p><h2>${otp}</h2><p>This code expires in 10 minutes.</p>`
    });
    if (error) {
      console.error('Resend error:', error);
      return res.status(502).json({ error: error.message || 'Email failed' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not send OTP email.' });
  }
}
