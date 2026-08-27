"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Save, Radio, History, CheckCircle2, QrCode, Link as LinkIcon, Share2 } from "lucide-react";
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
    <div className="max-w-3xl pb-16">
      <PageHeader
        title="Settings & Connections"
        description="Configure WhatsApp synchronization, link devices, and connect social media accounts."
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <h2 className="text-xl font-bold text-slate-900 pt-4">Data Sources</h2>

        {/* Connections: WhatsApp */}
        <div className="glass-card p-6 border-l-4 border-l-[#25D366]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#25D366]/20 flex items-center justify-center flex-shrink-0">
              <Radio className="w-5 h-5 text-[#25D366]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">WhatsApp Connection</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md">
                    Link your WhatsApp account to forward messages.
                  </p>
                </div>
                {waStatus?.isReady ? (
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold uppercase rounded-full flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Connected
                    </span>
                    <button onClick={handleDisconnectWhatsApp} className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold uppercase rounded-full transition-colors">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowQr(!showQr)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors">
                    <QrCode className="w-4 h-4" /> {showQr ? "Hide QR" : "Show QR"}
                  </button>
                )}
              </div>
              
              {showQr && !waStatus?.isReady && waStatus?.qrUrl && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 flex flex-col items-center p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-sm font-medium text-slate-600 mb-4 text-center max-w-sm">Open WhatsApp on your phone, go to Linked Devices, and scan this QR code.</p>
                  <img src={waStatus.qrUrl} alt="WhatsApp QR Code" className="w-64 h-64 border-4 border-slate-100 shadow-md rounded-xl" />
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Connections: Facebook / Meta */}
        <div className="glass-card p-6 border-l-4 border-l-[#1877F2]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#1877F2]/20 flex items-center justify-center flex-shrink-0">
              <Share2 className="w-5 h-5 text-[#1877F2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Meta (Facebook & Instagram)</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md">
                    Connect your Meta account to publish products directly to your pages and stories.
                  </p>
                </div>
                {isMetaLinked ? (
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold uppercase rounded-full flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Connected
                    </span>
                    <button onClick={handleDisconnectMeta} className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold uppercase rounded-full transition-colors">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 items-end">
                    <button onClick={handleConnectMeta} className="px-4 py-2 bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-md shadow-[#1877F2]/30">
                      <LinkIcon className="w-4 h-4" /> Connect Meta
                    </button>
                  </div>
                )}
              </div>
              
              {!isMetaLinked && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 flex flex-col p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#1877F2] text-white flex items-center justify-center text-xs">!</span>
                    Before you connect:
                  </h4>
                  <ol className="list-decimal list-inside text-sm text-slate-600 space-y-2 ml-1">
                    <li>Open the Instagram app and switch your account to a <strong>Professional</strong> or <strong>Business</strong> account.</li>
                    <li>Open Facebook and go to your Facebook Page settings.</li>
                    <li>Navigate to <strong>Linked Accounts &gt; Instagram</strong> and link your Instagram account.</li>
                    <li>Once linked, click the <strong>Connect Meta</strong> button above to authorize the portal.</li>
                  </ol>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900 pt-6">Synchronization Settings</h2>

        {/* Live Sync */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Live Auto-Sync</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md">
                    Process new WhatsApp messages in real-time. Pause when you
                    need a break from incoming product drops.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      isSyncActive: !s.isSyncActive,
                    }))
                  }
                  className={`relative w-14 h-7 rounded-full transition-all duration-300 flex-shrink-0 ${
                    settings.isSyncActive
                      ? "bg-gradient-to-r from-brand-500 to-violet-500 shadow-lg shadow-brand-500/30"
                      : "bg-slate-200"
                  }`}
                >
                  <motion.span
                    layout
                    className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md"
                    animate={{ x: settings.isSyncActive ? 28 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
              {settings.isSyncActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Sync is active — new messages will be processed
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Historical Sync */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20 flex-shrink-0">
              <History className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">Historical Sync Depth</h3>
              <p className="text-sm text-slate-500 mt-1 mb-4 max-w-md">
                When linking a new device, WhatsApp pushes chat history. This
                limits how far back messages are processed.
              </p>
              <select
                value={settings.historySyncDepthHours}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    historySyncDepthHours: parseInt(e.target.value),
                  }))
                }
                className="input-field"
              >
                {DEPTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end gap-4">
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-600"
            >
              <CheckCircle2 className="w-4 h-4" />
              Saved successfully
            </motion.span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-gradient"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
