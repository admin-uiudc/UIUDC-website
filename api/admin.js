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
        const { uid, approve } = req.body;
        if (!uid) throw fail(400, 'Missing user UID.');
        await db.collection('users').doc(uid).update({
          paymentStatus: approve ? 'verified' : 'rejected',
          portalAccess: !!approve,
          reviewedBy: adminUser.email || adminUser.uid,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
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
