/* Workshop titles and links. They stay on the server and are only sent to signed-in members.
   TO EDIT: change title/url (paste unlisted YouTube links). Keep every quote and comma.
   Leave url: "" and the video shows as "link coming soon". */
const INTERNAL = [
  { label: "AP Debate Bootcamp", videos: [
    { title: "Introduction to AP Debate", url: "" },
    { title: "Bootcamp Session 2", url: "" },
    { title: "Bootcamp Session 3", url: "" },
  ]},
  { label: "Workshop Session Shahriar Kabir Rahat", videos: [
    { title: "Workshop Part 1", url: "" },
    { title: "Workshop Part 2", url: "" },
    { title: "Workshop Part 3", url: "" },
  ]},
  { label: "Workshop Session: Knowledge Matters", videos: [
    { title: "International Relations: NAME", url: "" },
    { title: "Workshop Part 2", url: "" },
    { title: "Workshop Part 3", url: "" },
  ]},
];
const OPEN = [
  { label: "Sample Dropdown 1", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
  { label: "Sample Dropdown 2", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
  { label: "Sample Dropdown 3", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
];

/* ---------------- Access control (no need to edit, except isMember) ---------------- */
const admin = require('firebase-admin');
if (!admin.apps.length) {
  // If your api/send-otp.js already initialises Firebase Admin, copy that exact setup here.
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

// Who counts as a UIUDC member? Default: any signed-in user with a verified email.
// To restrict further, check Firestore, e.g.:
//   const d = await admin.firestore().doc('members/' + decoded.uid).get(); return d.exists;
async function isMember(decoded) {
  return decoded.email_verified !== false;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ error: 'unauthenticated' });
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(m[1], true); }
  catch (e) { return res.status(401).json({ error: 'unauthenticated' }); }
  if (!(await isMember(decoded))) return res.status(403).json({ error: 'forbidden' });
  if (req.query.page === 'academy') return res.status(200).json({ internal: INTERNAL, open: OPEN });
  return res.status(404).json({ error: 'not found' });
};
