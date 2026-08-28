'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { API_URL } from '@/lib/api';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || null;

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing verification token.');
      return;
    }

    fetch(`${API_URL}/api/account/verify-email?token=${token}`)
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status === 200) {
          setStatus('success');
          setMessage(data.message);
        } else {
          setStatus('error');
          setMessage(data.message || 'Failed to verify email');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('An unexpected error occurred');
      });
  }, [token]);

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-[#0a0a0a] overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 -right-1/4 w-[800px] h-[800px] bg-brand-500/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('/noise.png')] opacity-20 mix-blend-overlay pointer-events-none" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-md px-6"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl relative text-center">
          {status === 'loading' && (
            <div className="py-10">
              <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-white mb-2">Verifying Email</h2>
              <p className="text-white/60">Please wait while we verify your email address...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-10">
              <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-emerald-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Email Verified!</h2>
              <p className="text-white/60 mb-8">{message}</p>
              <Link 
                href="/login"
                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors border border-white/10 w-full"
              >
                Continue to Login
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="py-10">
              <div className="w-20 h-20 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-red-500/10">
                <XCircle className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Verification Failed</h2>
              <p className="text-white/60 mb-8">{message}</p>
              <Link 
                href="/login"
                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-8 rounded-xl transition-colors border border-white/10 w-full"
              >
                Back to Login
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
