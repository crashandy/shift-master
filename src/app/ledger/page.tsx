'use client';

// 月記帳（老闆專用）
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ledgerDb } from '@/lib/ledgerClient';
import LedgerApp from '@/components/ledger/LedgerApp';

type Status = 'loading' | 'out' | 'in';

export default function LedgerPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 確認登入的帳號真的是老闆（ledger_owners 只有老闆讀得到）
  const verifyOwner = async () => {
    const db = ledgerDb();
    const { data: s } = await db.auth.getSession();
    if (!s.session) return false;
    const { data, error: err } = await db.from('ledger_owners').select('email').limit(1);
    return !err && !!data && data.length > 0;
  };

  useEffect(() => {
    verifyOwner().then((ok) => setStatus(ok ? 'in' : 'out'));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const db = ledgerDb();
    const { error: err } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError('帳號或密碼錯誤');
      setBusy(false);
      return;
    }
    if (await verifyOwner()) {
      setPassword('');
      setStatus('in');
    } else {
      await db.auth.signOut();
      setError('這個帳號沒有記帳權限');
    }
    setBusy(false);
  };

  const handleLogout = async () => {
    await ledgerDb().auth.signOut();
    setStatus('out');
  };

  if (status === 'loading') {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400">載入中...</div>;
  }

  if (status === 'out') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4 text-xl">
            🔒
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2 text-center">月記帳</h1>
          <p className="text-sm text-slate-500 text-center mb-6">老闆專用，請用記帳帳號登入</p>
          <input
            type="email"
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3.5 rounded-xl bg-slate-50 text-slate-800 mb-3 outline-none border border-slate-200 focus:border-emerald-500 focus:bg-white transition"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="記帳密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3.5 rounded-xl bg-slate-50 text-slate-800 mb-4 outline-none border border-slate-200 focus:border-emerald-500 focus:bg-white transition"
          />
          {error && <p className="text-sm text-rose-600 font-bold mb-3 text-center">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-md transition disabled:opacity-50"
          >
            {busy ? '登入中...' : '登入'}
          </button>
          <Link href="/admin" className="block text-center text-xs text-slate-400 hover:text-slate-600 mt-4">
            ← 回管理後台
          </Link>
        </form>
      </div>
    );
  }

  return <LedgerApp onLogout={handleLogout} />;
}
