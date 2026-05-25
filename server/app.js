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
  res.json({ status: 'ok' });
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
