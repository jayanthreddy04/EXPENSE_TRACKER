import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Expense from '../models/Expense.js';
import { requireAuth } from '../middleware/auth.js';
import { analyzeReceiptImage } from '../services/ocrService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.VERCEL
  ? path.join('/tmp', 'expense-tracker-uploads')
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname) || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|webp|gif|bmp)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = express.Router();

router.use(requireAuth);

function readExpenseAmount(expense) {
  const value = expense.amount ?? expense.totalAmount ?? 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeExpense(expense) {
  const amount = readExpenseAmount(expense);

  return {
    ...expense,
    title: expense.title || expense.shopName || expense.merchant || 'Expense',
    amount: amount ?? 0,
    category: expense.category || 'General',
    date: expense.date || expense.createdAt,
    source: expense.source || (expense.receiptImage || expense.billImage ? 'receipt' : 'manual'),
    receiptImage: expense.receiptImage || expense.billImage,
  };
}

router.get('/stats', async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user._id }).lean();
    const amounts = expenses
      .map(readExpenseAmount)
      .filter((amount) => amount != null && amount >= 0);

    if (amounts.length === 0) {
      return res.json({
        total: 0,
        count: 0,
        highest: null,
        lowest: null,
        average: 0,
      });
    }

    const total = amounts.reduce((a, b) => a + b, 0);

    res.json({
      total: Math.round(total * 100) / 100,
      count: amounts.length,
      highest: Math.max(...amounts),
      lowest: Math.min(...amounts),
      average: Math.round((total / amounts.length) * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user._id }).sort({ date: -1 }).lean();
    res.json(expenses.map(normalizeExpense));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, amount, category, date, description } = req.body;
    const parsedAmount = Number(amount);

    if (!title || amount == null || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Title and amount are required' });
    }

    const expense = await Expense.create({
      user: req.user._id,
      title,
      amount: parsedAmount,
      category,
      date,
      description,
      source: 'manual',
    });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/analyze-receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Receipt image is required' });
  }

  const filePath = req.file.path;
  const relativePath = process.env.VERCEL ? null : `/uploads/${req.file.filename}`;

  try {
    const analysis = await analyzeReceiptImage(filePath);

    if (!analysis.success) {
      if (process.env.VERCEL && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.status(422).json({
        ...analysis,
        receiptImage: relativePath,
      });
    }

    const title = req.body.title || 'Receipt expense';
    const category = req.body.category || 'Receipt';

    const expense = await Expense.create({
      user: req.user._id,
      title,
      amount: analysis.total,
      category,
      description: analysis.matchedLine
        ? `OCR total matched: ${analysis.matchedLine}`
        : 'OCR total detected from receipt image',
      receiptImage: relativePath,
      source: 'receipt',
    });

    if (process.env.VERCEL && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(201).json({
      expense,
      analysis: {
        total: analysis.total,
        message: analysis.message,
        rawTextPreview: analysis.rawText,
      },
    });
  } catch (err) {
    if (process.env.VERCEL && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    if (expense.receiptImage) {
      const filename = path.basename(expense.receiptImage);
      const fullPath = path.join(uploadsDir, filename);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
