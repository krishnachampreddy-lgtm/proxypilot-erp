import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// JWT_SECRET from env; if missing, a secret is derived so the prototype still runs.
const SECRET = () =>
  process.env.JWT_SECRET ||
  crypto.createHash('sha256').update(`proxypilot:${process.env.SITE_ID || 'local'}:${process.env.NETLIFY_DB_URL || ''}`).digest('hex');

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET(), { expiresIn: '30d' });
}

// Checks the "Authorization: Bearer <token>" header
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    req.user = jwt.verify(token, SECRET());
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for your role' });

// Validates req.body with a Zod schema
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues.map((i) => i.message).join(', ') });
  }
  req.body = result.data;
  next();
};
