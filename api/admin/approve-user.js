import admin from 'firebase-admin';
import { google } from 'googleapis';
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
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.admin !== true) {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    const { targetUid, action } = req.body;
    if (!targetUid || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request parameters.' });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found.' });

    const userData = userSnap.data();

    if (action === 'approve') {
      const targetUser = await admin.auth().getUser(targetUid);
      const existingClaims = targetUser.customClaims || {};
      await admin.auth().setCustomUserClaims(targetUid, { ...existingClaims, approved: true });

      await userRef.update({
        portalAccess: true,
        paymentStatus: 'verified',
        approvedAt: new Date().toISOString(),
        approvedBy: decoded.email || decoded.uid
      });

      // Update Column H ('Status') in 'Payments' tab if present
      try {
        const auth = new google.auth.JWT({
          email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const sheetRes = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: 'Payments!A:A'
        });
        const rows = sheetRes.data.values || [];
        const rowIndex = rows.findIndex((r) => r[0] === targetUid);
        if (rowIndex !== -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `Payments!H${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['Verified']] }
          });
        }
      } catch (sheetErr) {
        console.error('Sheet update warning:', sheetErr);
      }

      // Send confirmation email via Resend
      await resend.emails.send({
        from: 'UIU Debate Club <onboarding@resend.dev>', // Switch to your verified domain when ready
        to: [userData.email],
        subject: 'Membership Approved! Welcome to UIU Debate Club Portal',
        html: `
          <div style="font-family: Montserrat, Arial, sans-serif; color: #1f2937; max-width: 560px; margin: auto; padding: 24px; border: 2px solid #f0801f; border-radius: 16px;">
            <h2 style="color: #f0801f; margin-top: 0;">Payment Verified &amp; Access Granted!</h2>
            <p>Dear <b>${userData.fullName || 'Member'}</b>,</p>
            <p>Your recruitment fee payment (<b>${userData.paymentMethod}</b> &mdash; ID: <code>${userData.transactionId}</code>) has been verified by the UIU Debate Club administration.</p>
            <p>Your Members Portal account is now active. You can log in anytime using your registered email and password:</p>
            <p style="text-align: center; margin: 28px 0;">
              <a href="https://uiudc-website.vercel.app/login.html" style="background: #f0801f; color: #fff; text-decoration: none; font-weight: 700; padding: 14px 32px; border-radius: 999px; display: inline-block;">LOG IN TO PORTAL</a>
            </p>
            <p style="font-size: 13px; color: #6b7280;">Login Email: <b>${userData.email}</b></p>
          </div>
        `
      });

      return res.status(200).json({ success: true, message: 'User approved and confirmation email sent.' });
    } else {
      await userRef.update({
        portalAccess: false,
        paymentStatus: 'rejected'
      });
      return res.status(200).json({ success: true, message: 'Payment marked as rejected.' });
    }
  } catch (err) {
    console.error('Approve user error:', err);
    return res.status(500).json({ error: 'Failed to process approval.' });
  }
}