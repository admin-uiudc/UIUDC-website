import admin from 'firebase-admin';
import { google } from 'googleapis';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists || userSnap.data().onboardingStep < 3) {
      return res.status(403).json({ error: 'Please verify your email OTP first.' });
    }

    const { username, email } = userSnap.data();
    const b = req.body;

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const rowValues = [[
      uid,
      username || '',
      email || '',
      b.fullName || '',
      b.dob || '',
      b.gender || '',
      b.phone ? `'${b.phone}` : '',
      b.bloodGroup || '',
      b.emergencyPhone ? `'${b.emergencyPhone}` : '',
      b.emergencyRelation || '',
      b.address || '',
      b.department || '',
      b.batch || '',
      b.universityId || '',
      b.universityEmail || '',
      b.debated || '',
      b.training || '',
      b.competition || '',
      b.pastDebatingExperience || '',
      b.debatingAchievements || '',
      b.eca || '',
      b.ecaInvolved || '',
      b.ecaPosition || '',
      b.pastEca || '',
      b.joinDepartments || '',
      b.skills || '',
      b.devices || '',
      new Date().toISOString()
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Users!A:AB',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rowValues }
    });

    await userRef.update({
      onboardingStep: 4,
      fullName: b.fullName || '',
      universityId: b.universityId || ''
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Save profile error:', error);
    return res.status(500).json({ error: 'Failed to save your information. Please try again.' });
  }
}