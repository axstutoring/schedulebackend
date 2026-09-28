const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Dotenv = require('dotenv').config(); // create a .env file with these vars if running locally

// ---- Same MongoDB cluster/connection pattern as before ----
const connection = 'mongodb+srv://KevinTang:' + process.env.M_PASSWORD + '@axs-tutoring.c24c5cd.mongodb.net/?retryWrites=true&w=majority';

const connectDB = async () => {
  mongoose.set('strictQuery', false);
  await mongoose.connect(connection)
    .then(() => console.log('Connected to DB'))
    .catch(console.error);
};

const app = express();
// Default body-size limit (100kb) is too small for a base64-encoded PDF
// attachment on a booking — 11mb comfortably covers the 8MB decoded cap
// enforced in the booking route, plus base64's ~33% size overhead.
app.use(express.json({ limit: '11mb' }));
app.use(cors());

connectDB().then(() => {
  app.listen(8080, () => { console.log('Server listening on port 8080'); });
});

// ---- Same email sending service as before (Zoho via nodemailer) ----
const transporter = nodemailer.createTransport({
  service: 'Zoho',
  auth: {
    user: 'axstutoring@zohomail.com',
    pass: process.env.E_PASSWORD,
  },
});

const tutoringChairs = 'Elliot Stack and Toon Wachiratienchai';

function sendMail(options) {
  return new Promise((resolve, reject) => {
    transporter.sendMail(options, (err, info) => {
      if (err) reject(err);
      else resolve(info);
    });
  });
}

function isUclaEmail(email) {
  return typeof email === 'string' && email.toLowerCase().trim().endsWith('@g.ucla.edu');
}

// ---- Models ----
const Student = require('./models/Student');
const Tutor = require('./models/Tutor');
const Booking = require('./models/Booking');
const Classes = require('./models/Classes');
const ReviewSession = require('./models/ReviewSession');
const Setting = require('./models/Setting');

// ---- Auth helpers ----
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-vercel-env-vars';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Middleware factory: requires a valid token, optionally of a specific type
// (student / tutor / admin). Puts the decoded payload on req.auth.
function requireAuth(type) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
    if (type && decoded.type !== type && !(type === 'tutor' && decoded.isAdmin)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.auth = decoded;
    next();
  };
}

// ============================================================
// Health
// ============================================================

app.get('/api/health', async (req, res) => {
  res.json({ ok: true });
});

// ============================================================
// Auth
// ============================================================

app.post('/api/auth/student/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isUclaEmail(email)) {
      return res.status(400).json({ error: 'Please use your @g.ucla.edu email address to sign up' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await Student.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const student = await Student.create({ name, email: email.toLowerCase(), password: hashed });

    const token = createToken({ userId: student._id.toString(), email: student.email, type: 'student' });
    res.status(201).json({ success: true, token, user: { name: student.name, email: student.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/student/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = await Student.findOne({ email: (email || '').toLowerCase() });
    if (!student) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password || '', student.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = createToken({ userId: student._id.toString(), email: student.email, type: 'student' });
    res.json({ success: true, token, user: { name: student.name, email: student.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/tutor/signup', async (req, res) => {
  try {
    const { name, email, password, subjects } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isUclaEmail(email)) {
      return res.status(400).json({ error: 'Please use your @g.ucla.edu email address to sign up' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await Tutor.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const tutor = await Tutor.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      subjects: subjects || [],
      isApproved: false,
    });

    // Let the admin know a new tutor is waiting on approval — otherwise the
    // only way to notice is checking the dashboard unprompted.
    // Must be awaited: on Vercel, the function can be frozen the instant the
    // HTTP response is sent, so a fire-and-forget promise here has no
    // guarantee of ever completing (matches the awaited pattern every other
    // email in this file already uses).
    if (process.env.ADMIN_EMAIL) {
      try {
        const template = await getEmailTemplate('newTutorApplication');
        await sendMail({
          from: 'axstutoring@zohomail.com',
          to: process.env.ADMIN_EMAIL,
          subject: `New Tutor Application — ${tutor.name}`,
          text: fillTemplate(template, { tutorName: tutor.name, tutorEmail: tutor.email }),
        });
      } catch (e) {
        console.error('new tutor application email failed', e);
      }
    }

    res.status(201).json({
      success: true,
      pendingApproval: true,
      message: 'Your application has been submitted and is awaiting admin approval.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/student/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const student = await Student.findOne({ email: (email || '').toLowerCase() });
    if (!student) return res.status(404).json({ error: 'No account exists with this email address' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    student.resetCodeHash = await bcrypt.hash(code, 10);
    student.resetCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await student.save();

    await sendMail({
      from: 'axstutoring@zohomail.com',
      to: student.email,
      subject: 'AXS Tutoring - Password Reset Code',
      text: `Dear ${student.name},\n\nYour password reset code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\nSincerely,\n${tutoringChairs}`,
    }).catch((e) => console.error('reset code email failed', e));

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/student/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const student = await Student.findOne({ email: (email || '').toLowerCase() });
    if (!student || !student.resetCodeHash || !student.resetCodeExpiresAt) {
      return res.status(400).json({ error: 'Please request a new verification code' });
    }
    if (student.resetCodeExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Your verification code has expired' });
    }
    const isMatch = await bcrypt.compare(code || '', student.resetCodeHash);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect verification code' });

    const resetToken = createToken({ userId: student._id.toString(), email: student.email, type: 'password-reset' });
    res.json({ success: true, resetToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/student/reset-password', async (req, res) => {
  try {
    const { resetToken, password } = req.body;
    const decoded = verifyToken(resetToken);
    if (!decoded || decoded.type !== 'password-reset') {
      return res.status(401).json({ error: 'Reset session expired — please start again' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const student = await Student.findById(decoded.userId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    student.password = await bcrypt.hash(password, 10);
    student.resetCodeHash = undefined;
    student.resetCodeExpiresAt = undefined;
    await student.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/tutor/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const tutor = await Tutor.findOne({ email: (email || '').toLowerCase() });
    if (!tutor) return res.status(404).json({ error: 'No account exists with this email address' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    tutor.resetCodeHash = await bcrypt.hash(code, 10);
    tutor.resetCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await tutor.save();

    await sendMail({
      from: 'axstutoring@zohomail.com',
      to: tutor.email,
      subject: 'AXS Tutoring - Password Reset Code',
      text: `Dear ${tutor.name},\n\nYour password reset code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\nSincerely,\n${tutoringChairs}`,
    }).catch((e) => console.error('reset code email failed', e));

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/tutor/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const tutor = await Tutor.findOne({ email: (email || '').toLowerCase() });
    if (!tutor || !tutor.resetCodeHash || !tutor.resetCodeExpiresAt) {
      return res.status(400).json({ error: 'Please request a new verification code' });
    }
    if (tutor.resetCodeExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Your verification code has expired' });
    }
    const isMatch = await bcrypt.compare(code || '', tutor.resetCodeHash);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect verification code' });

    const resetToken = createToken({ userId: tutor._id.toString(), email: tutor.email, type: 'tutor-password-reset' });
    res.json({ success: true, resetToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/tutor/reset-password', async (req, res) => {
  try {
    const { resetToken, password } = req.body;
    const decoded = verifyToken(resetToken);
    if (!decoded || decoded.type !== 'tutor-password-reset') {
      return res.status(401).json({ error: 'Reset session expired — please start again' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const tutor = await Tutor.findById(decoded.userId);
    if (!tutor) return res.status(404).json({ error: 'Tutor not found' });

    tutor.password = await bcrypt.hash(password, 10);
    tutor.resetCodeHash = undefined;
    tutor.resetCodeExpiresAt = undefined;
    await tutor.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/tutor/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const tutor = await Tutor.findOne({ email: (email || '').toLowerCase() });
    if (!tutor) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password || '', tutor.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    if (!tutor.isApproved) {
      return res.status(403).json({ error: 'Your account is still awaiting admin approval.' });
    }

    const token = createToken({ userId: tutor._id.toString(), email: tutor.email, type: 'tutor', isAdmin: tutor.isAdmin });
    const { password: _pw, ...tutorData } = tutor.toObject();
    res.json({ success: true, token, tutor: tutorData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/admin/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = createToken({ email, type: 'admin', isAdmin: true });
    res.json({ success: true, token, isAdmin: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Students
// ============================================================

app.get('/api/students/me', requireAuth('student'), async (req, res) => {
  const student = await Student.findById(req.auth.userId).select('-password');
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const rawBookings = await Booking.find({ studentEmail: student.email }).sort({ createdAt: -1 });
  // Zoom link stays hidden from the student until the tutor confirms — same
  // rule as GET /api/bookings/me, which this dashboard-profile route
  // duplicates for convenience.
  const bookings = rawBookings.map((b) => {
    const obj = b.toObject();
    if (!obj.confirmed) delete obj.zoomLink;
    return obj;
  });
  res.json({ name: student.name, email: student.email, bookings, onHold: !!student.onHold, cancelCount: student.cancelCount || 0 });
});

app.delete('/api/students/me', requireAuth('student'), async (req, res) => {
  const student = await Student.findById(req.auth.userId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  await Booking.deleteMany({ studentEmail: student.email });
  await Student.deleteOne({ _id: student._id });
  res.json({ success: true, message: 'Account deleted successfully' });
});

// ============================================================
// Bookings
// ============================================================

app.get('/api/bookings/me', requireAuth('student'), async (req, res) => {
  const bookings = await Booking.find({ studentEmail: req.auth.email }).sort({ createdAt: -1 });
  // Zoom link stays hidden from the student until the tutor confirms.
  const result = bookings.map((b) => {
    const obj = b.toObject();
    if (!obj.confirmed) delete obj.zoomLink;
    return obj;
  });
  res.json(result);
});

// ---- Booking rule helpers (reservation window + weekly/monthly caps) ----
// "startTime" strings look like "2:30 PM" — convert to 24-hour {hour, minute}.
function parseClockTime(timeStr) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((timeStr || '').trim());
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

// Builds a real Date for a session's start from its dateISO ("YYYY-MM-DD")
// and startTime ("2:30 PM"). Uses local Date-component construction (not
// ISO-string parsing) so it stays internally consistent with `new Date()`
// for "now", regardless of what timezone the server happens to run in.
function getSessionStartDate(dateISO, startTime) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO || '');
  const clock = parseClockTime(startTime);
  if (!parts || !clock) return null;
  const [, year, month, day] = parts;
  return new Date(Number(year), Number(month) - 1, Number(day), clock.hour, clock.minute);
}

const LATE_CANCELLATION_MS = 24 * 60 * 60 * 1000; // cancelling with 24h+ notice doesn't count as a strike

// A cancellation only counts toward the 3-strike hold if it happens less
// than 24 hours before the session was due to start. If we can't tell when
// the session starts (missing/malformed date or time), fail safe and treat
// it as late, matching the pre-existing "always counts" behavior.
function isLateCancellation(booking) {
  const sessionStart = getSessionStartDate(booking.dateISO, booking.startTime);
  if (!sessionStart) return true;
  return sessionStart.getTime() - Date.now() < LATE_CANCELLATION_MS;
}

// "2:30 PM" -> minutes since midnight, for numeric overlap comparisons.
// Display time strings like these do NOT compare correctly as plain
// strings — "9:30 AM" is lexicographically greater than "10:00 AM" (since
// '9' > '1' as the first character), even though 9:30 AM is earlier in
// real time — so anything checking overlap between two clock times needs
// to go through this first rather than comparing the strings directly.
function clockTimeToMinutes(timeStr) {
  const clock = parseClockTime(timeStr);
  return clock ? clock.hour * 60 + clock.minute : null;
}

function toISODateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Sunday-Saturday calendar week containing dateISO, as [startISO, endISO).
function getWeekRange(dateISO) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay(); // 0 = Sunday
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek + 7);
  return { startISO: toISODateString(start), endISO: toISODateString(end) };
}

// Calendar month containing dateISO, as [startISO, endISO).
function getMonthRange(dateISO) {
  const [year, month] = dateISO.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { startISO: toISODateString(start), endISO: toISODateString(end) };
}

const RESERVATION_MAX_DURATION_MINUTES = 60;
const RESERVATION_MIN_LEAD_MS = 2 * 24 * 60 * 60 * 1000; // closes 2 days before session start
const RESERVATION_MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000; // can't book more than 7 days out
const WEEKLY_BOOKING_LIMIT = 2;
const MONTHLY_BOOKING_LIMIT = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB decoded

// A booking's "location" line for an email: online sessions don't reveal the
// Zoom link to the student until the tutor confirms (revealZoom controls
// this); an unapproved custom in-person location is flagged so whoever's
// reading knows confirming the session also approves that location.
function formatLocationForEmail(booking, { revealZoom }) {
  if (booking.sessionType === 'online') {
    if (revealZoom && booking.zoomLink) {
      return `Online — Zoom link: ${booking.zoomLink}`;
    }
    return 'Online (Zoom link is sent once the tutor confirms the session)';
  }
  if (!booking.locationApproved) {
    return `${booking.location} (pending tutor approval — confirming the session also approves this location)`;
  }
  return booking.location;
}

app.post('/api/bookings', requireAuth('student'), async (req, res) => {
  try {
    const student = await Student.findById(req.auth.userId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (student.onHold) {
      return res.status(403).json({
        error: 'Your account is on hold due to repeated cancellations. Please message the tutoring chairs to resolve this before booking again.',
      });
    }

    const { tutorEmail, date, startTime, endTime, dateISO, duration } = req.body;

    // ---- Reservation window: opens 7 days out, closes 2 days before start ----
    if (dateISO && startTime) {
      const sessionStart = getSessionStartDate(dateISO, startTime);
      if (sessionStart) {
        const msUntilSession = sessionStart.getTime() - Date.now();
        if (msUntilSession < RESERVATION_MIN_LEAD_MS) {
          return res.status(400).json({
            error: 'Booking for this session has closed — sessions must be booked at least 2 days before they start.',
          });
        }
        if (msUntilSession > RESERVATION_MAX_LEAD_MS) {
          return res.status(400).json({
            error: 'That session is too far out — sessions can only be booked up to 7 days in advance.',
          });
        }
      }
    }

    // ---- Duration cap: sessions are at most 1 hour ----
    if (duration && duration > RESERVATION_MAX_DURATION_MINUTES) {
      return res.status(400).json({ error: 'Sessions can be at most 1 hour long.' });
    }

    // ---- Weekly / monthly booking limits ----
    if (dateISO) {
      const { startISO: weekStart, endISO: weekEnd } = getWeekRange(dateISO);
      const weekCount = await Booking.countDocuments({
        studentEmail: student.email,
        dateISO: { $gte: weekStart, $lt: weekEnd },
      });
      if (weekCount >= WEEKLY_BOOKING_LIMIT) {
        return res.status(400).json({
          error: `You already have ${WEEKLY_BOOKING_LIMIT} sessions booked that week — that's the weekly limit. Cancel one first if you need to rebook.`,
        });
      }

      const { startISO: monthStart, endISO: monthEnd } = getMonthRange(dateISO);
      const monthCount = await Booking.countDocuments({
        studentEmail: student.email,
        dateISO: { $gte: monthStart, $lt: monthEnd },
      });
      if (monthCount >= MONTHLY_BOOKING_LIMIT) {
        return res.status(400).json({
          error: `You already have ${MONTHLY_BOOKING_LIMIT} sessions booked that month — that's the monthly limit. Cancel one first if you need to rebook.`,
        });
      }
    }

    // ---- Session type, location, and Zoom validation ----
    // Looked up server-side rather than trusted from the client, so a
    // student can't fake an already-approved location or invent a Zoom
    // link for a tutor who hasn't set one up.
    const tutor = tutorEmail ? await Tutor.findOne({ email: tutorEmail.toLowerCase() }) : null;

    const sessionType = req.body.sessionType === 'online' ? 'online' : 'in-person';
    let location = '';
    let locationApproved = true;
    let zoomLink = '';

    if (sessionType === 'online') {
      if (!tutor || !tutor.zoomLink) {
        return res.status(400).json({
          error: "This tutor hasn't set up a Zoom link yet — please choose an in-person session instead.",
        });
      }
      location = 'Online (Zoom)';
      zoomLink = tutor.zoomLink;
    } else {
      location = (req.body.location || '').trim();
      if (!location) {
        return res.status(400).json({ error: 'Please choose a location for your in-person session.' });
      }
      // Approved automatically only if it's literally one of the tutor's
      // preferred locations; anything else (the student's own "Other" text)
      // needs the tutor to approve it, which happens when they confirm.
      locationApproved = !!tutor?.preferredLocations?.includes(location);
    }

    // ---- Optional PDF attachment ----
    let attachmentName, attachmentType, attachmentData;
    if (req.body.attachment && req.body.attachment.data) {
      const { filename, mimeType, data } = req.body.attachment;
      if (mimeType !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF files can be attached.' });
      }
      const approxBytes = (data.length * 3) / 4; // base64 -> decoded byte estimate
      if (approxBytes > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: 'That file is too large — attachments must be 8MB or smaller.' });
      }
      attachmentName = (filename || 'attachment.pdf').slice(0, 200);
      attachmentType = mimeType;
      attachmentData = data;
    }

    // Server-side conflict check: the frontend only shows free slots based on
    // what it saw when the page loaded, so this is the actual source of truth.
    // (The unique index on the model is the atomic backstop for the exact-same-
    // slot race; this covers overlapping-but-different-start-time conflicts.)
    if (tutorEmail && date && startTime && endTime) {
      const sameDayBookings = await Booking.find({ tutorEmail, date });
      const newStartMin = clockTimeToMinutes(startTime);
      const newEndMin = clockTimeToMinutes(endTime);
      const overlaps = newStartMin !== null && newEndMin !== null && sameDayBookings.some((existing) => {
        const existingStartMin = clockTimeToMinutes(existing.startTime);
        const existingEndMin = clockTimeToMinutes(existing.endTime);
        if (existingStartMin === null || existingEndMin === null) return false;
        return (
          (newStartMin >= existingStartMin && newStartMin < existingEndMin) ||
          (newEndMin > existingStartMin && newEndMin <= existingEndMin) ||
          (newStartMin <= existingStartMin && newEndMin >= existingEndMin)
        );
      });
      if (overlaps) {
        return res.status(409).json({ error: 'That time slot was just booked by someone else — please pick another.' });
      }
    }

    let booking;
    try {
      booking = await Booking.create({
        ...req.body,
        studentName: student.name,
        studentEmail: student.email,
        sessionType,
        location,
        locationApproved,
        zoomLink,
        attachmentName,
        attachmentType,
        attachmentData,
        confirmed: false,
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        // Two requests landed on the exact same slot at the same instant.
        return res.status(409).json({ error: 'That time slot was just booked by someone else — please pick another.' });
      }
      throw createErr;
    }

    const templateVars = {
      studentName: student.name,
      class: booking.class,
      tutor: booking.tutor,
      tutorEmail: booking.tutorEmail,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: formatDuration(booking.duration),
      topics: booking.topics,
    };

    const studentTemplate = await getEmailTemplate('bookingCreatedStudent');
    await sendMail({
      from: 'axstutoring@zohomail.com',
      to: student.email,
      subject: 'AXS Tutoring - Booking Request Received',
      // The student doesn't see the Zoom link until the tutor confirms.
      text: fillTemplate(studentTemplate, { ...templateVars, location: formatLocationForEmail(booking, { revealZoom: false }) }),
    }).catch((e) => console.error('student booking-created email failed', e));

    if (booking.tutorEmail) {
      const tutorTemplate = await getEmailTemplate('bookingCreatedTutor');
      await sendMail({
        from: 'axstutoring@zohomail.com',
        to: booking.tutorEmail,
        subject: 'AXS Tutoring - New Session Request (Action Needed)',
        // It's the tutor's own Zoom link, so no reason to withhold it from them.
        text: fillTemplate(tutorTemplate, { ...templateVars, location: formatLocationForEmail(booking, { revealZoom: true }) }),
      }).catch((e) => console.error('tutor booking-created email failed', e));
    }

    // Strip the Zoom link from the response too — it's unconfirmed, so the
    // student shouldn't see it yet even in the raw API response.
    const { zoomLink: _zoomLink, ...bookingForResponse } = booking.toObject();
    res.status(201).json({ success: true, booking: bookingForResponse });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/bookings/:id', requireAuth('student'), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.studentEmail !== req.auth.email) return res.status(403).json({ error: 'Forbidden' });

  const student = await Student.findById(req.auth.userId);
  if (student && booking.confirmed && isLateCancellation(booking)) {
    // Only a confirmed session, cancelled with less than 24 hours' notice,
    // counts as a real cancellation — backing out of a still-pending
    // request, or cancelling well ahead of time, doesn't.
    student.cancelCount = (student.cancelCount || 0) + 1;
    if (student.cancelCount >= 3) {
      student.onHold = true;
      student.holdReason = 'strikes';
    }
    await student.save();
  }

  if (booking.tutorEmail) {
    const template = await getEmailTemplate('bookingCancelledByStudent');
    const filled = fillTemplate(template, {
      studentName: booking.studentName,
      class: booking.class,
      tutor: booking.tutor,
      tutorEmail: booking.tutorEmail,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: formatDuration(booking.duration),
      location: booking.location,
      topics: booking.topics,
    });
    await sendMail({
      from: 'axstutoring@zohomail.com',
      to: booking.tutorEmail,
      subject: 'AXS Tutoring - Session Cancelled',
      text: filled,
    }).catch((e) => console.error('cancellation email (to tutor) failed', e));
  }

  await Booking.deleteOne({ _id: booking._id });
  res.json({ success: true, message: 'Booking cancelled' });
});

// Student edits the topics for their own session (before or after it happens).
app.put('/api/bookings/:id/topics', requireAuth('student'), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.studentEmail !== req.auth.email) return res.status(403).json({ error: 'Forbidden' });
  booking.topics = (req.body.topics || '').trim();
  await booking.save();
  const bookingForResponse = booking.toObject();
  if (!bookingForResponse.confirmed) delete bookingForResponse.zoomLink; // stays consistent with GET /api/bookings/me
  res.json(bookingForResponse);
});

// Tutor confirms a pending booking request.
app.put('/api/tutors/me/bookings/:id/confirm', requireAuth('tutor'), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.tutorEmail !== req.auth.email) return res.status(403).json({ error: 'Forbidden' });

  booking.confirmed = true;
  // Confirming the session also approves its location — if the student
  // picked "Other" and typed something custom, the tutor saw it flagged on
  // this pending request, and confirming means they're fine with it.
  booking.locationApproved = true;
  await booking.save();

  const template = await getEmailTemplate('bookingConfirmed');
  const filled = fillTemplate(template, {
    studentName: booking.studentName,
    class: booking.class,
    tutor: booking.tutor,
    tutorEmail: booking.tutorEmail,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    duration: formatDuration(booking.duration),
    // The student gets the real Zoom link now that the session is confirmed.
    location: formatLocationForEmail(booking, { revealZoom: true }),
    topics: booking.topics,
  });
  await sendMail({
    from: 'axstutoring@zohomail.com',
    to: booking.studentEmail,
    subject: 'AXS Tutoring - Your Session is Confirmed',
    text: filled,
  }).catch((e) => console.error('confirmation email (to student) failed', e));

  res.json(booking);
});

// Tutor cancels one of their own sessions.
app.delete('/api/tutors/me/bookings/:id', requireAuth('tutor'), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.tutorEmail !== req.auth.email) return res.status(403).json({ error: 'Forbidden' });

  const tutor = await Tutor.findById(req.auth.userId);
  if (tutor && booking.confirmed && isLateCancellation(booking)) {
    // Only counts if the tutor had already accepted the session and is now
    // backing out with less than 24 hours' notice — declining/cancelling a
    // still-pending request, or cancelling well ahead of time, doesn't.
    tutor.cancelCount = (tutor.cancelCount || 0) + 1;
    if (tutor.cancelCount >= 3) {
      tutor.onHold = true;
      tutor.holdReason = 'strikes';
    }
    await tutor.save();
  }

  const template = await getEmailTemplate('bookingCancelledByTutor');
  const filled = fillTemplate(template, {
    studentName: booking.studentName,
    class: booking.class,
    tutor: booking.tutor,
    tutorEmail: booking.tutorEmail,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    duration: formatDuration(booking.duration),
    location: booking.location,
    topics: booking.topics,
  });
  await sendMail({
    from: 'axstutoring@zohomail.com',
    to: booking.studentEmail,
    subject: 'AXS Tutoring - Session Cancelled',
    text: filled,
  }).catch((e) => console.error('cancellation email (to student) failed', e));

  await Booking.deleteOne({ _id: booking._id });
  res.json({ success: true, message: 'Booking cancelled' });
});

// Tutor edits the topics for one of their own sessions — e.g. logging what
// was actually covered after the session happens.
app.put('/api/tutors/me/bookings/:id/topics', requireAuth('tutor'), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.tutorEmail !== req.auth.email) return res.status(403).json({ error: 'Forbidden' });
  booking.topics = (req.body.topics || '').trim();
  await booking.save();
  res.json(booking);
});

app.get('/api/admin/students', requireAuth('admin'), async (req, res) => {
  const students = await Student.find({}).select('-password').sort({ createdAt: -1 });
  const results = await Promise.all(students.map(async (s) => {
    const bookingCount = await Booking.countDocuments({ studentEmail: s.email });
    const latestBooking = await Booking.findOne({ studentEmail: s.email }).sort({ createdAt: -1 });
    return {
      _id: s._id,
      name: s.name,
      email: s.email,
      createdAt: s.createdAt,
      bookingCount,
      latestBooking: latestBooking ? { class: latestBooking.class, date: latestBooking.date } : null,
      cancelCount: s.cancelCount || 0,
      onHold: !!s.onHold,
      holdReason: s.holdReason || null,
    };
  }));
  res.json(results);
});

// Admin manually clears (or sets) a student's hold status — e.g. after
// they've messaged the tutoring chairs and the situation is resolved.
app.put('/api/admin/students/:studentId/hold', requireAuth('admin'), async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const wantsOn = !!req.body.onHold;
  student.onHold = wantsOn;
  student.holdReason = wantsOn ? 'admin' : null;
  if (!wantsOn) student.cancelCount = 0;
  await student.save();
  res.json({ success: true, onHold: student.onHold, holdReason: student.holdReason, cancelCount: student.cancelCount });
});

app.delete('/api/admin/students/:studentId', requireAuth('admin'), async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  await Booking.deleteMany({ studentEmail: student.email });
  await Student.deleteOne({ _id: student._id });
  res.json({ success: true });
});

app.delete('/api/admin/bookings/:id', requireAuth('admin'), async (req, res) => {
  const result = await Booking.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: 'Booking not found' });
  res.json({ success: true });
});

app.get('/api/admin/bookings', requireAuth('admin'), async (req, res) => {
  const bookings = await Booking.find({}).sort({ createdAt: -1 });
  res.json(bookings);
});

// Counts, per tutor, how many sessions were actually tutored within a date
// range: the session's date has passed and it wasn't cancelled. Cancelling
// deletes the booking record entirely, so any booking that still exists with
// a past date/time automatically qualifies.
app.get('/api/admin/tutoring-report', requireAuth('admin'), async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
  }

  const bookings = await Booking.find({
    dateISO: { $gte: startDate, $lte: endDate },
  });

  const now = new Date();
  const counts = {};

  for (const booking of bookings) {
    if (!booking.dateISO) continue;
    const [y, m, d] = booking.dateISO.split('-').map(Number);
    const sessionEnd = new Date(y, m - 1, d);
    const match = (booking.endTime || '').trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const period = match[3].toUpperCase();
      if (period === 'AM' && hour === 12) hour = 0;
      if (period === 'PM' && hour !== 12) hour += 12;
      sessionEnd.setHours(hour, minute, 0, 0);
    } else {
      sessionEnd.setHours(23, 59, 59, 999); // no parseable time — treat end-of-day as a fallback
    }

    if (sessionEnd >= now) continue; // hasn't happened yet — doesn't count

    const name = booking.tutor || 'Unknown';
    counts[name] = (counts[name] || 0) + 1;
  }

  const rows = Object.entries(counts)
    .map(([tutor, sessionsCompleted]) => ({ tutor, sessionsCompleted }))
    .sort((a, b) => a.tutor.localeCompare(b.tutor));

  res.json({ startDate, endDate, rows });
});

// ============================================================
// Tutors
// ============================================================

// Public: just the date/time info needed to avoid double-booking a tutor —
// deliberately excludes student names/emails/topics.
app.get('/api/tutors/:tutorId/booked-slots', async (req, res) => {
  const tutor = await Tutor.findById(req.params.tutorId);
  if (!tutor) return res.status(404).json({ error: 'Tutor not found' });
  const bookings = await Booking.find({ tutorEmail: tutor.email }).select('date startTime endTime -_id');
  res.json(bookings);
});

app.get('/api/tutors', async (req, res) => {
  // Public listing (used for the booking flow) only shows approved, non-held
  // tutors — a pending applicant or a tutor on hold shouldn't be bookable.
  const tutors = await Tutor.find({ isApproved: true, onHold: { $ne: true } }).select('-password');
  res.json(tutors);
});

app.get('/api/admin/tutors', requireAuth('admin'), async (req, res) => {
  // Admin sees everyone, including tutors still awaiting approval.
  const tutors = await Tutor.find({}).select('-password');
  res.json(tutors);
});

app.get('/api/tutors/me/bookings', requireAuth('tutor'), async (req, res) => {
  const bookings = await Booking.find({ tutorEmail: req.auth.email }).sort({ createdAt: -1 });
  res.json(bookings);
});

app.get('/api/tutors/me', requireAuth('tutor'), async (req, res) => {
  const tutor = await Tutor.findById(req.auth.userId).select('-password');
  if (!tutor) return res.status(404).json({ error: 'Tutor not found' });
  res.json(tutor);
});

app.put('/api/tutors/me/availability', requireAuth('tutor'), async (req, res) => {
  const tutor = await Tutor.findByIdAndUpdate(
    req.auth.userId,
    { weeklyAvailability: req.body.weeklyAvailability },
    { new: true },
  ).select('-password');
  res.json(tutor);
});

app.put('/api/tutors/me/unavailable-dates', requireAuth('tutor'), async (req, res) => {
  const tutor = await Tutor.findByIdAndUpdate(
    req.auth.userId,
    { unavailableDates: req.body.unavailableDates },
    { new: true },
  ).select('-password');
  res.json(tutor);
});

app.put('/api/tutors/me/classes', requireAuth('tutor'), async (req, res) => {
  const tutor = await Tutor.findByIdAndUpdate(
    req.auth.userId,
    { classesITeach: req.body.classesITeach },
    { new: true },
  ).select('-password');
  res.json(tutor);
});

// The tutor's own list of in-person locations they're willing to meet at —
// a mix of picks from the admin's master list and their own free-typed
// "Other" entries. Stored flat; students see exactly this list when
// booking an in-person session with this tutor.
app.put('/api/tutors/me/locations', requireAuth('tutor'), async (req, res) => {
  const locations = Array.isArray(req.body.preferredLocations) ? req.body.preferredLocations : [];
  const tutor = await Tutor.findByIdAndUpdate(
    req.auth.userId,
    { preferredLocations: locations },
    { new: true },
  ).select('-password');
  res.json(tutor);
});

app.put('/api/tutors/me/zoom', requireAuth('tutor'), async (req, res) => {
  const tutor = await Tutor.findByIdAndUpdate(
    req.auth.userId,
    { zoomLink: (req.body.zoomLink || '').trim() },
    { new: true },
  ).select('-password');
  res.json(tutor);
});

// Tutor puts themself on/off hold — e.g. going on vacation. While on hold
// they're excluded from the public bookable-tutor list, but nothing about
// their account is deleted or changed otherwise. A tutor can only turn OFF
// a hold they put on themselves — a hold set by an admin, or the automatic
// 3-strike hold, can only be released by an admin.
app.put('/api/tutors/me/hold', requireAuth('tutor'), async (req, res) => {
  const wantsOn = !!req.body.onHold;
  const tutor = await Tutor.findById(req.auth.userId);
  if (!tutor) return res.status(404).json({ error: 'Tutor not found' });

  if (!wantsOn && tutor.onHold && tutor.holdReason && tutor.holdReason !== 'self') {
    const reasonText = tutor.holdReason === 'strikes'
      ? 'due to repeated cancellations'
      : 'by an admin';
    return res.status(403).json({
      error: `Your hold was set ${reasonText} and can only be released by an admin. Please message the tutoring chairs.`,
    });
  }

  tutor.onHold = wantsOn;
  tutor.holdReason = wantsOn ? 'self' : null;
  await tutor.save();

  const { password: _pw, ...tutorData } = tutor.toObject();
  res.json(tutorData);
});

// ============================================================
// Admin: tutors
// ============================================================

app.post('/api/admin/tutors', requireAuth('admin'), async (req, res) => {
  try {
    const { name, email, password, subjects, classesITeach } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const existing = await Tutor.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'A tutor with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const tutor = await Tutor.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      subjects: subjects || [],
      classesITeach: classesITeach || [],
    });
    const { password: _pw, ...tutorData } = tutor.toObject();
    res.status(201).json(tutorData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/tutors/:tutorId', requireAuth('admin'), async (req, res) => {
  const updates = { ...req.body };
  delete updates.password; // password changes go through a dedicated flow, not this endpoint
  // Hold status goes through the dedicated /hold endpoint below, which also
  // manages holdReason and cancelCount consistently — never through this
  // generic field-update route.
  delete updates.onHold;
  delete updates.holdReason;
  delete updates.cancelCount;

  // Read the pre-update approval state so we can tell an actual
  // not-approved -> approved transition apart from any other edit to an
  // already-approved tutor (which shouldn't re-send the email).
  const before = await Tutor.findById(req.params.tutorId).select('isApproved');
  if (!before) return res.status(404).json({ error: 'Tutor not found' });

  const tutor = await Tutor.findByIdAndUpdate(req.params.tutorId, updates, { new: true }).select('-password');
  if (!tutor) return res.status(404).json({ error: 'Tutor not found' });

  // Awaited for the same reason as the new-application email above — a
  // fire-and-forget promise isn't guaranteed to survive past the response
  // on Vercel's serverless runtime.
  if (!before.isApproved && tutor.isApproved) {
    try {
      const template = await getEmailTemplate('tutorApproved');
      await sendMail({
        from: 'axstutoring@zohomail.com',
        to: tutor.email,
        subject: 'AXS Tutoring — Your Tutor Application Has Been Approved',
        text: fillTemplate(template, { tutorName: tutor.name }),
      });
    } catch (e) {
      console.error('tutor approval email failed', e);
    }
  }

  res.json(tutor);
});

// Admin manually holds/releases a tutor — for taking manual action outside
// the automatic 3-strike system, or to release a strike-triggered hold.
// Unlike the tutor's own /me/hold toggle, this always succeeds regardless
// of who/what set the current hold.
app.put('/api/admin/tutors/:tutorId/hold', requireAuth('admin'), async (req, res) => {
  const tutor = await Tutor.findById(req.params.tutorId);
  if (!tutor) return res.status(404).json({ error: 'Tutor not found' });
  const wantsOn = !!req.body.onHold;
  tutor.onHold = wantsOn;
  tutor.holdReason = wantsOn ? 'admin' : null;
  if (!wantsOn) tutor.cancelCount = 0;
  await tutor.save();
  const { password: _pw, ...tutorData } = tutor.toObject();
  res.json(tutorData);
});

app.delete('/api/admin/tutors/:tutorId', requireAuth('admin'), async (req, res) => {
  const result = await Tutor.findByIdAndDelete(req.params.tutorId);
  if (!result) return res.status(404).json({ error: 'Tutor not found' });
  res.json({ success: true });
});

// ============================================================
// Classes
// ============================================================

// ============================================================
// Announcement (homepage banner)
// ============================================================

app.get('/api/announcement', async (req, res) => {
  const setting = await Setting.findOne({ key: 'announcement' });
  res.json({ html: setting?.value || '' });
});

app.get('/api/admin/announcement', requireAuth('admin'), async (req, res) => {
  const setting = await Setting.findOne({ key: 'announcement' });
  res.json({ html: setting?.value || '' });
});

app.put('/api/admin/announcement', requireAuth('admin'), async (req, res) => {
  await Setting.findOneAndUpdate(
    { key: 'announcement' },
    { value: req.body.html || '' },
    { upsert: true },
  );
  res.json({ success: true });
});

app.get('/api/classes', async (req, res) => {
  const doc = await Classes.findOne({});
  if (!doc) return res.json({});
  const obj = doc.toObject();
  delete obj._id;
  delete obj.__v;
  res.json(obj);
});

app.put('/api/admin/classes', requireAuth('admin'), async (req, res) => {
  await Classes.deleteMany({}); // single-document collection
  const doc = await Classes.create(req.body);
  const obj = doc.toObject();
  delete obj._id;
  delete obj.__v;
  res.json(obj);
});

// ============================================================
// Locations (admin-managed master list, for in-person sessions)
// ============================================================

app.get('/api/locations', async (req, res) => {
  const setting = await Setting.findOne({ key: 'locations' });
  res.json(setting?.value || []);
});

app.put('/api/admin/locations', requireAuth('admin'), async (req, res) => {
  const locations = Array.isArray(req.body.locations) ? req.body.locations : [];
  await Setting.findOneAndUpdate(
    { key: 'locations' },
    { value: locations },
    { upsert: true },
  );
  res.json(locations);
});

// ============================================================
// Review Sessions
// ============================================================

app.get('/api/review-sessions', async (req, res) => {
  const sessions = await ReviewSession.find({}).sort({ dateISO: 1 });
  res.json(sessions);
});

app.post('/api/admin/review-sessions', requireAuth('admin'), async (req, res) => {
  const session = await ReviewSession.create(req.body);
  res.status(201).json(session);
});

app.put('/api/admin/review-sessions/:id', requireAuth('admin'), async (req, res) => {
  const session = await ReviewSession.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.delete('/api/admin/review-sessions/:id', requireAuth('admin'), async (req, res) => {
  const result = await ReviewSession.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true });
});

// RSVPing now requires a signed-in student account — name and email come
// from the authenticated student record, never from the request body, so
// there's no "just type any name" path anymore.
app.post('/api/review-sessions/:id/rsvp', requireAuth('student'), async (req, res) => {
  const { subject } = req.body;
  if (!subject) return res.status(400).json({ error: 'subject is required' });

  const student = await Student.findById(req.auth.userId).select('name email');
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const session = await ReviewSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const alreadyRsvpd = (session.attendees || []).some((a) => {
    if (typeof a === 'string') return a === student.name;
    return a.email === student.email && a.subject === subject;
  });
  if (alreadyRsvpd) return res.status(400).json({ error: "Already RSVP'd for this subject" });

  session.attendees.push({ name: student.name, subject, email: student.email });
  await session.save();
  res.json(session);
});

// ============================================================
// Admin: email templates
// ============================================================

const DEFAULT_EMAIL_TEMPLATES = {
  bookingCreatedStudent: `Dear {{studentName}},

Thanks for booking a tutoring session! Your request has been sent to your tutor and is awaiting their confirmation — you'll get another email as soon as they confirm.

Session Details:
- Class: {{class}}
- Tutor: {{tutor}}
- Date: {{date}}
- Time: {{startTime}} - {{endTime}}
- Duration: {{duration}}
- Location: {{location}}
- Topics: {{topics}}

Best regards,
Alpha Chi Sigma Tutoring Team`,

  bookingCreatedTutor: `Dear {{tutor}},

You have a new tutoring session request awaiting your confirmation.

Session Details:
- Student: {{studentName}}
- Class: {{class}}
- Date: {{date}}
- Time: {{startTime}} - {{endTime}}
- Duration: {{duration}}
- Location: {{location}}
- Topics: {{topics}}

Please log in to your tutor dashboard to confirm this session.

Best regards,
Alpha Chi Sigma Tutoring Team`,

  bookingConfirmed: `Dear {{studentName}},

Good news — {{tutor}} has confirmed your tutoring session!

Session Details:
- Class: {{class}}
- Tutor: {{tutor}}
- Date: {{date}}
- Time: {{startTime}} - {{endTime}}
- Duration: {{duration}}
- Location: {{location}}
- Topics: {{topics}}

We look forward to seeing you!

Best regards,
Alpha Chi Sigma Tutoring Team`,

  bookingCancelledByStudent: `Dear {{tutor}},

{{studentName}} has cancelled the following tutoring session:

- Class: {{class}}
- Date: {{date}}
- Time: {{startTime}} - {{endTime}}

No action is needed on your end.

Best regards,
Alpha Chi Sigma Tutoring Team`,

  bookingCancelledByTutor: `Dear {{studentName}},

Your tutor, {{tutor}}, has cancelled the following tutoring session:

- Class: {{class}}
- Date: {{date}}
- Time: {{startTime}} - {{endTime}}

Please rebook with another tutor if you'd still like help with this class.

Best regards,
Alpha Chi Sigma Tutoring Team`,

  newTutorApplication: `Hi,

A new tutor has applied for an account and is awaiting approval.

Name: {{tutorName}}
Email: {{tutorEmail}}

Log in to the admin dashboard to review and approve or reject this application.

— AXS Tutoring Website`,

  tutorApproved: `Dear {{tutorName}},

Great news — your tutor application has been approved! You can now sign in to your tutor dashboard, set your weekly availability and the classes you tutor, and start getting booked for sessions.

Best regards,
Alpha Chi Sigma Tutoring Team`,
};

const EMAIL_TEMPLATE_KEYS = Object.keys(DEFAULT_EMAIL_TEMPLATES);

async function getEmailTemplate(key) {
  const setting = await Setting.findOne({ key: `emailTemplate:${key}` });
  return setting?.value || DEFAULT_EMAIL_TEMPLATES[key];
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (str, [key, value]) => str.replaceAll(`{{${key}}}`, value ?? ''),
    template,
  );
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

app.get('/api/admin/email-templates', requireAuth('admin'), async (req, res) => {
  const templates = {};
  for (const key of EMAIL_TEMPLATE_KEYS) {
    templates[key] = await getEmailTemplate(key);
  }
  res.json(templates);
});

app.put('/api/admin/email-templates', requireAuth('admin'), async (req, res) => {
  const { key, template } = req.body;
  if (!EMAIL_TEMPLATE_KEYS.includes(key)) {
    return res.status(400).json({ error: 'Unknown template key' });
  }
  await Setting.findOneAndUpdate(
    { key: `emailTemplate:${key}` },
    { value: template },
    { upsert: true },
  );
  res.json({ success: true });
});
