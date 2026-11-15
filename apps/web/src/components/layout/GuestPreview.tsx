"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Zap,
  ArrowRight,
  Activity,
  Globe,
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

/* Logged-out preview of the Command Center.
   Same glass, same backdrop, same layout as the signed-in dashboard —
   with sample data — so a visitor sees the real product before being
   asked to sign in. Only the hero card is interactive. */

const SAMPLE_QUEUE = [
  {
    name: "Chronograph Watch — Leather Strap",
    assets: 15,
    waiting: "12 minutes",
    supplier: "Rs. 1,850",
    selling: "Rs. 2,499",
  },
  {
    name: "Running Shoes — UK 9, Black",
    assets: 8,
    waiting: "38 minutes",
    supplier: "Rs. 3,200",
    selling: "Rs. 4,299",
  },
  {
    name: "Wireless Earbuds Pro — ANC",
    assets: 6,
    waiting: "1 hour",
    supplier: "Rs. 2,750",
    selling: "Rs. 3,699",
  },
];

const STATS = [
  {
    label: "Total Volume",
    sub: "Nodes Processed",
    value: "128",
    icon: Activity,
    iconClass: "text-gold-400",
    subClass: "text-gold-400/90",
    bar: "from-transparent via-gold-500/70 to-transparent",
    numberClass:
      "bg-gradient-to-b from-gold-300 via-gold-400 to-gold-600 bg-clip-text text-transparent",
  },
  {
    label: "Live Output",
    sub: "Active on Network",
    value: "96",
    icon: Globe,
    iconClass: "text-emerald-400",
    subClass: "text-emerald-400/90",
    bar: "from-transparent via-emerald-500/50 to-transparent",
    numberClass: "text-white",
  },
  {
    label: "Anomalies",
    sub: "Failed Transmissions",
    value: "2",
    icon: AlertCircle,
    iconClass: "text-rose-400",
    subClass: "text-rose-400/90",
    bar: "from-transparent via-rose-500/50 to-transparent",
    numberClass: "text-white",
  },
];

export function GuestPreview() {
  return (
    <div className="relative max-w-6xl mx-auto">
      <div className="relative space-y-6 md:space-y-10">
        {/* ——— Hero / sign-in card (the only interactive part) ——— */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel relative overflow-hidden rounded-3xl px-5 py-8 sm:p-10 text-center"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 flex items-center justify-center shadow-[0_10px_26px_-6px_rgba(217,165,33,0.65),inset_0_1px_0_rgba(255,255,255,0.5)] mb-5">
              <Zap className="w-6 h-6 text-black" strokeWidth={2.5} />
            </div>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-gold-400">
              Live preview · {BRAND.name}
            </span>
            <h2 className="mt-3 text-2xl sm:text-4xl font-heading font-bold text-white tracking-tight leading-tight max-w-2xl">
              Supplier drops land in WhatsApp.
              <span className="block text-gold-300">Your store sells them.</span>
            </h2>
            <p className="mt-4 text-sm sm:text-base text-slate-400 leading-relaxed max-w-xl">
              {BRAND.description} DropRoute extracts the product and price, applies
              your margin, and queues everything for your one-tap review — this is
              the actual dashboard, running on sample data.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <Link
                href="/register"
                className="btn-primary flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold rounded-2xl"
              >
                Create free account
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 px-7 py-3.5 text-base font-semibold rounded-2xl bg-white/[0.04] border border-white/15 text-white hover:bg-white/[0.08] hover:border-gold-500/40 transition-all"
              >
                <Lock className="w-4 h-4 text-gold-400" />
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Free 30-day trial · No card required · Set up in minutes
            </p>
          </div>
        </motion.div>

        {/* ——— Sample dashboard (non-interactive) ——— */}
        <div aria-hidden className="pointer-events-none select-none space-y-6 md:space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {STATS.map((s) => (
              <div key={s.label} className="glass-card group relative flex h-full flex-col justify-between p-6">
                <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${s.bar} opacity-70`} />
                <div className="relative z-10 mb-8 flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">{s.label}</span>
                  <s.icon className={`w-5 h-5 ${s.iconClass}`} />
                </div>
                <div className="relative z-10">
                  <div className={`text-5xl sm:text-6xl font-heading font-bold ${s.numberClass}`}>{s.value}</div>
                  <div className={`text-sm mt-2 font-medium ${s.subClass}`}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel relative overflow-hidden rounded-3xl p-5 sm:p-8">
            <div className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-heading font-bold text-white">Needs Your Review</h3>
                <p className="text-slate-400 text-sm mt-1">
                  Products extracted from your WhatsApp sources, waiting for your decision.
                  <span className="text-gold-300 font-semibold"> ≈ Rs. 10,497 in this queue at your selling prices.</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/15 text-slate-300 text-[10px] font-bold tracking-widest uppercase">
                  Sample data
                </span>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-semibold tracking-widest uppercase">
                  <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
                  3 waiting
                </span>
              </div>
            </div>

            <ul className="relative z-10 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              {SAMPLE_QUEUE.map((item) => (
                <li key={item.name} className="flex items-center gap-3 sm:gap-4 px-4 py-3.5">
                  <div className="w-12 h-12 rounded-lg bg-graphite border border-white/10 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-gold-500/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-slate-100 truncate">{item.name}</p>
                    <div className="flex items-center gap-2.5 mt-0.5 text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> waiting {item.waiting}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                      <span>{item.assets} assets</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-bold text-gold-300 bg-gold-500/10 border border-gold-500/25 rounded-full px-3 py-1 inline-block">
                      {item.selling}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-1.5 font-mono">
                      <span className="line-through">{item.supplier}</span> supplier
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="relative z-10 mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-500">
              <span>Received <span className="text-slate-300 font-bold">128</span></span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>Processing now <span className="text-slate-300 font-bold">4</span></span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>Approved, to publish <span className="text-slate-300 font-bold">7</span></span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>Published <span className="text-emerald-300 font-bold">96</span></span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>WhatsApp <span className="text-emerald-300 font-bold">Connected</span></span>
              <span className="ml-auto normal-case tracking-normal flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Sign in to run it on your own products
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
