import admin from 'firebase-admin';
import { google } from 'googleapis';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const GENDERS = ['Male', 'Female', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const YES_NO_FIELDS = ['debated', 'training', 'competition', 'eca', 'ecaInvolved', 'ecaPosition'];

const fail = (status, error) => Object.assign(new Error(error), { status });

// Trim, flatten arrays and cap the length so nobody can stuff huge text into the sheet.
const clean = (v, max = 2000) =>
  (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim().slice(0, max);

function sheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

function validate(b) {
  const p = {
    fullName: clean(b.fullName, 120),
    dob: clean(b.dob, 10),
    gender: clean(b.gender, 10),
    phone: clean(b.phone, 30),
    bloodGroup: clean(b.bloodGroup, 5),
    emergencyPhone: clean(b.emergencyPhone, 30),
    emergencyRelation: clean(b.emergencyRelation, 60),
    address: clean(b.address, 300),
    department: clean(b.department, 120),
    batch: clean(b.batch, 20),
    universityId: clean(b.universityId, 30),
    universityEmail: clean(b.universityEmail, 120),
    debated: clean(b.debated, 3),
    training: clean(b.training, 3),
    competition: clean(b.competition, 3),
    pastDebatingExperience: clean(b.pastDebatingExperience),
    debatingAchievements: clean(b.debatingAchievements),
    eca: clean(b.eca, 3),
    ecaInvolved: clean(b.ecaInvolved, 3),
    ecaPosition: clean(b.ecaPosition, 3),
    pastEca: clean(b.pastEca),
    joinDepartments: clean(b.joinDepartments, 300),
    skills: clean(b.skills, 500),
    devices: clean(b.devices, 300)
  };

  const required = [
    'fullName', 'dob', 'phone', 'emergencyPhone', 'emergencyRelation',
    'address', 'department', 'batch', 'universityId', 'universityEmail'
  ];
  const bad =
    required.some((k) => !p[k]) ||
    !GENDERS.includes(p.gender) ||
    !BLOOD_GROUPS.includes(p.bloodGroup) ||
    !YES_NO_FIELDS.every((k) => ['yes', 'no'].includes(p[k])) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.dob) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.universityEmail);

  if (bad) throw fail(400, 'Please complete all required fields correctly.');
  return p;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Verify the logged-in Firebase user
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) throw fail(401, 'Unauthorized');
    const decoded = await admin.auth().verifyIdToken(token).catch(() => {
      throw fail(401, 'Please log in again.');
    });
    const uid = decoded.uid;

    // 2. Check onboarding state (written by /api/verify-otp)
    const userRef = admin.firestore().collection('users').doc(uid);
    const snap = await userRef.get();
    const user = snap.exists ? snap.data() : null;

    if (!user || ![3, 4].includes(user.onboardingStep)) {
      if (user && (user.onboardingStep === 'completed' || user.paymentSubmitted))
        throw fail(400, 'Your information has already been submitted.');
      throw fail(403, 'Please verify your email OTP first.');
    }

    // 3. Validate the form data
    const p = validate(req.body || {});

    // Column order must match the header row of the "Users" tab (A:AB)
    const row = [
      uid,
      user.username || '',
      user.email || decoded.email || '',
      p.fullName,
      p.dob,
      p.gender,
      p.phone,
      p.bloodGroup,
      p.emergencyPhone,
      p.emergencyRelation,
      p.address,
      p.department,
      p.batch,
      p.universityId,
      p.universityEmail,
      p.debated,
      p.training,
      p.competition,
      p.pastDebatingExperience,
      p.debatingAchievements,
      p.eca,
      p.ecaInvolved,
      p.ecaPosition,
      p.pastEca,
      p.joinDepartments,
      p.skills,
      p.devices,
      new Date().toISOString()
    ];

    // 4. Write to the "Users" sheet: update this member's row if it exists, otherwise add one.
    //    RAW stops Google Sheets from running text like "=IMPORTXML(...)" as a formula.
    const sheets = sheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const colA = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Users!A:A' });
    const idx = (colA.data.values || []).findIndex((r) => r[0] === uid);

    if (idx >= 0) {
      const n = idx + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Users!A${n}:AB${n}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Users!A:AB',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] }
      });
    }

    // 5. Move on to the payment step
    await userRef.update({
      onboardingStep: 4,
      fullName: p.fullName,
      universityId: p.universityId
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Save profile error:', error);
    return res.status(500).json({ error: 'Failed to save your information. Please try again.' });
  }
}
