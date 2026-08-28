"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, AlertTriangle, Info, Check, X } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { dbNotifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-xl bg-graphite border border-graphite-border hover:border-electric-cyan/50 hover:bg-electric-cyan/5 transition-all focus:outline-none shadow-[0_0_15px_rgba(0,0,0,0.5)] group"
      >
        <Bell className="w-5 h-5 text-slate-400 group-hover:text-electric-cyan transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.6)] border border-obsidian">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
            className="absolute right-0 mt-3 w-80 sm:w-96 glass-panel border border-graphite-border shadow-[0_10px_50px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden z-[100]"
          >
            <div className="p-4 border-b border-graphite-border flex items-center justify-between bg-graphite/80 backdrop-blur-md">
              <h3 className="font-heading font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-electric-cyan" />
                System Alerts
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-xs font-semibold text-electric-emerald hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Ack All
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto p-2 space-y-1 custom-scrollbar bg-obsidian/90">
              {dbNotifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center">
                  <Bell className="w-10 h-10 mb-3 opacity-20 text-electric-cyan" />
                  <p className="text-sm font-medium tracking-wider uppercase">Telemetry Nominal</p>
                  <p className="text-xs text-slate-600 mt-1">No alerts detected.</p>
                </div>
              ) : (
                dbNotifications.map((notification) => {
                  const content = (
                    <>
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                          notification.type === "success"
                            ? "bg-electric-emerald/10 border-electric-emerald/30 text-electric-emerald shadow-[0_0_10px_rgba(0,255,102,0.1)]"
                            : notification.type === "error"
                            ? "bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                            : notification.type === "warning"
                            ? "bg-orange-500/10 border-orange-500/30 text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.1)]"
                            : "bg-electric-cyan/10 border-electric-cyan/30 text-electric-cyan shadow-[0_0_10px_rgba(0,240,255,0.1)]"
                        }`}
                      >
                        {notification.type === "success" ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : notification.type === "error" ? (
                          <X className="w-4 h-4" />
                        ) : notification.type === "warning" ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Info className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${notification.isRead ? "text-slate-400" : "font-bold text-white group-hover:text-electric-cyan transition-colors"}`}>
                          {notification.title}
                        </p>
                        {notification.message && (
                          <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${notification.isRead ? "text-slate-500" : "text-slate-300"}`}>
                            {notification.message}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500 mt-2 font-mono uppercase tracking-wider">
                          T-{formatDistanceToNow(new Date(notification.createdAt))}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          className="flex-shrink-0 self-center w-2.5 h-2.5 rounded-full bg-electric-cyan shadow-[0_0_8px_rgba(0,240,255,0.8)] hover:scale-150 transition-transform"
                          title="Acknowledge alert"
                        />
                      )}
                    </>
                  );

                  const wrapperClasses = `p-3 rounded-xl flex gap-3 transition-colors border group ${
                    notification.isRead 
                      ? "border-transparent opacity-60 hover:bg-graphite" 
                      : "border-graphite-border bg-graphite/40 hover:bg-graphite hover:border-electric-cyan/30"
                  }`;

                  return notification.link ? (
                    <a
                      key={notification.id}
                      href={notification.link}
                      onClick={() => {
                        if (!notification.isRead) markAsRead(notification.id);
                        setIsOpen(false);
                      }}
                      className={`${wrapperClasses} block w-full text-left cursor-pointer`}
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={notification.id} className={wrapperClasses}>
                      {content}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-graphite-border bg-graphite/80 backdrop-blur-md">
              <a
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors flex items-center justify-center rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10"
              >
                Access Alert History
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
