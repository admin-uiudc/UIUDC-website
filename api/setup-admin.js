import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

export default async function handler(req, res) {
  // Replace with the email you registered for your Admin account
  const ADMIN_EMAIL = 'president.uiudc@gmail.com'; 
  const { key } = req.query;

  if (!key || key !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    await admin.firestore().collection('users').doc(user.uid).set(
      { role: 'admin', portalAccess: true, onboardingStep: 'completed' },
      { merge: true }
    );
    return res.status(200).json({ success: true, message: `${ADMIN_EMAIL} is now an Admin.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}