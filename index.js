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
app.use(express.json());
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
  const bookings = await Booking.find({ studentEmail: student.email }).sort({ createdAt: -1 });
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
  res.json(bookings);
});

app.post('/api/bookings', requireAuth('student'), async (req, res) => {
  try {
    const student = await Student.findById(req.auth.userId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (student.onHold) {
      return res.status(403).json({
        error: 'Your account is on hold due to repeated cancellations. Please message the tutoring chairs to resolve this before booking again.',
      });
    }

    const { tutorEmail, date, startTime, endTime } = req.body;

    // Server-side conflict check: the frontend only shows free slots based on
    // what it saw when the page loaded, so this is the actual source of truth.
    // (The unique index on the model is the atomic backstop for the exact-same-
    // slot race; this covers overlapping-but-different-start-time conflicts.)
    if (tutorEmail && date && startTime && endTime) {
      const sameDayBookings = await Booking.find({ tutorEmail, date });
      const overlaps = sameDayBookings.some((existing) => (
        (startTime >= existing.startTime && startTime < existing.endTime) ||
        (endTime > existing.startTime && endTime <= existing.endTime) ||
        (startTime <= existing.startTime && endTime >= existing.endTime)
      ));
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
      location: booking.location,
      topics: booking.topics,
    };

    const studentTemplate = await getEmailTemplate('bookingCreatedStudent');
    await sendMail({
      from: 'axstutoring@zohomail.com',
      to: student.email,
      subject: 'AXS Tutoring - Booking Request Received',
      text: fillTemplate(studentTemplate, templateVars),
    }).catch((e) => console.error('student booking-created email failed', e));

    if (booking.tutorEmail) {
      const tutorTemplate = await getEmailTemplate('bookingCreatedTutor');
      await sendMail({
        from: 'axstutoring@zohomail.com',
        to: booking.tutorEmail,
        subject: 'AXS Tutoring - New Session Request (Action Needed)',
        text: fillTemplate(tutorTemplate, templateVars),
      }).catch((e) => console.error('tutor booking-created email failed', e));
    }

    res.status(201).json({ success: true, booking });
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
  if (student && booking.confirmed) {
    // Only a confirmed session actually being cancelled counts as a real
    // cancellation — backing out of a still-pending request doesn't.
    student.cancelCount = (student.cancelCount || 0) + 1;
    if (student.cancelCount >= 3) student.onHold = true;
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

// Tutor confirms a pending booking request.
app.put('/api/tutors/me/bookings/:id/confirm', requireAuth('tutor'), async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.tutorEmail !== req.auth.email) return res.status(403).json({ error: 'Forbidden' });

  booking.confirmed = true;
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
    location: booking.location,
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
  if (tutor) {
    tutor.cancelCount = (tutor.cancelCount || 0) + 1;
    if (tutor.cancelCount >= 3) tutor.onHold = true;
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
    };
  }));
  res.json(results);
});

// Admin manually clears (or sets) a student's hold status — e.g. after
// they've messaged the tutoring chairs and the situation is resolved.
app.put('/api/admin/students/:studentId/hold', requireAuth('admin'), async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  student.onHold = !!req.body.onHold;
  if (!student.onHold) student.cancelCount = 0;
  await student.save();
  res.json({ success: true, onHold: student.onHold });
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

// Tutor puts themself on/off hold — e.g. going on vacation. While on hold
// they're excluded from the public bookable-tutor list, but nothing about
// their account is deleted or changed otherwise. Distinct from the
// automatic 3-strike hold: this doesn't touch cancelCount either way.
app.put('/api/tutors/me/hold', requireAuth('tutor'), async (req, res) => {
  const tutor = await Tutor.findByIdAndUpdate(
    req.auth.userId,
    { onHold: !!req.body.onHold },
    { new: true },
  ).select('-password');
  res.json(tutor);
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
  const tutor = await Tutor.findByIdAndUpdate(req.params.tutorId, updates, { new: true }).select('-password');
  if (!tutor) return res.status(404).json({ error: 'Tutor not found' });
  res.json(tutor);
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

app.post('/api/review-sessions/:id/rsvp', async (req, res) => {
  const { name, subject, email } = req.body;
  if (!name || !subject) return res.status(400).json({ error: 'name and subject are required' });

  const session = await ReviewSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const alreadyRsvpd = (session.attendees || []).some((a) => {
    if (typeof a === 'string') return a === name;
    if (email) return a.email === email && a.subject === subject;
    return a.name === name && a.subject === subject;
  });
  if (alreadyRsvpd) return res.status(400).json({ error: "Already RSVP'd for this subject" });

  session.attendees.push({ name, subject, ...(email ? { email } : {}) });
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
