"use client";

import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertTriangle, Info, Check, X, Bell } from "lucide-react";
import { motion } from "framer-motion";

export default function NotificationsPage() {
  const { dbNotifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-white uppercase tracking-wider flex items-center gap-3">
            <Bell className="w-6 h-6 text-electric-cyan" />
            Alert History
          </h1>
          <p className="text-slate-400 text-sm mt-1">Review your system logs and integration telemetry</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead()}
            className="flex items-center gap-2 px-4 py-2 bg-electric-emerald/10 border border-electric-emerald/30 text-electric-emerald hover:bg-electric-emerald/20 hover:text-white font-bold rounded-lg transition-colors text-sm uppercase tracking-wider shadow-[0_0_15px_rgba(0,255,102,0.1)]"
          >
            <Check className="w-4 h-4" />
            Acknowledge All
          </button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        {dbNotifications.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-graphite-darker flex items-center justify-center mb-4 border border-graphite-border shadow-[0_0_30px_rgba(0,240,255,0.05)] relative overflow-hidden">
               <div className="absolute inset-0 bg-electric-cyan/5 blur-xl" />
               <Bell className="w-8 h-8 opacity-50 text-electric-cyan relative z-10" />
            </div>
            <p className="text-lg font-heading font-bold text-white tracking-widest uppercase mb-1">Telemetry Nominal</p>
            <p className="text-sm">You have no alerts in your history buffer.</p>
          </div>
        ) : (
          <div className="divide-y divide-graphite-border/50">
            {dbNotifications.map((notification, index) => {
              const content = (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-6 flex gap-4 transition-colors group ${
                    notification.isRead 
                      ? "hover:bg-white/[0.02] opacity-70" 
                      : "bg-graphite/40 hover:bg-graphite border-l-2 border-l-electric-cyan"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 border relative overflow-hidden ${
                      notification.type === "success"
                        ? "bg-electric-emerald/10 border-electric-emerald/30 text-electric-emerald shadow-[0_0_15px_rgba(0,255,102,0.1)]"
                        : notification.type === "error"
                        ? "bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                        : notification.type === "warning"
                        ? "bg-orange-500/10 border-orange-500/30 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                        : "bg-electric-cyan/10 border-electric-cyan/30 text-electric-cyan shadow-[0_0_15px_rgba(0,240,255,0.1)]"
                    }`}
                  >
                    <div className="absolute inset-0 bg-current opacity-10 blur-md" />
                    {notification.type === "success" ? (
                      <CheckCircle2 className="w-5 h-5 relative z-10" />
                    ) : notification.type === "error" ? (
                      <X className="w-5 h-5 relative z-10" />
                    ) : notification.type === "warning" ? (
                      <AlertTriangle className="w-5 h-5 relative z-10" />
                    ) : (
                      <Info className="w-5 h-5 relative z-10" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-heading tracking-wide ${notification.isRead ? "text-slate-300" : "font-bold text-white group-hover:text-electric-cyan transition-colors"}`}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className={`text-sm mt-1 leading-relaxed ${notification.isRead ? "text-slate-500" : "text-slate-400"}`}>
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-3 font-mono uppercase tracking-wider flex items-center gap-2">
                      T-{formatDistanceToNow(new Date(notification.createdAt))}
                      {!notification.isRead && (
                        <span className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse shadow-[0_0_8px_rgba(0,240,255,0.8)]" />
                      )}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                      className="flex-shrink-0 self-center p-3 rounded-xl bg-graphite border border-graphite-border hover:border-electric-cyan hover:bg-electric-cyan/10 text-electric-cyan transition-colors group-hover:opacity-100 opacity-50"
                      title="Acknowledge alert"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                  )}
                </motion.div>
              );

              return notification.link ? (
                <a
                  key={notification.id}
                  href={notification.link}
                  onClick={() => {
                    if (!notification.isRead) markAsRead(notification.id);
                  }}
                  className="block cursor-pointer outline-none focus:ring-2 focus:ring-electric-cyan/50"
                >
                  {content}
                </a>
              ) : (
                <div key={notification.id}>{content}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
