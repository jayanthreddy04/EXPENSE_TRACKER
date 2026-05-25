const EXPENSES_BASE = '/api/expenses';
const AUTH_BASE = '/api/auth';
const TOKEN_KEY = 'expense_tracker_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem('expense_tracker_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('expense_tracker_user');
}

async function parseJson(res) {
  return res.json().catch(() => ({}));
}

async function request(url, options = {}) {
  const token = getStoredToken();
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });
  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(data.error || data.message || 'Something went wrong');
  }

  return data;
}

export async function register(data) {
  return request(`${AUTH_BASE}/register`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function login(data) {
  return request(`${AUTH_BASE}/login`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchCurrentUser() {
  return request(`${AUTH_BASE}/me`);
}

export async function fetchExpenses() {
  return request(EXPENSES_BASE);
}

export async function fetchStats() {
  return request(`${EXPENSES_BASE}/stats`);
}

export async function createExpense(data) {
  return request(EXPENSES_BASE, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function analyzeReceipt(file, meta = {}) {
  const form = new FormData();
  form.append('receipt', file);
  if (meta.title) form.append('title', meta.title);
  if (meta.category) form.append('category', meta.category);

  return request(`${EXPENSES_BASE}/analyze-receipt`, {
    method: 'POST',
    body: form,
  });
}

export async function deleteExpense(id) {
  return request(`${EXPENSES_BASE}/${id}`, { method: 'DELETE' });
}
