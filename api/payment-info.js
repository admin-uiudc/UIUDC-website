import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

// Returns the payment instructions that admins edit in the admin console.
// Any logged-in user may read them (applicants are not portal members yet).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    await admin.auth().verifyIdToken(token).catch(() => {
      throw Object.assign(new Error('Please log in again.'), { status: 401 });
    });
    const snap = await admin.firestore().collection('site_content').doc('payment').get();
    const d = snap.exists ? snap.data() : {};
    return res.status(200).json({
      bkash: d.bkash || {},
      nagad: d.nagad || {},
      rocket: d.rocket || {},
      cash: d.cash || {}
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Payment info error:', err);
    return res.status(500).json({ error: 'Could not load payment instructions.' });
  }
}
