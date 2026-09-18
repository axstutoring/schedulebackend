# New Backend — Deployment Notes

This replaces `schedulebackend`'s `index.js`, `package.json`, and `models/`
entirely. Same MongoDB Atlas cluster, same Zoho email sending, same Vercel
deployment shape (single Express app, `vercel.json` unchanged) — just a
redesigned data model and routes that actually match the new frontend.

## Files to replace in the `schedulebackend` repo

- `index.js` → replace entirely with the new one
- `package.json` → replace entirely with the new one
- `models/` → **delete** `course.js`, `email.js`, `post.js`, `request.js` and
  replace with the 6 new files: `Student.js`, `Tutor.js`, `Booking.js`,
  `Classes.js`, `ReviewSession.js`, `Setting.js`
- `vercel.json`, `.gitignore` → unchanged, included here for completeness

## New environment variables to add in Vercel

In addition to the two you already have (`M_PASSWORD`, `E_PASSWORD`), add:

- `JWT_SECRET` — any long random string, used to sign login tokens
- `ADMIN_EMAIL` — the admin login email (e.g. `tutoring.axsbg@gmail.com`)
- `ADMIN_PASSWORD` — the admin login password

## ⚠️ Data migration — existing production data will NOT carry over

The old collections (`posts`, `courses`, `requests`, `emails`) used a totally
different, hand-packed schema (courses packed into bracket-delimited strings,
availability packed into digit codes, etc.). The new collections
(`students`, `tutors`, `bookings`, `classes`, `reviewsessions`) are a clean
redesign and **do not read the old data**.

If there's real tutor/student/booking data in the live database right now
that needs to survive the switch, tell me and I'll write a one-time migration
script to convert it into the new shape. If it's fine to start fresh
(re-enter tutors and classes through the new admin dashboard), no migration
is needed — just don't delete the old collections until you're sure, in
case you want to migrate later.

## Once deployed

The frontend's `src/app/utils/api.ts` from the last message is now obsolete
— it was written against the old `schedulebackend` routes. I'll replace it
with a client built against these new `/api/...` routes next.
