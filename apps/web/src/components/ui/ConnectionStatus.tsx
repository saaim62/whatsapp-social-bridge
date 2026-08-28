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
      <Link href="/settings" className="hidden md:flex items-center gap-3 bg-graphite-darker/80 backdrop-blur-md border border-graphite-border px-4 py-1.5 rounded-full hover:bg-graphite hover:border-electric-cyan/30 transition-all shadow-sm">
        <div className="flex items-center gap-2 border-r border-graphite-border pr-3">
          <Smartphone className={`w-4 h-4 ${connections.whatsapp.isConnected ? 'text-electric-emerald drop-shadow-[0_0_5px_#00FFA3]' : 'text-slate-500'}`} />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">WhatsApp</span>
            <span className={`text-[10px] font-mono font-bold leading-none ${connections.whatsapp.isConnected ? 'text-electric-emerald' : 'text-slate-400'}`}>
              {connections.whatsapp.isConnected ? connections.whatsapp.number || 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <Share2 className={`w-4 h-4 ${connections.meta.isConnected ? 'text-brand-400 drop-shadow-[0_0_5px_#818cf8]' : 'text-slate-500'}`} />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Meta</span>
            <span className={`text-[10px] font-mono font-bold leading-none ${connections.meta.isConnected ? 'text-brand-400' : 'text-slate-400'}`}>
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
      className="flex md:hidden items-center justify-between w-full p-4 bg-graphite-darker/50 border-y border-graphite-border hover:bg-graphite transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connections.whatsapp.isConnected ? 'bg-electric-emerald shadow-[0_0_5px_#00FFA3]' : 'bg-red-500'}`} />
          <Smartphone className={`w-4 h-4 ${connections.whatsapp.isConnected ? 'text-electric-emerald' : 'text-slate-500'}`} />
        </div>
        <div className="flex items-center gap-2 border-l border-graphite-border pl-4">
          <div className={`w-2 h-2 rounded-full ${connections.meta.isConnected ? 'bg-brand-400 shadow-[0_0_5px_#818cf8]' : 'bg-red-500'}`} />
          <Share2 className={`w-4 h-4 ${connections.meta.isConnected ? 'text-brand-400' : 'text-slate-500'}`} />
        </div>
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-electric-cyan">Manage</span>
    </Link>
  );
}
