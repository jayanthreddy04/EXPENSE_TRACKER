import express from 'express';
import User from '../models/User.js';
import { createToken, requireAuth } from '../middleware/auth.js';

const router = express.Router();

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

async function isPasswordValid(user, password) {
  if (await user.verifyPassword(password || '')) {
    return true;
  }

  if (user.password && user.password === password) {
    await user.setPassword(password);
    user.password = undefined;
    await user.save();
    return true;
  }

  return false;
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name?.trim() || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: normalizedEmail }).select('+password');
    if (existing) {
      if (!existing.passwordHash && !existing.passwordSalt && existing.password === password) {
        existing.name = name.trim();
        await existing.setPassword(password);
        existing.password = undefined;
        await existing.save();

        return res.status(201).json({
          token: createToken(existing),
          user: publicUser(existing),
        });
      }

      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = new User({ name: name.trim(), email: normalizedEmail });
    await user.setPassword(password);
    await user.save();

    res.status(201).json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user || !(await isPasswordValid(user, password || ''))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
