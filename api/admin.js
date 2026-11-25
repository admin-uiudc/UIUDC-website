import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const db = admin.firestore();
const fail = (status, error) => Object.assign(new Error(error), { status });

async function requireAdmin(req) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) throw fail(401, 'Unauthorized');
  const decoded = await admin.auth().verifyIdToken(token).catch(() => {
    throw fail(401, 'Session expired. Please log in again.');
  });
  const adminDoc = await db.collection('admins').doc(decoded.uid).get();
  if (!adminDoc.exists) throw fail(403, 'Access denied: You are not listed as an admin.');
  return decoded;
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

async function sendApprovalEmail({ toEmail, fullName, universityId, customMessage }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'UIU Debate Club';

  if (!apiKey || !senderEmail || !toEmail) {
    throw new Error('Missing Brevo configuration or recipient email.');
  }

  const safeName = escHtml(fullName || 'Member');
  const safeId = escHtml(universityId || '');
  const extraBlock = customMessage
    ? `<p style="background:#fff4e8;border-left:4px solid #ff7a00;padding:12px 16px;border-radius:6px;color:#1f2937;">${escHtml(customMessage).replace(/\n/g, '<br>')}</p>`
    : '';

  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.6;">
      <h2 style="color:#ff7a00;margin-bottom:8px;">Welcome to UIU Debate Club!</h2>
      <p>Dear <strong>${safeName}</strong>${safeId ? ` (ID: ${safeId})` : ''},</p>
      <p>Your membership payment has been verified and your <strong>UIUDC Members Portal</strong> access is now active.</p>
      ${extraBlock}
      <p>You can log in using the email and password you created during registration to access the Notice Board, Digital Academy, and DiGiLiB.</p>
      <p style="margin:24px 0;">
        <a href="https://uiudc-website.vercel.app/LogIn.html" style="background:#ff7a00;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block;">Log In to UIUDC Portal</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">Here we believe success is a habit.<br>— Executive Committee, UIU Debate Club</p>
    </div>
  `;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail, name: fullName || toEmail }],
      subject: 'Membership Approved — Welcome to UIU Debate Club!',
      htmlContent
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${errBody}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const adminUser = await requireAdmin(req);
    const action = req.query.action || req.body?.action;

    // 1. GET: Fetch all users, notices, academy, and digilib data
    if (req.method === 'GET') {
      const [usersSnap, noticesDoc, academyDoc, digilibDoc] = await Promise.all([
        db.collection('users').get(),
        db.collection('site_content').doc('notices').get(),
        db.collection('site_content').doc('academy').get(),
        db.collection('site_content').doc('digilib').get()
      ]);

      const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      return res.status(200).json({
        adminEmail: adminUser.email,
        users,
        notices: noticesDoc.exists ? noticesDoc.data().items || [] : null,
        academy: academyDoc.exists ? academyDoc.data() : null,
        digilib: digilibDoc.exists ? digilibDoc.data().categories || [] : null
      });
    }

    // 2. POST: Perform admin updates
    if (req.method === 'POST') {
      if (action === 'approveMember') {
        const { uid, approve, customMessage } = req.body;
        if (!uid) throw fail(400, 'Missing user UID.');

        const userRef = db.collection('users').doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw fail(404, 'User record not found.');
        const userData = userSnap.data();

        await userRef.update({
          paymentStatus: approve ? 'verified' : 'rejected',
          portalAccess: !!approve,
          reviewedBy: adminUser.email || adminUser.uid,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let emailSent = false;
        let emailError = null;
        if (approve && userData.email) {
          try {
            await sendApprovalEmail({
              toEmail: userData.email,
              fullName: userData.fullName,
              universityId: userData.universityId,
              customMessage: String(customMessage || '').trim()
            });
            emailSent = true;
          } catch (mailErr) {
            console.error('Approval email failed:', mailErr);
            emailError = mailErr.message;
          }
        }

        return res.status(200).json({ success: true, emailSent, emailError });
      }

      if (action === 'saveNotices') {
        const { items } = req.body;
        if (!Array.isArray(items)) throw fail(400, 'Invalid notices payload.');
        await db.collection('site_content').doc('notices').set({
          items,
          updatedBy: adminUser.email || adminUser.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'saveAcademy') {
        const { internal, open } = req.body;
        if (!Array.isArray(internal) || !Array.isArray(open)) {
          throw fail(400, 'Invalid academy payload.');
        }
        await db.collection('site_content').doc('academy').set({
          internal,
          open,
          updatedBy: adminUser.email || adminUser.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'saveDigilib') {
        const { categories } = req.body;
        if (!Array.isArray(categories)) throw fail(400, 'Invalid library payload.');
        await db.collection('site_content').doc('digilib').set({
          categories,
          updatedBy: adminUser.email || adminUser.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
      }

      throw fail(400, 'Unknown action.');
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Admin API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
