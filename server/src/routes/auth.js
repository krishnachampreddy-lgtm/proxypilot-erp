import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Users } from '../db.js';
import { requireAuth, signToken, validate } from '../middleware/auth.js';
import { emailEnabled, sendCode, verifyCode } from '../services/email.js';
import { ensureStarterTimetable } from '../services/starterTimetable.js';
import { SUBJECTS } from '../seedData.js';

const router = Router();

const email = z.string().trim().toLowerCase().email('Enter a valid email');
const password = z.string().min(6, 'Password must be at least 6 characters').max(100);
const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

const session = (res, user, status = 200) => res.status(status).json({ token: signToken(user), user: publicUser(user) });

// What sign-in options the server has switched on
router.get('/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, emailEnabled: emailEnabled() });
});

// ---------- Email + password ----------

router.post('/login', validate(z.object({ email, password: z.string().min(1, 'Enter your password') })), async (req, res) => {
  const user = await Users.byEmail(req.body.email);
  if (!user || !user.password_hash || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    return res.status(401).json({
      error: user && !user.password_hash ? 'This account uses Google or email-code sign-in. Use that, or "Forgot password" to set one.' : 'Wrong email or password',
    });
  }
  session(res, user);
});

const SignupBody = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email,
  password,
  role: z.enum(['faculty', 'student']),
  className: z.string().trim().max(20).optional(),
  subjects: z.array(z.enum(SUBJECTS)).max(5).optional(),
});

router.post('/signup', validate(SignupBody), async (req, res) => {
  if (await Users.byEmail(req.body.email)) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
  const user = await Users.create({
    ...req.body,
    passwordHash: await bcrypt.hash(req.body.password, 10),
    className: req.body.role === 'student' ? req.body.className || 'CSE-2A' : null,
    subjects: req.body.role === 'faculty' ? req.body.subjects || [] : [],
  });
  session(res, user, 201);
});

// ---------- Sign in with Google ----------

router.post('/google', validate(z.object({ credential: z.string().min(20) })), async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'Google sign-in is not set up yet.' });

  // Ask Google to verify the ID token it gave the browser
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(req.body.credential)}`);
  const info = r.ok ? await r.json() : null;
  if (!info || info.aud !== clientId || info.email_verified !== 'true' || !info.email) {
    return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }

  let user = (await Users.byGoogleSub(info.sub)) || (await Users.byEmail(info.email));
  if (user) {
    if (!user.google_sub) user = await Users.update(user.id, { google_sub: info.sub, avatar: info.picture || user.avatar });
  } else {
    user = await Users.create({
      name: info.name || info.email.split('@')[0],
      email: info.email,
      role: 'student',
      googleSub: info.sub,
      avatar: info.picture,
      needsProfile: true,
    });
  }
  session(res, user);
});

// ---------- Continue with Gmail (6-digit code, no password) ----------

router.post('/email-code', validate(z.object({ email, purpose: z.enum(['login', 'reset']) })), async (req, res) => {
  const { email: to, purpose } = req.body;
  // For reset, don't reveal whether the account exists
  if (purpose === 'reset' && !(await Users.byEmail(to))) return res.json({ ok: true });
  try {
    const result = await sendCode(to, purpose);
    if (!result.ok) return res.status(429).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error('Email send failed:', err.message);
    res.status(502).json({ error: 'Could not send the email right now. Please try again.' });
  }
});

router.post('/email-login', validate(z.object({ email, code, name: z.string().trim().max(80).optional() })), async (req, res) => {
  if (!(await verifyCode(req.body.email, 'login', req.body.code))) {
    return res.status(401).json({ error: 'That code is wrong or has expired.' });
  }
  let user = await Users.byEmail(req.body.email);
  if (!user) {
    user = await Users.create({ name: req.body.name || req.body.email.split('@')[0], email: req.body.email, role: 'student', needsProfile: true });
  }
  session(res, user);
});

// ---------- Forgot password ----------

router.post('/reset-password', validate(z.object({ email, code, password })), async (req, res) => {
  const user = await Users.byEmail(req.body.email);
  if (!user || !(await verifyCode(req.body.email, 'reset', req.body.code))) {
    return res.status(401).json({ error: 'That code is wrong or has expired.' });
  }
  const updated = await Users.update(user.id, { password_hash: await bcrypt.hash(req.body.password, 10) });
  session(res, updated);
});

// ---------- New Google / Gmail users pick their role ----------

const ProfileBody = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    role: z.enum(['faculty', 'student']),
    className: z.string().trim().max(20).optional(),
    subjects: z.array(z.enum(SUBJECTS, { message: `Subjects must be from: ${SUBJECTS.join(', ')}` })).max(5).optional(),
  })
  .refine((b) => b.role !== 'faculty' || (b.subjects && b.subjects.length > 0), { message: 'Pick at least one subject you teach' });

router.post('/complete-profile', requireAuth, validate(ProfileBody), async (req, res) => {
  const user = await Users.byId(req.user.id);
  if (!user?.needs_profile) return res.status(409).json({ error: 'Profile already set up.' });
  const updated = await Users.update(user.id, {
    name: req.body.name,
    role: req.body.role,
    class_name: req.body.role === 'student' ? req.body.className || 'CSE-2A' : null,
    subjects: req.body.role === 'faculty' ? req.body.subjects || [] : [],
    needs_profile: false,
  });
  await ensureStarterTimetable(updated);
  session(res, updated);
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await Users.byId(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    subjects: u.subjects,
    className: u.class_name,
    avatar: u.avatar,
    needsProfile: Boolean(u.needs_profile),
    hasPassword: Boolean(u.password_hash),
  };
}

export default router;
