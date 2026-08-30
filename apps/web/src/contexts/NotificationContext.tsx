"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, XCircle, AlertTriangle, X, Zap } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";

type ToastType = "success" | "error" | "info" | "warning";
type BannerType = "success" | "warning" | "info";

interface Toast {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
}

interface Banner {
  id: string;
  title: string;
  message?: string;
  type: BannerType;
  actionText?: string;
  actionHref?: string;
}

interface NotificationContextType {
  batches: any[];
  loadingBatches: boolean;
  dbNotifications: any[];
  unreadCount: number;
  addToast: (toast: Omit<Toast, "id">) => void;
  addBanner: (banner: Omit<Banner, "id">) => void;
  removeBanner: (id: string) => void;
  refreshBatches: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  setBatches: React.Dispatch<React.SetStateAction<any[]>>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [batches, setBatches] = useState<any[]>([]);
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const previousBatchesRef = useRef<any[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);

  const unreadCount = dbNotifications.filter((n) => !n.isRead).length;

  const pushNotificationToDb = async (title: string, message: string, type: string, link?: string) => {
    try {
      await fetchWithAuth(`${API_URL}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, type, link }),
      });
      fetchDbNotifications(); // refresh immediately
    } catch (err) {}
  };

  const fetchDbNotifications = async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/notifications`);
      if (res.ok) setDbNotifications(await res.json());
    } catch (err) {}
  };

  const markAsRead = async (id: string) => {
    try {
      await fetchWithAuth(`${API_URL}/api/notifications/${id}/read`, { method: "POST" });
      setDbNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (err) {}
  };

  const markAllAsRead = async () => {
    try {
      await fetchWithAuth(`${API_URL}/api/notifications/mark-all-read`, { method: "POST" });
      setDbNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {}
  };

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000); // auto remove after 5s
  };

  const addBanner = (banner: Omit<Banner, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    setBanners((prev) => {
      // Prevent duplicate exact banners
      if (prev.some((b) => b.title === banner.title)) return prev;
      return [...prev, { ...banner, id }];
    });
    // Auto remove banners after 10s so they don't clutter forever
    setTimeout(() => {
      setBanners((prev) => prev.filter((b) => b.id !== id));
    }, 10000); 
  };

  const removeBanner = (id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  };

  const refreshBatches = async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches`);
      if (res.ok) {
        const data = await res.json();
        
        // Notification Logic
        const prevData = previousBatchesRef.current;
        // Only trigger notifications if we already had a previous state (not on initial load)
        if (prevData.length > 0) {
          const prevMap = new Map(prevData.map((b: any) => [b.id, b]));
          
          data.forEach((currentBatch: any) => {
            const prevBatch = prevMap.get(currentBatch.id);
            if (!prevBatch) {
              // New batch arrived!
              addToast({
                type: "info",
                title: "New Product Received",
                message: `From ${currentBatch.senderName || currentBatch.senderId || 'WhatsApp'}`
              });
              pushNotificationToDb("New Product Received", `From ${currentBatch.senderName || currentBatch.senderId || 'WhatsApp'}`, "info", `/products/${currentBatch.id}`);
            } else if (prevBatch.status !== currentBatch.status) {
              // Status changed!
              const productName = currentBatch.extractedData?.product_name || "Product";
              if (currentBatch.status === "READY") {
                addToast({
                  type: "success",
                  title: "Product Ready for Review",
                  message: `${productName} has been processed successfully.`
                });
                addBanner({
                  type: "info",
                  title: "Products are ready to be published",
                  message: "You have products awaiting manual review and publishing.",
                });
                pushNotificationToDb("Product Ready", `${productName} has been processed.`, "success", `/products/${currentBatch.id}`);
              } else if (currentBatch.status === "PUBLISHED" || currentBatch.status === "PARTIALLY_PUBLISHED") {
                addToast({
                  type: "success",
                  title: "Product Published",
                  message: `${productName} has been published successfully.`
                });
                addBanner({
                  type: "success",
                  title: "Publishing Successful",
                  message: `${productName} was just published to your social channels.`,
                });
                pushNotificationToDb("Product Published", `${productName} has been published.`, "success", `/products/${currentBatch.id}`);
              } else if (currentBatch.status === "FAILED") {
                addToast({
                  type: "error",
                  title: "Processing Failed",
                  message: `${productName} failed to process or publish.`
                });
                pushNotificationToDb("Processing Failed", `${productName} failed to process.`, "error", `/products/${currentBatch.id}`);
              }
            }
          });
        }

        previousBatchesRef.current = data;
        setBatches(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      refreshBatches();
      fetchDbNotifications();
      const interval = setInterval(() => {
        refreshBatches();
        fetchDbNotifications();
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setLoadingBatches(false);
    }
  }, [status]);

  return (
    <NotificationContext.Provider value={{ batches, setBatches, dbNotifications, unreadCount, markAsRead, markAllAsRead, loadingBatches, addToast, addBanner, removeBanner, refreshBatches }}>
      {children}

      {/* Global Banners (Top of the screen) */}
      <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col gap-2 items-center pointer-events-none mt-4 px-4">
        <AnimatePresence>
          {banners.map((banner) => (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: -50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="pointer-events-auto w-full max-w-2xl"
            >
              <div className={`p-4 rounded-2xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] backdrop-blur-xl border flex items-center gap-4 ${
                banner.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' :
                banner.type === 'warning' ? 'bg-amber-500/90 border-amber-400 text-white' :
                'bg-brand-600/90 border-brand-400 text-white'
              }`}>
                <div className="flex-shrink-0 flex items-center justify-center">
                  {banner.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> :
                   banner.type === 'warning' ? <AlertTriangle className="w-6 h-6" /> :
                   <Zap className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm tracking-wide">{banner.title}</h3>
                  {banner.message && <p className="text-white/90 text-xs mt-0.5">{banner.message}</p>}
                </div>
                <button
                  onClick={() => removeBanner(banner.id)}
                  className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Global Toasts (Bottom Right) */}
      <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[100] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4 md:px-0">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="pointer-events-auto"
            >
              <div className="bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-[0_8px_40px_rgb(0,0,0,0.4)] flex gap-4 overflow-hidden relative group">
                {/* Accent Line */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                  toast.type === 'success' ? 'bg-emerald-500' :
                  toast.type === 'error' ? 'bg-red-500' :
                  toast.type === 'warning' ? 'bg-amber-500' :
                  'bg-brand-500'
                }`} />
                
                <div className={`pt-0.5 flex-shrink-0 ${
                  toast.type === 'success' ? 'text-emerald-400' :
                  toast.type === 'error' ? 'text-red-400' :
                  toast.type === 'warning' ? 'text-amber-400' :
                  'text-brand-400'
                }`}>
                  {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                   toast.type === 'error' ? <XCircle className="w-5 h-5" /> :
                   toast.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                   <Bell className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white text-sm truncate">{toast.title}</h4>
                  {toast.message && <p className="text-white/60 text-xs mt-1 line-clamp-2">{toast.message}</p>}
                </div>
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="absolute top-2 right-2 p-1.5 text-white/30 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10 rounded-md transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
