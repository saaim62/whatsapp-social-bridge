"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Save, Radio, History, CheckCircle2, QrCode, Link as LinkIcon, Share2, RefreshCw, AlertCircle } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const DEPTH_OPTIONS = [
  { value: 6, label: "Last 6 hours" },
  { value: 24, label: "Last 24 hours" },
  { value: 72, label: "Last 3 days" },
  { value: 168, label: "Last 1 week" },
  { value: 336, label: "Last 2 weeks" },
  { value: 672, label: "Last 4 weeks" },
  { value: 720, label: "Last 1 month" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    isSyncActive: true,
    historySyncDepthHours: 24,
  });
  const [waStatus, setWaStatus] = useState<any>(null);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<{
    success: boolean;
    message?: string;
    imported?: number;
    skipped?: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('social') === 'success' || urlParams.get('social') === 'error') {
        if (window.opener) {
          window.opener.location.reload();
          window.close();
        }
      }
    }

    Promise.all([
      fetchWithAuth(`${API_URL}/api/settings`).then(r => r.json()),
      fetchWithAuth(`${API_URL}/api/whatsapp/status`).then(r => r.json()),
      fetchWithAuth(`${API_URL}/api/social/accounts`).then(r => r.json())
    ]).then(([settingsData, waData, socialData]) => {
      if (settingsData && !settingsData.error) setSettings(settingsData);
      if (waData && !waData.error) setWaStatus(waData);
      if (socialData && !socialData.error) setSocialAccounts(socialData);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  // Poll WhatsApp status if it's currently showing QR or if it was just initialized
  useEffect(() => {
    if (!waStatus?.isReady) {
      const interval = setInterval(() => {
        fetchWithAuth(`${API_URL}/api/whatsapp/status`)
          .then(r => r.json())
          .then(data => {
             if (data && !data.error) setWaStatus(data);
          })
          .catch(console.error);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [waStatus?.isReady]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetchWithAuth(`${API_URL}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const handleResyncHistory = async () => {
    setResyncing(true);
    setResyncResult(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/whatsapp/resync-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depthHours: settings.historySyncDepthHours,
        }),
      });
      const data = await res.json();
      setResyncResult(data);
      setTimeout(() => {
        setResyncResult((prev) => (prev === data ? null : prev));
      }, 8000);
    } catch (err: any) {
      setResyncResult({
        success: false,
        message: err.message || "Failed to trigger historical resync.",
      });
    } finally {
      setResyncing(false);
    }
  };

  const handleConnectMeta = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/social/oauth/facebook`);
      const data = await res.json();
      if (data && data.url) {
        const width = 600;
        const height = 700;
        const left = window.innerWidth / 2 - width / 2;
        const top = window.innerHeight / 2 - height / 2;
        window.open(
          data.url,
          'MetaLogin',
          `width=${width},height=${height},top=${top},left=${left}`
        );
      }
    } catch (err) {
      console.error('Failed to get Meta OAuth URL', err);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm('Are you sure you want to disconnect WhatsApp? You will need to scan a new QR code to reconnect.')) return;
    try {
      await fetchWithAuth(`${API_URL}/api/whatsapp/disconnect`, { method: 'DELETE' });
      setWaStatus({ isReady: false, qrUrl: null });
      setShowQr(true);
    } catch (err) {
      console.error('Failed to disconnect WhatsApp', err);
    }
  };

  const handleDisconnectMeta = async () => {
    if (!confirm('Are you sure you want to disconnect your Meta account?')) return;
    try {
      await fetchWithAuth(`${API_URL}/api/social/disconnect`, { method: 'DELETE' });
      setSocialAccounts([]);
    } catch (err) {
      console.error('Failed to disconnect Meta', err);
    }
  };

  const isMetaLinked = socialAccounts.some(a => a.platform === 'META');

  if (loading) return <LoadingSpinner label="Loading settings..." />;

  return (
    <div className="max-w-4xl mx-auto pb-16 space-y-8">
      
      {/* Header Panel */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b-2 border-b-electric-cyan/20">
        <div>
          <h2 className="text-2xl font-heading font-bold text-white flex items-center gap-3">
            <Radio className="w-6 h-6 text-electric-cyan" />
            System Configuration
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Configure matrix uplink nodes, link core social identities, and set synchronization protocols.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <h2 className="text-lg font-heading font-bold text-electric-cyan uppercase tracking-wider pl-2">Data Source Nodes</h2>

        {/* Connections: WhatsApp */}
        <div className="glass-card p-4 sm:p-6 border-l-4 border-l-[#25D366] bg-graphite-darker/50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-[#25D366]/5 blur-md" />
              <Radio className="w-6 h-6 text-[#25D366] relative z-10" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">WhatsApp Protocol Uplink</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-md">
                    Link primary WhatsApp instance to establish inbound asset streams.
                  </p>
                </div>
                {waStatus?.isReady ? (
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-bold uppercase tracking-wider rounded-md flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] shadow-[0_0_5px_#25D366] animate-pulse" />
                      Connected
                    </span>
                    <button onClick={handleDisconnectWhatsApp} className="btn-glass px-4 py-1.5 text-xs text-red-400 border-red-500/30 hover:border-red-500 hover:bg-red-500/10">
                      Sever Link
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowQr(!showQr)} className="btn-glow px-4 py-2 flex items-center gap-2">
                    <QrCode className="w-4 h-4" /> {showQr ? "Hide Sequence" : "Init QR Sequence"}
                  </button>
                )}
              </div>
              
              {showQr && !waStatus?.isReady && waStatus?.qrUrl && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 flex flex-col items-center p-6 bg-graphite rounded-xl border border-graphite-border shadow-2xl">
                  <p className="text-sm font-medium text-electric-cyan mb-4 text-center max-w-sm uppercase tracking-wider">Scan payload via Linked Devices to authorize node</p>
                  <div className="p-4 bg-white rounded-xl shadow-[0_0_30px_rgba(37,211,102,0.2)]">
                     <img src={waStatus.qrUrl} alt="WhatsApp QR Code" className="w-64 h-64" />
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Connections: Facebook / Meta */}
        <div className="glass-card p-4 sm:p-6 border-l-4 border-l-[#1877F2] bg-graphite-darker/50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/30 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-[#1877F2]/5 blur-md" />
               <Share2 className="w-6 h-6 text-[#1877F2] relative z-10" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Meta (Facebook & Instagram)</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-md">
                    Establish OAuth bridge for automated outbound publishing.
                  </p>
                </div>
                {isMetaLinked ? (
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#1877F2] text-xs font-bold uppercase tracking-wider rounded-md flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1877F2] shadow-[0_0_5px_#1877F2]" />
                      Active
                    </span>
                    <button onClick={handleDisconnectMeta} className="btn-glass px-4 py-1.5 text-xs text-red-400 border-red-500/30 hover:border-red-500 hover:bg-red-500/10">
                      Sever Link
                    </button>
                  </div>
                ) : (
                  <button onClick={handleConnectMeta} className="px-5 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(24,119,242,0.4)]">
                    <LinkIcon className="w-4 h-4" /> Initialize Meta Bridge
                  </button>
                )}
              </div>
              
              {!isMetaLinked && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 flex flex-col p-5 bg-graphite rounded-xl border border-graphite-border">
                  <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-[#1877F2]/20 border border-[#1877F2]/50 text-[#1877F2] flex items-center justify-center text-xs">!</span>
                    Pre-requisite Protocols:
                  </h4>
                  <ol className="list-decimal list-inside text-sm text-slate-400 space-y-2 ml-2">
                    <li>Switch Instagram account to <span className="text-slate-200">Professional</span> or <span className="text-slate-200">Business</span> mode.</li>
                    <li>Access Facebook Page settings.</li>
                    <li>Navigate to <span className="text-slate-200">Linked Accounts &gt; Instagram</span> and establish link.</li>
                    <li>Initialize Meta Bridge above to authorize API access.</li>
                  </ol>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <h2 className="text-lg font-heading font-bold text-electric-cyan uppercase tracking-wider pl-2 pt-6">Core Protocols</h2>

        {/* Live Sync */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-electric-magenta/10 border border-electric-magenta/30 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-electric-magenta/5 blur-md" />
               <Radio className="w-6 h-6 text-electric-magenta relative z-10" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Live Node Synchronization</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-md">
                    Process incoming packets in real-time. Disable to pause pipeline ingestion.
                  </p>
                </div>
                
                {/* Hardware Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      isSyncActive: !s.isSyncActive,
                    }))
                  }
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 shadow-inner outline-none ${
                    settings.isSyncActive 
                      ? 'bg-electric-magenta/20 border border-electric-magenta/50' 
                      : 'bg-graphite-darker border border-graphite-border'
                  }`}
                >
                  <span className="sr-only">Toggle Sync</span>
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full transition-transform duration-300 shadow-md ${
                      settings.isSyncActive 
                        ? 'translate-x-7 bg-electric-magenta shadow-[0_0_10px_#FF00FF]' 
                        : 'translate-x-1 bg-slate-500'
                    }`}
                  />
                </button>
              </div>
              {settings.isSyncActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-4 flex items-center gap-2 text-xs font-bold tracking-wider text-electric-magenta bg-electric-magenta/5 px-3 py-2 rounded-md border border-electric-magenta/20 uppercase"
                >
                  <span className="w-2 h-2 rounded-full bg-electric-magenta animate-pulse shadow-[0_0_5px_#FF00FF]" />
                  Stream ingestion active
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Historical Sync */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-electric-cyan/10 border border-electric-cyan/30 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-electric-cyan/5 blur-md" />
               <History className="w-6 h-6 text-electric-cyan relative z-10" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Historical Buffer Depth</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-md">
                    Configure retroactive parsing limit when initializing a new node connection or on-demand re-sync.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={settings.historySyncDepthHours}
                    onChange={async (e) => {
                      const newDepth = parseInt(e.target.value, 10);
                      setSettings((s) => ({
                        ...s,
                        historySyncDepthHours: newDepth,
                      }));
                      try {
                        await fetchWithAuth(`${API_URL}/api/settings`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ...settings,
                            historySyncDepthHours: newDepth,
                          }),
                        });
                        setSaved(true);
                        setTimeout(() => setSaved(false), 3000);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="w-full sm:w-56 bg-graphite-darker border border-graphite-border rounded-xl px-4 py-2.5 text-white focus:border-electric-cyan focus:ring-1 focus:ring-electric-cyan transition-all appearance-none cursor-pointer text-sm"
                  >
                    {DEPTH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleResyncHistory}
                    disabled={resyncing}
                    className="btn-glow px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resyncing ? 'animate-spin' : ''}`} />
                    {resyncing ? "Scanning Buffer..." : "Sync Buffer Now"}
                  </button>
                </div>
              </div>

              {resyncResult && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                    resyncResult.success
                      ? 'bg-electric-emerald/10 border-electric-emerald/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  {resyncResult.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-electric-emerald" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  )}
                  <div>
                    <span className="font-semibold">
                      {resyncResult.success ? "Retroactive Sync Complete: " : "Notice: "}
                    </span>
                    {resyncResult.message || (
                      resyncResult.imported && resyncResult.imported > 0
                        ? `Ingested ${resyncResult.imported} new product drop(s) into catalog (${resyncResult.skipped || 0} duplicates skipped).`
                        : `Catalog is up to date (${resyncResult.skipped || 0} existing products checked, 0 duplicates created).`
                    )}
                  </div>
                </motion.div>
              )}

              <p className="text-xs text-slate-500 mt-3">
                💡 When you click <strong className="text-slate-400">Sync Buffer Now</strong>, DropRoute parses the past <span className="text-electric-cyan font-bold">{DEPTH_OPTIONS.find(o => o.value === settings.historySyncDepthHours)?.label || `${settings.historySyncDepthHours} hours`}</span> of message drops, automatically skipping any products already in your catalog.
              </p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-6 pt-4">
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-electric-emerald bg-electric-emerald/10 px-4 py-2 rounded-lg border border-electric-emerald/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              Settings Committed
            </motion.span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-glow px-8 py-3"
          >
            <Save className="w-4 h-4 mr-2 inline-block" />
            {saving ? "Writing to Matrix..." : "Commit Settings"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
