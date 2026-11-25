import { auth } from "../lib/server.js";

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
const OPEN = [
  { label: "Sample Dropdown 1", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
  { label: "Sample Dropdown 2", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
  { label: "Sample Dropdown 3", videos: [{ title: "Sample Workshop A", url: "" }, { title: "Sample Workshop B", url: "" }, { title: "Sample Workshop C", url: "" }] },
];

/* DiGiLiB (Digital Library): one entry per left-side button. Each file = one table row.
   name = resource name, date = upload date shown as written, by = uploader,
   url = public Google Drive (or similar) share link. Leave url: "" for "Link coming soon". */
const LIBRARY = [
  { label: "Method", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
  { label: "Matter", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
  { label: "Tips and Tricks", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
  { label: "Adjudication", files: [ { name: "Sample resource 1", date: "25 Nov 2026", by: "Uploader name", url: "" }, { name: "Sample resource 2", date: "25 Nov 2026", by: "Uploader name", url: "" } ] },
];

/* ---------------- Access control (no need to edit, except isMember) ---------------- */

// Who counts as a UIUDC member? Signup already requires an emailed OTP, so any existing account passes.
// To allow only approved members, import { db } above and use:
//   const d = await db.collection("members").doc(decoded.uid).get(); return d.exists;
async function isMember(decoded) {
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return res.status(401).json({ error: "unauthenticated" });
  let decoded;
  try { decoded = await auth.verifyIdToken(m[1], true); }
  catch (e) { return res.status(401).json({ error: "unauthenticated" }); }
  if (!(await isMember(decoded))) return res.status(403).json({ error: "forbidden" });
  if (req.query.page === "academy") return res.status(200).json({ internal: INTERNAL, open: OPEN });
  return res.status(404).json({ error: "not found" });
}
