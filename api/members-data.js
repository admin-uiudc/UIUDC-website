import admin from "firebase-admin";
import { auth } from "../lib/server.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

const DEFAULT_INTERNAL = [
  { label: "AP Debate Bootcamp", videos: [
    { title: "Introduction to AP Debate", url: "" },
    { title: "Bootcamp Session 2", url: "" },
    { title: "Bootcamp Session 3", url: "" },
  ]},
  { label: "Workshop Session Shahriar Kabir Rahat", videos: [
    { title: "Workshop Shahriar Kabir Rahat S1: Prologue", url: "https://youtu.be/ADel2vut-ho" },
    { title: "Workshop Shahriar Kabir Rahat S2: Introduction", url: "https://youtu.be/Plf-DtUAbGM" },
    { title: "Workshop Part #", url: "" },
    { title: "Workshop Part #", url: "" },
    { title: "Workshop Shahriar Kabir Rahat S7: Likelihood Analysis", url: "https://youtu.be/3fJRTvfVeQw" },
    { title: "Workshop Shahriar Kabir Rahat S8: Thought Process & Scripting", url: "https://youtu.be/83GP6RTcIlE" },
    { title: "Workshop Shahriar Kabir Rahat S9: Response and Comparetive", url: "https://youtu.be/RXa7q9Gm8aI" },
    { title: "Workshop Part #", url: "" },
  ]},
  { label: "Workshop Session: Knowledge Matters", videos: [
    { title: "International Relations: NAME", url: "" },
    { title: "Workshop Part 2", url: "" },
    { title: "Workshop Part 3", url: "" },
  ]},
];

const DEFAULT_OPEN = [
  { label: "Sample Dropdown 1", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
  { label: "Sample Dropdown 2", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
  { label: "Sample Dropdown 3", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
];

const DEFAULT_LIBRARY = [
  { label: "Method", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
  { label: "Matter", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
  { label: "Tips and Tricks", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
  { label: "Adjudication", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
];

async function isMember(decoded) {
  const [userDoc, adminDoc] = await Promise.all([
    db.collection("users").doc(decoded.uid).get(),
    db.collection("admins").doc(decoded.uid).get()
  ]);
  if (adminDoc.exists) return true;
  if (!userDoc.exists) return false;
  const d = userDoc.data();
  return d.portalAccess === true && d.paymentStatus === "verified";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return res.status(401).json({ error: "unauthenticated" });
  let decoded;
  try { decoded = await auth.verifyIdToken(m[1], true); }
  catch (e) { return res.status(401).json({ error: "unauthenticated" }); }
  if (!(await isMember(decoded))) return res.status(403).json({ error: "forbidden" });

  if (req.query.page === "academy") {
    const snap = await db.collection("site_content").doc("academy").get();
    const data = snap.exists ? snap.data() : {};
    return res.status(200).json({
      internal: data.internal || DEFAULT_INTERNAL,
      open: data.open || DEFAULT_OPEN
    });
  }
  if (req.query.page === "digilib") {
    const snap = await db.collection("site_content").doc("digilib").get();
    const data = snap.exists ? snap.data() : {};
    return res.status(200).json({
      categories: data.categories || DEFAULT_LIBRARY
    });
  }
  if (req.query.page === "notices") {
    const snap = await db.collection("site_content").doc("notices").get();
    return res.status(200).json({
      items: snap.exists ? snap.data().items || [] : null
    });
  }
  return res.status(404).json({ error: "not found" });
}
