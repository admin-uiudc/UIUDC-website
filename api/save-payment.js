import admin from 'firebase-admin';
import { google } from 'googleapis';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

// Fixed recruitment fee shown in the Payments sheet
const RECRUITMENT_FEE = '500 BDT';
const METHODS = ['bKash', 'Nagad', 'Rocket', 'Cash'];

const fail = (status, error) => Object.assign(new Error(error), { status });

function sheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let userRef = null;
  let claimed = false;

  try {
    // 1. Verify the logged-in Firebase user
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) throw fail(401, 'Unauthorized');
    const decoded = await admin.auth().verifyIdToken(token).catch(() => {
      throw fail(401, 'Please log in again.');
    });
    const uid = decoded.uid;

    // 2. Validate the input before touching the database
    const method = String(req.body?.method || '');
    const reference = String(req.body?.reference || '').trim();
    if (!METHODS.includes(method) || !/^[A-Za-z0-9\-_\/]{4,40}$/.test(reference))
      throw fail(400, 'Invalid payment method or Transaction ID.');

    // 3. Claim the submission inside a transaction so a double click
    //    (or a replayed request) can never create two payment rows.
    const db = admin.firestore();
    userRef = db.collection('users').doc(uid);

    const user = await db.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      const d = snap.exists ? snap.data() : null;
      if (!d) throw fail(403, 'Please complete your personal information first.');
      if (d.paymentSubmitted)
        throw fail(400, 'Payment details have already been submitted for this account.');
      if (d.onboardingStep !== 4)
        throw fail(403, 'Please complete your personal information first.');
      t.update(userRef, { paymentSubmitted: true });
      return d;
    });
    claimed = true;

    // 4. Append one row to the "Payments" tab (columns A:G)
    //    RAW stops Google Sheets from running text as a formula.
    const sheets = sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Payments!A:G',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          uid,
          user.universityId || '',
          user.fullName || '',
          method,
          reference,
          RECRUITMENT_FEE,
          new Date().toISOString()
        ]]
      }
    });

    // 5. Mark onboarding complete; payment waits for admin verification
    await userRef.update({
      onboardingStep: 'completed',
      paymentStatus: 'pending_verification',
      paymentMethod: method,
      transactionId: reference
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    // If the sheet write failed after we claimed the submission, release it so the member can retry.
    if (claimed && userRef) {
      await userRef.update({ paymentSubmitted: false }).catch(() => {});
    }
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Save payment error:', error);
    return res.status(500).json({ error: 'Failed to submit payment details. Please try again.' });
  }
}
