"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, ArrowRight, Lock } from "lucide-react";
import { useDemoStore } from "@/lib/demo-store";

/**
 * The demo gate. Shown when a logged-out visitor tries a real action
 * (publish, approve, save, connect…). Browsing is free; doing is what
 * the account is for.
 */
export function AuthPrompt() {
  const promptOpen = useDemoStore((s) => s.promptOpen);
  const actionLabel = useDemoStore((s) => s.actionLabel);
  const closePrompt = useDemoStore((s) => s.closePrompt);

  return (
    <AnimatePresence>
      {promptOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-obsidian/80 backdrop-blur-sm p-4"
          onClick={closePrompt}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass-panel w-full max-w-md rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(217,165,33,0.15)] border-white/10 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
            <button
              onClick={closePrompt}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-7 sm:p-8 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 flex items-center justify-center shadow-[0_10px_26px_-6px_rgba(217,165,33,0.65),inset_0_1px_0_rgba(255,255,255,0.5)] mb-5">
                <Lock className="w-6 h-6 text-black" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-400">
                Demo mode
              </span>
              <h2 className="mt-2 text-2xl font-heading font-bold text-white tracking-tight">
                Enjoying the tour?
              </h2>
              <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                You&apos;re exploring DropRoute with sample data. To{" "}
                <span className="text-gold-300 font-semibold">{actionLabel}</span>{" "}
                for real, create a free account — then it&apos;s your WhatsApp,
                your products, your store.
              </p>

              <Link
                href="/register"
                className="btn-primary mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-base font-semibold"
              >
                Create free account
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/login"
                className="mt-2.5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white/[0.04] border border-white/15 text-white font-semibold hover:bg-white/[0.08] transition-colors"
              >
                Sign in
              </Link>
              <button
                onClick={closePrompt}
                className="mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Keep exploring the demo
              </button>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-600">
                <Zap className="w-3 h-3 text-gold-500" />
                Free 30-day trial · No card required
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
