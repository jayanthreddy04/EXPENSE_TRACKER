import Tesseract from 'tesseract.js';
import fs from 'fs';
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

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const GEMINI_TIMEOUT_MS = 20_000;
const GROQ_TIMEOUT_MS = 20_000;

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

function getMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  return 'image/jpeg';
}

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The receipt analyzer returned an unreadable response.');
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeCloudAnalysis(payload) {
  const text = String(payload.rawText || payload.text || '');
  const amounts = Array.isArray(payload.amounts)
    ? payload.amounts.map(normalizeAmount).filter((amount) => amount != null)
    : parseAmountsFromText(text);
  const total = normalizeAmount(payload.total) ?? findTotalFromText(text)?.amount ?? amounts.at(-1);

  if (total == null) {
    return {
      success: false,
      message: payload.message || 'No bill total detected in the image. Try a clearer receipt photo.',
      rawText: text.slice(0, 500),
      amounts,
      total: 0,
    };
  }

  return {
    success: true,
    message: payload.message || 'Receipt total detected and saved',
    rawText: text.slice(0, 500),
    amounts: [...new Set([...amounts, total])].sort((a, b) => a - b),
    total,
    matchedLine: payload.matchedLine || null,
  };
}

async function analyzeWithGroq(imagePath) {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  const mimeType = getMimeType(imagePath);
  const imageData = fs.readFileSync(imagePath).toString('base64');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Read this receipt image and return only JSON with keys: total number, amounts number array, matchedLine string, rawText string, message string. Use the final payable/grand total, not subtotal or tax.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageData}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_completion_tokens: 1024,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = body.error?.message || 'Receipt analyzer request failed.';
      throw new Error(message);
    }

    const text = body.choices?.[0]?.message?.content;

    return normalizeCloudAnalysis(extractJson(text));
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Receipt analysis timed out. Try a smaller or clearer image.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeWithGemini(imagePath) {
  if (!process.env.GOOGLE_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  'Read this receipt image and return only JSON with keys: total number, amounts number array, matchedLine string, rawText string, message string. Use the final payable/grand total, not subtotal or tax.',
              },
              {
                inlineData: {
                  mimeType: getMimeType(imagePath),
                  data: imageData,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = body.error?.message || 'Receipt analyzer request failed.';
      throw new Error(message);
    }

    const text = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n');

    return normalizeCloudAnalysis(extractJson(text));
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Receipt analysis timed out. Try a smaller or clearer image.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeWithTesseract(imagePath) {
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

export async function analyzeReceiptImage(imagePath) {
  const groqAnalysis = await analyzeWithGroq(imagePath);
  if (groqAnalysis) {
    return groqAnalysis;
  }

  const geminiAnalysis = await analyzeWithGemini(imagePath);
  if (geminiAnalysis) {
    return geminiAnalysis;
  }

  if (process.env.VERCEL) {
    return {
      success: false,
      message:
        'Receipt OCR is not configured. Add GROQ_API_KEY or GOOGLE_API_KEY in Vercel environment variables.',
      rawText: '',
      amounts: [],
      total: 0,
    };
  }

  return analyzeWithTesseract(imagePath);
}
