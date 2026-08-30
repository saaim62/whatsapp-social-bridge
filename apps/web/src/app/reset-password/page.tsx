'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { API_URL } from '@/lib/api';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || null;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/account/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.message || 'Failed to reset password');
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setLoading(false);
      setError('An unexpected error occurred');
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#0a0a0a] overflow-hidden selection:bg-brand-500/30">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 -right-1/4 w-[800px] h-[800px] bg-brand-500/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('/noise.png')] opacity-20 mix-blend-overlay pointer-events-none" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 w-full max-w-md px-6"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {success ? (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-10"
                >
                  <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-emerald-500/10">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">Password Reset!</h2>
                  <p className="text-white/60 mb-8 leading-relaxed max-w-sm mx-auto">
                    Your password has been successfully reset. You can now log in with your new credentials.
                  </p>
                  <Link 
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors border border-white/10 w-full"
                  >
                    Go to Login
                  </Link>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <div className="text-center mb-10">
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">
                      New Password
                    </h2>
                    <p className="text-white/50 mt-3 text-sm">
                      Enter your new secure password
                    </p>
                  </div>

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 text-center"
                      >
                        {error}
                      </motion.div>
                    )}

                    <div className="relative group">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-transparent focus:bg-white/10 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all peer pr-12"
                        placeholder="New Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={!token}
                      />
                      <label 
                        htmlFor="password" 
                        className="absolute left-5 -top-2.5 bg-[#1a1a1a] px-2 text-xs font-medium text-white/50 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:bg-[#1a1a1a] peer-focus:text-brand-400 rounded"
                      >
                        New Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-4 text-white/30 hover:text-white/70 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>

                    <div className="relative group">
                      <input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-transparent focus:bg-white/10 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all peer"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={!token}
                      />
                      <label 
                        htmlFor="confirmPassword" 
                        className="absolute left-5 -top-2.5 bg-[#1a1a1a] px-2 text-xs font-medium text-white/50 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:bg-[#1a1a1a] peer-focus:text-brand-400 rounded"
                      >
                        Confirm Password
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !token}
                      className="group relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold py-4 px-8 rounded-2xl transition-all shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] hover:shadow-[0_0_60px_-15px_rgba(99,102,241,0.7)] overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                      <span className="relative z-10 flex items-center gap-2">
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            Reset Password
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </span>
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
