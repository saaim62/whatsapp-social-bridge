"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationDropdown } from "@/components/ui/NotificationDropdown";
import { ConnectionStatusWidget } from "@/components/ui/ConnectionStatus";
import {
  LayoutDashboard,
  Package,
  Settings,
  Zap,
  Radio,
  Shield,
  Search,
  LogOut,
  Command,
  Activity
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { API_URL } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/sources", label: "Sources", icon: Radio },
  { href: "/settings", label: "Settings", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "/": "Command Center",
  "/products": "Product Matrix",
  "/sources": "Integration Hub",
  "/settings": "System Settings",
};

function getPageTitle(pathname: string | null): string {
  if (!pathname) return "Command Center";
  if (pathname.startsWith("/products/")) return "Product Node";
  return PAGE_TITLES[pathname] ?? "Command Center";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [isCmdkOpen, setIsCmdkOpen] = useState(false);

  const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname || "");

  useEffect(() => {
    if (status === "unauthenticated" && !isPublicRoute) {
      router.push("/login");
    }
  }, [status, isPublicRoute, router]);

  // Global Keyboard Shortcut for Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCmdkOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-obsidian">
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-16 h-16 rounded-full border-t-2 border-electric-cyan flex items-center justify-center"
        >
          <Zap className="w-6 h-6 text-electric-cyan" />
        </motion.div>
      </div>
    );
  }

  const isTrialExpired = (session?.user as any)?.trialExpired;

  return (
    <div className="h-screen w-full bg-obsidian flex overflow-hidden selection:bg-electric-cyan-dim selection:text-electric-cyan">
      
      {/* Background ambient lighting */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-electric-cyan-dim blur-[150px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-electric-magenta-dim blur-[150px] pointer-events-none" />

      {/* Trial Expired Overlay */}
      {isTrialExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-xl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-panel p-10 rounded-3xl max-w-lg w-full text-center flex flex-col items-center mx-4 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />
            <div className="w-20 h-20 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl mb-8 border border-red-500/20">
              <Shield className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-heading font-bold text-white mb-4">System Locked</h2>
            <p className="text-slate-400 mb-8 text-base leading-relaxed">
              Your 30-day evaluation phase has concluded. Activate your core systems for <strong className="text-white">$10/month</strong> to restore full commerce automation.
            </p>
            <button 
              onClick={async () => {
                try {
                  await fetch(`${API_URL}/api/account/mock-pay`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: session?.user?.email })
                  });
                  alert('Authorization successful! Rebooting systems...');
                  signOut();
                } catch (e) {
                  alert('Authorization failed');
                }
              }}
              className="w-full btn-primary flex items-center justify-center gap-3 py-4 text-lg"
            >
              <Zap className="w-5 h-5" />
              Authorize Payment
            </button>
            <button 
              onClick={() => signOut()}
              className="mt-6 text-slate-500 hover:text-white text-sm transition-colors"
            >
              Terminate Session
            </button>
          </motion.div>
        </div>
      )}

      {/* Floating Side Navigation (Desktop) */}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="hidden md:flex flex-col w-[280px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-3xl glass-panel relative z-40 overflow-hidden shrink-0"
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-graphite-border">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-xl bg-graphite flex items-center justify-center border border-graphite-border group-hover:border-electric-cyan/50 transition-colors shadow-[0_0_15px_rgba(0,240,255,0.1)] group-hover:shadow-[0_0_20px_rgba(0,240,255,0.2)] relative">
              <Zap className="w-5 h-5 text-electric-cyan" />
            </div>
            <div>
              <span className="block font-heading text-xl font-bold text-white tracking-tight">
                {BRAND.name}
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-electric-cyan font-semibold mt-1 opacity-80">
                System Active
              </span>
            </div>
          </Link>
        </div>

        {/* Global Search Trigger */}
        <div className="p-4">
          <button
            onClick={() => setIsCmdkOpen(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-graphite/50 border border-graphite-border hover:border-white/20 transition-all text-slate-400 hover:text-white group"
          >
            <div className="flex items-center gap-3 text-sm">
              <Search className="w-4 h-4 group-hover:text-electric-cyan transition-colors" />
              <span>Initialize Command</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-graphite rounded-md text-[10px] font-mono border border-graphite-border text-slate-500 group-hover:text-electric-cyan transition-colors">⌘K</kbd>
            </div>
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto custom-scrollbar">
          {(() => {
            const items = [...NAV_ITEMS];
            if ((session?.user as any)?.role === 'ADMIN') {
              items.push({ href: "/admin", label: "Admin Override", icon: Shield });
            }
            return items.map((item) => {
              const isActive = pathname
                ? item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
                : false;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 relative overflow-hidden ${
                    isActive 
                      ? "bg-white/5 text-white" 
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-electric-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-5 h-5 ${isActive ? "text-electric-cyan" : ""}`} />
                  <span className="font-medium text-sm">{item.label}</span>
                </Link>
              );
            });
          })()}
        </nav>

        {/* User Module */}
        <div className="p-4 border-t border-graphite-border bg-graphite/30">
          <div className="flex items-center justify-between mb-4 px-2">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-electric-emerald animate-pulse-emerald" />
                <span className="text-xs text-slate-400 font-mono">{session?.user?.email}</span>
             </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors text-sm font-medium border border-red-500/10 hover:border-red-500/30"
          >
            <LogOut className="w-4 h-4" />
            Terminate Session
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Floating Header */}
        <header className="h-20 flex items-center justify-between px-6 md:px-10 z-50 shrink-0 relative">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex items-center gap-4"
          >
            <h1 className="text-2xl font-heading font-bold text-white tracking-tight">{pageTitle}</h1>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <ConnectionStatusWidget variant="header" />
            <NotificationDropdown />
          </motion.div>
        </header>

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-24 md:pb-8 px-4 md:px-10 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-[1600px] mx-auto w-full h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Floating Dock */}
      <nav className="md:hidden fixed bottom-6 left-4 right-4 h-16 glass-panel rounded-2xl flex items-center justify-around px-2 z-50 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        {(() => {
          const items = [...NAV_ITEMS];
          if ((session?.user as any)?.role === 'ADMIN') {
            items.push({ href: "/admin", label: "Admin", icon: Shield });
          }
          return items.map((item) => {
            const isActive = pathname
              ? item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
              : false;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center justify-center w-14 h-full gap-1 transition-colors ${
                  isActive ? "text-electric-cyan" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="mobile-active"
                    className="absolute inset-0 bg-electric-cyan/10 rounded-xl"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={`w-5 h-5 relative z-10 ${isActive ? "filter drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]" : ""}`} />
                <span className="text-[9px] font-medium uppercase tracking-wider relative z-10">{item.label}</span>
              </Link>
            );
          });
        })()}
      </nav>

      {/* Command Palette Overlay (Placeholder until cmdk component is built) */}
      <AnimatePresence>
        {isCmdkOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-obsidian/80 backdrop-blur-sm p-4"
            onClick={() => setIsCmdkOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="glass-panel w-full max-w-2xl rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,240,255,0.1)] border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-4 border-b border-graphite-border bg-graphite/50">
                <Search className="w-5 h-5 text-electric-cyan" />
                <input 
                  autoFocus
                  placeholder="Initialize command..."
                  className="flex-1 bg-transparent border-none text-white text-lg focus:outline-none placeholder:text-slate-600 font-sans"
                />
                <kbd className="px-2 py-1 bg-graphite rounded-md text-[10px] font-mono border border-graphite-border text-slate-500">ESC</kbd>
              </div>
              <div className="p-2 bg-graphite-light">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">System Actions</div>
                <button onClick={() => { router.push('/'); setIsCmdkOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-sm text-left group">
                  <Activity className="w-4 h-4 text-electric-cyan group-hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] transition-all" />
                  Mission Control Dashboard
                </button>
                <button onClick={() => { router.push('/products'); setIsCmdkOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-sm text-left group">
                  <Package className="w-4 h-4 text-brand-400 group-hover:drop-shadow-[0_0_8px_#ff00ff] transition-all" />
                  Access Product Matrix
                </button>
                <button onClick={() => { router.push('/sources'); setIsCmdkOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-sm text-left group">
                  <Radio className="w-4 h-4 text-electric-emerald group-hover:drop-shadow-[0_0_8px_rgba(0,255,102,0.8)] transition-all" />
                  Manage Integrations
                </button>
                <button onClick={() => { router.push('/settings'); setIsCmdkOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors text-sm text-left group">
                  <Settings className="w-4 h-4 text-slate-400 group-hover:text-white transition-all" />
                  System Preferences
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
