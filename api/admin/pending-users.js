import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.admin !== true) {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    const db = admin.firestore();
    const snap = await db.collection('users').where('paymentSubmitted', '==', true).get();

    const users = [];
    snap.forEach((doc) => {
      const d = doc.data();
      users.push({
        uid: doc.id,
        fullName: d.fullName || '',
        universityId: d.universityId || '',
        email: d.email || '',
        paymentMethod: d.paymentMethod || '',
        transactionId: d.transactionId || '',
        paymentStatus: d.paymentStatus || 'pending_verification',
        portalAccess: !!d.portalAccess
      });
    });

    return res.status(200).json({ users });
  } catch (err) {
    console.error('Pending users error:', err);
    return res.status(500).json({ error: 'Failed to load applicants.' });
  }
}