"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Settings,
  Zap,
  ExternalLink,
  Radio,
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
  "/": "Dashboard",
  "/products": "Products",
  "/sources": "WhatsApp Sources",
  "/settings": "Settings",
};

function getPageTitle(pathname: string | null): string {
  if (!pathname) return "Dashboard";
  if (pathname.startsWith("/products/")) return "Product Review";
  return PAGE_TITLES[pathname] ?? "Dashboard";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login" && pathname !== "/register") {
      router.push("/login");
    }
  }, [status, pathname, router]);

  if (pathname === "/login" || pathname === "/register") {
    return <>{children}</>;
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-xl font-semibold text-slate-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar (Desktop) */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="hidden md:flex w-[260px] flex-shrink-0 flex-col relative overflow-hidden"
        style={{ background: "var(--color-sidebar)" }}
      >
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-brand-600/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-20 -left-10 w-32 h-32 bg-violet-600/15 rounded-full blur-[60px] pointer-events-none" />

        {/* Logo */}
        <div className="relative h-16 flex items-center px-5 border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-shadow duration-300 animate-gradient bg-[length:200%_200%]">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 opacity-0 group-hover:opacity-30 blur-md transition-opacity duration-300" />
            </div>
            <div>
              <span className="text-lg font-extrabold text-white tracking-tight">
                {BRAND.name}
              </span>
              <p className="text-[10px] font-medium text-slate-500 leading-none mt-0.5">
                Commerce Automation
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item, i) => {
            const isActive = pathname
              ? item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
              : false;
            const Icon = item.icon;

            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
              >
                <Link
                  href={item.href}
                  className={`nav-item relative ${isActive ? "nav-item-active" : "nav-item-inactive"}`}
                >
                  <Icon
                    className={`w-[18px] h-[18px] ${isActive ? "text-brand-400" : ""}`}
                  />
                  {item.label}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 w-1 h-6 rounded-r-full bg-gradient-to-b from-brand-400 to-violet-500"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* WhatsApp connection */}
        <div className="relative p-4 border-t border-white/[0.06]">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/10 transition-all duration-300 group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
              <Radio className="w-4 h-4 text-[#25D366] group-hover:animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">Connections</p>
              <p className="text-[10px] text-slate-500 truncate">WhatsApp / Meta</p>
            </div>
          </Link>
        </div>

        {/* User Account / Sign Out */}
        <div className="relative p-4 border-t border-white/[0.06]">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 px-3 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 group text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-400">Sign Out</p>
              <p className="text-[10px] text-red-500/70 truncate">{session?.user?.email}</p>
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="h-16 flex-shrink-0 flex items-center justify-between px-8 border-b border-slate-200/60 bg-white/50 backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900 hidden sm:block">{pageTitle}</h2>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-50 text-brand-600 border border-brand-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>

          {/* Center: Logged in user email */}
          <div className="flex-1 flex justify-center items-center px-4">
            <div className="bg-slate-100/80 border border-slate-200/60 px-3 py-1.5 rounded-full flex items-center gap-2 max-w-[200px] sm:max-w-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-slate-600 truncate">
                {session?.user?.email || 'Logged In'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center bg-gradient-to-r from-indigo-50 to-purple-50 px-3 py-1.5 rounded-full border border-indigo-100/50 shadow-sm">
              <span className="text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                {BRAND.tagline}
              </span>
            </div>
            {/* Mobile Sign Out Button in Header */}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors border border-rose-100 font-semibold text-xs"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </motion.header>

        {/* Content */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around px-2 z-50 pb-safe">
        {NAV_ITEMS.map((item) => {
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
              className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${
                isActive ? "text-brand-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "fill-brand-50/50" : ""}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
