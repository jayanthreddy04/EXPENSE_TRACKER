import Tesseract from 'tesseract.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.join(__dirname, '..');

const AMOUNT_PATTERNS = [
  /(?:₹|Rs\.?|INR|\$|€|£)\s*([\d,]+\.?\d*)/gi,
  /([\d,]+\.\d{2})\b/g,
  /([\d,]+)\s*(?:₹|Rs|INR|\$|€|£)/gi,
];

const TOTAL_LABEL_PATTERNS = [
  /\bgrand\s+total\b/i,
  /\bnet\s+(?:amount|total)\b/i,
  /\bamount\s+(?:payable|paid|due)\b/i,
  /\bbill\s+(?:amount|total)\b/i,
  /\binvoice\s+(?:amount|total)\b/i,
  /\btotal\s+(?:amount|due|payable|paid|sale|rs|inr)\b/i,
  /\b(?:cash|card|upi)\s+(?:paid|payment)\b/i,
  /\btotal\b/i,
];

const NON_TOTAL_LABEL_PATTERN =
  /\b(?:sub\s*total|subtotal|tax|gst|cgst|sgst|igst|vat|discount|change|balance|round\s*off|qty|quantity|mrp|rate|price)\b/i;

function normalizeAmount(raw) {
  if (!raw) return null;

  const cleaned = String(raw)
    .replace(/[^\d.,]/g, '')
    .replace(/,/g, '');
  const amount = Number.parseFloat(cleaned);

  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

export function parseAmountsFromText(text) {
  const found = new Set();

  for (const pattern of AMOUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1] || match[0];
      const normalized = normalizeAmount(raw);
      if (normalized != null) {
        found.add(normalized);
      }
    }
  }

  const amounts = [...found].sort((a, b) => a - b);

  if (amounts.length === 0) {
    const fallback = text.match(/\b\d{1,6}(?:\.\d{1,2})?\b/g) || [];
    for (const n of fallback) {
      const val = normalizeAmount(n);
      if (val != null) {
        amounts.push(val);
      }
    }
    return [...new Set(amounts)].sort((a, b) => a - b);
  }

  return amounts;
}

export function findTotalFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates = [];

  lines.forEach((line, index) => {
    const amounts = parseAmountsFromText(line);
    if (amounts.length === 0 || NON_TOTAL_LABEL_PATTERN.test(line)) return;

    const labelIndex = TOTAL_LABEL_PATTERNS.findIndex((pattern) => pattern.test(line));
    if (labelIndex === -1) return;

    const labelScore = TOTAL_LABEL_PATTERNS.length - labelIndex;
    const positionScore = index / Math.max(lines.length, 1);

    for (const amount of amounts) {
      candidates.push({
        amount,
        score: labelScore * 100 + positionScore + amount / 1_000_000,
        line,
      });
    }
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  return null;
}

export async function analyzeReceiptImage(imagePath) {
  const { data } = await Tesseract.recognize(imagePath, 'eng', {
    langPath: TESSDATA_DIR,
    cachePath: TESSDATA_DIR,
    cacheMethod: 'readOnly',
    gzip: false,
    logger: () => {},
  });

  const text = data.text || '';
  const amounts = parseAmountsFromText(text);
  const totalCandidate = findTotalFromText(text);
  const total = totalCandidate?.amount ?? amounts[amounts.length - 1];

  if (amounts.length === 0) {
    return {
      success: false,
      message: 'No bill total detected in the image. Try a clearer receipt photo.',
      rawText: text.slice(0, 500),
      amounts: [],
      total: 0,
    };
  }

  return {
    success: true,
    message: totalCandidate
      ? 'Receipt total detected and saved'
      : 'Receipt total saved from the largest amount detected',
    rawText: text.slice(0, 500),
    amounts,
    total,
    matchedLine: totalCandidate?.line || null,
  };
}
