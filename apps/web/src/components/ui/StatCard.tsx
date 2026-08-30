"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  gradient: string;
  iconBg: string;
  delay?: number;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
  iconBg,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative"
    >
      <div className="stat-glow" />
      <div className="relative glass-card-hover p-6 overflow-hidden">
        <div
          className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 ${gradient}`}
        />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {title}
            </p>
            <motion.p
              key={String(value)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900"
            >
              {value}
            </motion.p>
          </div>
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-2xl ${iconBg} shadow-lg`}
          >
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
