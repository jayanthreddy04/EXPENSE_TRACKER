import { useCallback, useEffect, useState } from 'react';
import {
  fetchExpenses,
  fetchStats,
  createExpense,
  analyzeReceipt,
  deleteExpense,
  register,
  login,
  fetchCurrentUser,
  storeSession,
  clearSession,
  getStoredToken,
} from './api';
import './App.css';

function formatMoney(n) {
  if (n == null) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

function StatCard({ label, value, variant }) {
  return (
    <div className={`stat-card stat-${variant || 'default'}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const action = mode === 'register' ? register : login;
      const session = await action(authForm);
      storeSession(session);
      onAuthenticated(session.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div>
          <h1>Expense Tracker</h1>
          <p className="subtitle">Sign in to keep your scanned receipts and manual expenses private.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Register
          </button>
        </div>

        {error && <div className="banner error">{error}</div>}

        <form className="form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              required
              placeholder="Name"
              value={authForm.name}
              onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
            />
          )}
          <input
            required
            type="email"
            placeholder="Email"
            value={authForm.email}
            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
          />
          <input
            required
            type="password"
            minLength={6}
            placeholder="Password"
            value={authForm.password}
            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
          />
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Login'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);

  const [form, setForm] = useState({
    title: '',
    amount: '',
    category: 'General',
  });

  const [receiptMeta, setReceiptMeta] = useState({
    title: 'Receipt expense',
    category: 'Receipt',
  });

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setExpenses([]);
    setStats(null);
    setLastAnalysis(null);
    setError('');
  }, []);

  const load = useCallback(async () => {
    if (!user) return;

    setError('');
    setLoading(true);
    try {
      const [list, s] = await Promise.all([fetchExpenses(), fetchStats()]);
      setExpenses(list);
      setStats(s);
    } catch (e) {
      if (e.message.toLowerCase().includes('session') || e.message.toLowerCase().includes('log in')) {
        logout();
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [logout, user]);

  useEffect(() => {
    async function restoreSession() {
      if (!getStoredToken()) {
        setCheckingSession(false);
        setLoading(false);
        return;
      }

      try {
        const data = await fetchCurrentUser();
        setUser(data.user);
      } catch (_err) {
        clearSession();
      } finally {
        setCheckingSession(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createExpense({
        title: form.title,
        amount: parseFloat(form.amount),
        category: form.category,
      });
      setForm({ title: '', amount: '', category: 'General' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setLastAnalysis(null);
    const url = URL.createObjectURL(file);
    setReceiptPreview(url);
  };

  const handleAnalyze = async () => {
    if (!receiptFile) {
      setError('Please select a receipt photo first');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const result = await analyzeReceipt(receiptFile, receiptMeta);
      setLastAnalysis(result.analysis);
      setReceiptFile(null);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await deleteExpense(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (checkingSession) {
    return (
      <div className="app">
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Expense Tracker</h1>
          <p className="subtitle">Track spending manually or scan a bill to save its total</p>
        </div>
        <div className="user-menu">
          <span>{user.name}</span>
          <button type="button" className="btn ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="stats-grid">
        <StatCard label="Total spent" value={formatMoney(stats?.total ?? 0)} />
        <StatCard label="Entries" value={stats?.count ?? 0} />
      </section>

      <div className="panels">
        <section className="panel">
          <h2>Upload receipt photo</h2>
          <p className="hint">
            Upload a bill or receipt image. OCR will find the payable total and save that amount.
          </p>

          <div className="receipt-meta">
            <input
              placeholder="Title for saved expense"
              value={receiptMeta.title}
              onChange={(e) => setReceiptMeta({ ...receiptMeta, title: e.target.value })}
            />
            <input
              placeholder="Category"
              value={receiptMeta.category}
              onChange={(e) => setReceiptMeta({ ...receiptMeta, category: e.target.value })}
            />
          </div>

          <label className="upload-zone">
            <input type="file" accept="image/*" onChange={handleFileChange} hidden />
            {receiptPreview ? (
              <img src={receiptPreview} alt="Receipt preview" className="preview-img" />
            ) : (
              <span className="upload-placeholder">Click or drop a receipt image (JPG, PNG)</span>
            )}
          </label>

          <button
            type="button"
            className="btn primary"
            onClick={handleAnalyze}
            disabled={!receiptFile || analyzing}
          >
            {analyzing ? 'Analyzing...' : 'Analyze & save'}
          </button>

          {lastAnalysis && (
            <div className="analysis-result">
              <h3>Saved receipt total</h3>
              <div className="analysis-grid">
                <div>
                  <span className="mini-label">Total spent</span>
                  <strong>{formatMoney(lastAnalysis.total)}</strong>
                </div>
              </div>
              <p className="analysis-msg">{lastAnalysis.message}</p>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Add expense manually</h2>
          <form className="form" onSubmit={handleManualSubmit}>
            <input
              required
              placeholder="Title (e.g. Groceries)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option>General</option>
              <option>Food</option>
              <option>Transport</option>
              <option>Shopping</option>
              <option>Bills</option>
              <option>Other</option>
            </select>
            <button type="submit" className="btn primary">
              Add expense
            </button>
          </form>
        </section>
      </div>

      <section className="panel list-panel">
        <h2>All expenses</h2>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : expenses.length === 0 ? (
          <p className="muted">No expenses yet. Add one or upload a receipt.</p>
        ) : (
          <ul className="expense-list">
            {expenses.map((ex) => (
              <li key={ex._id} className="expense-item">
                <div className="expense-main">
                  <strong>{ex.title}</strong>
                  <span className="badge">{ex.category}</span>
                  {ex.source === 'receipt' && <span className="badge receipt">Receipt</span>}
                </div>
                <div className="expense-right">
                  <span className="amount">{formatMoney(ex.amount)}</span>
                  <span className="date">
                    {new Date(ex.date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn ghost danger"
                    onClick={() => handleDelete(ex._id)}
                    aria-label="Delete"
                  >
                    x
                  </button>
                </div>
                {ex.receiptImage && <img src={ex.receiptImage} alt="Receipt" className="thumb" />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
