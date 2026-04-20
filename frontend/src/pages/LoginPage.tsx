import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ArrowRight, Lock, Mail, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@finharbor.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login, status } = useAuth();
  const navigate = useNavigate();

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Login failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-8 text-center bg-slate-900 text-white">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4 border border-white/10">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FinHarbor Access</h1>
            <p className="text-xs text-slate-400 font-mono mt-2 uppercase tracking-widest">
              Employee Absence Management
            </p>
          </div>

          <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
                    placeholder="name@finharbor.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-sm"
                    placeholder="Password"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                Secure Administrative Environment
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
