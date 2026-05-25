import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import expenseRoutes from './routes/expenses.js';
import authRoutes from './routes/auth.js';
import { connectDB } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

if (!process.env.VERCEL) {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    ocr: {
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
      googleConfigured: Boolean(process.env.GOOGLE_API_KEY),
    },
  });
});

app.use('/api', async (_req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: `Database connection failed: ${err.message}` });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);

export default app;
