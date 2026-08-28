"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { Radio, Smartphone, Share2 } from "lucide-react";

interface ConnectionStatus {
  whatsapp: {
    isConnected: boolean;
    number: string | null;
  };
  meta: {
    isConnected: boolean;
    pageId: string | null;
  };
}

export function ConnectionStatusWidget({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const { data: session, status } = useSession();
  const [connections, setConnections] = useState<ConnectionStatus>({
    whatsapp: { isConnected: false, number: null },
    meta: { isConnected: false, pageId: null }
  });

  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchStatus = async () => {
      try {
        const [waRes, metaRes] = await Promise.all([
          fetch(`${API_URL}/api/whatsapp/status`, {
            headers: { Authorization: `Bearer ${(session as any)?.accessToken}` }
          }),
          fetch(`${API_URL}/api/social/accounts`, {
            headers: { Authorization: `Bearer ${(session as any)?.accessToken}` }
          })
        ]);

        const waData = await waRes.json();
        const metaData = await metaRes.json();

        setConnections({
          whatsapp: {
            isConnected: !!waData.isReady,
            number: waData.phoneNumber || null
          },
          meta: {
            isConnected: Array.isArray(metaData) && metaData.length > 0,
            pageId: Array.isArray(metaData) && metaData.length > 0 ? metaData[0].facebookPageId : null
          }
        });
      } catch (err) {
        console.error("Failed to fetch connection status", err);
      }
    };

    fetchStatus();
    // Poll every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [session, status]);

  if (variant === 'header') {
    return (
      <Link href="/settings" className="hidden md:flex items-center gap-3 bg-white/50 border border-slate-200/60 px-3 py-1.5 rounded-full hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
          <Smartphone className={`w-4 h-4 ${connections.whatsapp.isConnected ? 'text-emerald-500' : 'text-slate-400'}`} />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">WhatsApp</span>
            <span className={`text-[10px] font-semibold leading-none ${connections.whatsapp.isConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
              {connections.whatsapp.isConnected ? connections.whatsapp.number || 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Share2 className={`w-4 h-4 ${connections.meta.isConnected ? 'text-blue-500' : 'text-slate-400'}`} />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Meta</span>
            <span className={`text-[10px] font-semibold leading-none ${connections.meta.isConnected ? 'text-blue-600' : 'text-slate-500'}`}>
              {connections.meta.isConnected ? connections.meta.pageId || 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // Sidebar variant (mobile)
  return (
    <Link
      href="/settings"
      className="flex md:hidden items-center justify-between w-full p-3 bg-slate-50 border-y border-slate-200"
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connections.whatsapp.isConnected ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <Smartphone className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex items-center gap-1.5 border-l border-slate-300 pl-4">
          <div className={`w-2 h-2 rounded-full ${connections.meta.isConnected ? 'bg-blue-500' : 'bg-red-400'}`} />
          <Share2 className="w-4 h-4 text-slate-600" />
        </div>
      </div>
      <span className="text-xs font-semibold text-brand-600">Manage</span>
    </Link>
  );
}
