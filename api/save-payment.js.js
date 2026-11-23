import admin from 'firebase-admin';
import { google } from 'googleapis';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

// Set your fixed recruitment fee here (e.g., "500 BDT" or "300 BDT")
const RECRUITMENT_FEE = '500 BDT';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify Firebase user token
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2. Check Firestore user state (must have completed Step 3)
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists || userSnap.data().onboardingStep < 4) {
      return res.status(403).json({ error: 'Please complete your personal information first.' });
    }

    const { universityId, fullName, paymentSubmitted } = userSnap.data();
    if (paymentSubmitted) {
      return res.status(400).json({ error: 'Payment details have already been submitted for this account.' });
    }

    const { method, reference } = req.body;
    const allowedMethods = ['bKash', 'Nagad', 'Rocket', 'Cash'];
    if (!allowedMethods.includes(method) || !/^[A-Za-z0-9\-_\/]{4,40}$/.test(reference || '')) {
      return res.status(400).json({ error: 'Invalid payment method or Transaction ID.' });
    }

    // 3. Authenticate with Google Sheets API
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 4. Append row to 'Payments' tab (Columns A through G)
    const rowValues = [[
      uid,
      universityId || '',
      fullName || '',
      method,
      reference.trim(),
      RECRUITMENT_FEE,
      new Date().toISOString()
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Payments!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rowValues }
    });

    // 5. Mark onboarding complete & payment pending admin verification
    await userRef.update({
      onboardingStep: 'completed',
      paymentSubmitted: true,
      paymentStatus: 'pending_verification',
      paymentMethod: method,
      transactionId: reference.trim()
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Save payment error:', error);
    return res.status(500).json({ error: 'Failed to submit payment details. Please try again.' });
  }
}