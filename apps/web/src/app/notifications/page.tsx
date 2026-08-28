"use client";

import { useNotifications } from "@/contexts/NotificationContext";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertTriangle, Info, Check, X, Bell } from "lucide-react";
import { motion } from "framer-motion";

export default function NotificationsPage() {
  const { dbNotifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">Review your activity and system alerts</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-600 hover:bg-brand-100 font-semibold rounded-lg transition-colors text-sm"
          >
            <Check className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {dbNotifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center">
            <Bell className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-lg font-medium">You're all caught up!</p>
            <p className="text-sm mt-1">You have no notifications in your history.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dbNotifications.map((notification, index) => {
              const content = (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-5 flex gap-4 transition-colors ${
                    notification.isRead ? "bg-white hover:bg-slate-50" : "bg-brand-50/20 hover:bg-brand-50/40"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
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
                      <CheckCircle2 className="w-5 h-5" />
                    ) : notification.type === "error" ? (
                      <X className="w-5 h-5" />
                    ) : notification.type === "warning" ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <Info className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-base ${notification.isRead ? "text-slate-700" : "font-bold text-slate-900"}`}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-2 font-medium flex items-center gap-2">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      {!notification.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
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
                      className="flex-shrink-0 self-center p-2 rounded-full hover:bg-brand-100 text-brand-600 transition-colors"
                      title="Mark as read"
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
                  className="block cursor-pointer"
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
