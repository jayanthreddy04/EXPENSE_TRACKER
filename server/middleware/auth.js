import crypto from 'crypto';
import User from '../models/User.js';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
  }

  return 'expense-tracker-local-dev-secret';
}

function sign(input) {
  return crypto.createHmac('sha256', getJwtSecret()).update(input).digest('base64url');
}

export function createToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlEncode({
    sub: user._id.toString(),
    name: user.name,
    email: user.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  });
  const unsigned = `${header}.${payload}`;

  return `${unsigned}.${sign(unsigned)}`;
}

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Please log in first' });
  }

  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    const unsigned = `${encodedHeader}.${encodedPayload}`;

    if (!encodedHeader || !encodedPayload || !signature || sign(unsigned) !== signature) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const payload = base64UrlDecode(encodedPayload);
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const user = await User.findById(payload.sub).select('_id name email').lean();
    if (!user) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (_err) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
