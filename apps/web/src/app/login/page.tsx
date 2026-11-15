'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ArrowRight, Zap } from 'lucide-react';
import { BRAND } from '@/lib/brand';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-dvh w-full relative flex items-center justify-center bg-transparent selection:bg-gold-500/30">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 w-full max-w-md px-6"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          {/* Inner Glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

          <div className="relative z-10">
            <div className="text-center mb-10">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="w-16 h-16 bg-gradient-to-br from-gold-300 via-gold-500 to-gold-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-gold-500/30"
              >
                <Zap className="w-8 h-8 text-black" strokeWidth={2.5} />
              </motion.div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                Welcome back
              </h2>
              <p className="text-white/50 mt-3 text-sm">
                Enter your credentials to access {BRAND.name}
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

              <div className="space-y-4">
                <div className="relative group">
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-transparent focus:bg-white/10 focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all peer"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <label
                    htmlFor="email-address"
                    className="absolute left-5 -top-2.5 bg-[#1a1a1a] px-2 text-xs font-medium text-white/50 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:bg-[#1a1a1a] peer-focus:text-gold-400 rounded"
                  >
                    Email address
                  </label>
                </div>

                <div className="relative group">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-transparent focus:bg-white/10 focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all peer pr-12"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label
                    htmlFor="password"
                    className="absolute left-5 -top-2.5 bg-[#1a1a1a] px-2 text-xs font-medium text-white/50 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:bg-[#1a1a1a] peer-focus:text-gold-400 rounded"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-4 text-white/30 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-gold-400 hover:text-gold-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-600 hover:from-gold-300 hover:to-gold-500 text-black font-semibold py-4 px-8 rounded-2xl transition-all shadow-[0_0_40px_-10px_rgba(217,165,33,0.5)] hover:shadow-[0_0_60px_-15px_rgba(217,165,33,0.7)] overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                <span className="relative z-10 flex items-center gap-2">
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </span>
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-8 text-white/50 text-sm">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-semibold text-white hover:text-gold-300 transition-colors underline decoration-white/20 underline-offset-4"
          >
            Create an account
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
