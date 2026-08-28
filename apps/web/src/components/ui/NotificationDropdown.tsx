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
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-[100]"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all as read
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
              {dbNotifications.length === 0 ? (
                <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center">
                  <Bell className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">You have no notifications yet.</p>
                </div>
              ) : (
                dbNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-xl flex gap-3 transition-colors ${
                      notification.isRead ? "opacity-70 hover:bg-slate-50" : "bg-brand-50/30 hover:bg-brand-50/50"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        notification.type === "success"
                          ? "bg-emerald-100 text-emerald-600"
                          : notification.type === "error"
                          ? "bg-red-100 text-red-600"
                          : notification.type === "warning"
                          ? "bg-amber-100 text-amber-600"
                          : "bg-brand-100 text-brand-600"
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
                      <p className={`text-sm ${notification.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="flex-shrink-0 self-center w-2 h-2 rounded-full bg-brand-500"
                        title="Mark as read"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
