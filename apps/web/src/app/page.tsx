"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, animate } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Zap,
  ArrowRight,
  Database,
  Globe,
  Activity,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  Clock
} from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";

/* Animated counter — eases from 0 to the value on mount / change. */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value]);
  return <>{display}</>;
}

export default function DashboardPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [waStatus, setWaStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadAll = () => {
    fetchWithAuth(`${API_URL}/api/batches`)
      .then((res) => res.json())
      .then((data) => {
        setBatches(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetchWithAuth(`${API_URL}/api/whatsapp/status`)
      .then((res) => res.json())
      .then((data) => { if (data && !data.error) setWaStatus(data); })
      .catch(() => {});
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* Bulk actions — wired to the existing bulk endpoints.
     Publish stays staggered server-side (1/min, anti-ban pacing). */
  const runBulk = async (kind: "approve" | "publish" | "delete") => {
    const ids = Array.from(selected);
    if (!ids.length || bulkBusy) return;
    if (kind === "delete" && !window.confirm(`Delete ${ids.length} product(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      const jsonHeaders = { "Content-Type": "application/json" };
      if (kind === "approve") {
        await Promise.all(
          ids.map((id) =>
            fetchWithAuth(`${API_URL}/api/batches/${id}/approve`, {
              method: "POST",
              headers: jsonHeaders,
              body: JSON.stringify({}),
            })
          )
        );
      } else if (kind === "publish") {
        await fetchWithAuth(`${API_URL}/api/batches/publish-bulk`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ ids }),
        });
      } else {
        await fetchWithAuth(`${API_URL}/api/batches/delete-bulk`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ ids }),
        });
      }
      setSelected(new Set());
      loadAll();
    } catch (e) {
      console.error(e);
    }
    setBulkBusy(false);
  };

  if (loading) return <LoadingSpinner label="Initializing systems..." />;

  const recent = batches.slice(0, 5);

  const containerVariants: any = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12 }
    }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } }
  };

  const stats = [
    {
      label: "Total Volume",
      sub: "Nodes Processed",
      value: batches.length,
      icon: Activity,
      iconClass: "text-gold-400",
      subClass: "text-gold-400/90",
      bar: "from-transparent via-gold-500/70 to-transparent",
      numberClass: "bg-gradient-to-b from-gold-300 via-gold-400 to-gold-600 bg-clip-text text-transparent",
    },
    {
      label: "Live Output",
      sub: "Active on Network",
      value: batches.filter(b => ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status)).length,
      icon: Globe,
      iconClass: "text-emerald-400",
      subClass: "text-emerald-400/90",
      bar: "from-transparent via-emerald-500/50 to-transparent",
      numberClass: "text-white",
    },
    {
      label: "Anomalies",
      sub: "Failed Transmissions",
      value: batches.filter(b => b.status === "FAILED").length,
      icon: AlertCircle,
      iconClass: "text-rose-400",
      subClass: "text-rose-400/90",
      bar: "from-transparent via-rose-500/50 to-transparent",
      numberClass: "text-white",
    },
  ];

  /* ——— Action Center data (all real, from /api/batches) ——— */
  const readyQueue = batches
    .filter((b) => b.status === "READY")
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const processingCount = batches.filter((b) => ["RECEIVED", "PROCESSING"].includes(b.status)).length;
  const approvedCount = batches.filter((b) => b.status === "APPROVED").length;
  const failedCount = batches.filter((b) => b.status === "FAILED").length;
  const publishedCount = batches.filter((b) => ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status)).length;
  const waitingValue = readyQueue.reduce((sum, b) => {
    const sv = b.extractedData?.selling_price_value;
    if (typeof sv === "number" && sv > 0) return sum + sv;
    const n = Number(String(b.extractedData?.price ?? "").replace(/[^\d]/g, ""));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const waReady = !!waStatus?.isReady;

  const thumbFor = (batch: any) => {
    const isVid = (m: any) => m?.mimeType?.startsWith("video/") || m?.originalUrl?.endsWith(".mp4") || m?.localPath?.endsWith(".mp4");
    const m = batch.mediaAssets?.find((x: any) => !isVid(x)) || batch.mediaAssets?.[0];
    return {
      src: m?.originalUrl || (m?.localPath ? `${API_URL}/${m.localPath}` : null),
      isVideo: isVid(m),
    };
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="relative max-w-6xl mx-auto"
    >
      <div className="relative space-y-10">
        {/* ——— System Status ——— */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="glass-card group relative flex h-full flex-col justify-between p-6">
              <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${s.bar} opacity-70`} />
              <div className="relative z-10 mb-8 flex items-center justify-between">
                <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">{s.label}</span>
                <s.icon className={`w-5 h-5 ${s.iconClass}`} />
              </div>
              <div className="relative z-10">
                <div className={`text-6xl font-heading font-bold ${s.numberClass}`}>
                  <CountUp value={s.value} />
                </div>
                <div className={`text-sm mt-2 font-medium ${s.subClass}`}>{s.sub}</div>
              </div>
            </div>
          ))}
        </motion.div>

                {/* ——— Action Center: Review Queue ——— */}
        <motion.div
          variants={itemVariants}
          className="glass-panel relative overflow-hidden rounded-3xl p-8"
        >
          <div className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-heading font-bold text-white">Needs Your Review</h2>
              <p className="text-slate-400 text-sm mt-1">
                Products extracted from your WhatsApp sources, waiting for your decision.
                {waitingValue > 0 && (
                  <span className="text-gold-300 font-semibold"> ≈ Rs. {waitingValue.toLocaleString()} in this queue at your selling prices.</span>
                )}
              </p>
            </div>
            {readyQueue.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300 text-xs font-semibold tracking-widest uppercase">
                <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
                {readyQueue.length} waiting
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold tracking-widest uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Queue clear
              </div>
            )}
          </div>

          {/* Health alerts — only shown when something is actually wrong */}
          {!waReady && (
            <div className="relative z-10 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
              <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />
              <p className="text-sm text-amber-200 flex-1 min-w-[220px]">
                <span className="font-bold">WhatsApp is disconnected.</span> New products can&apos;t arrive until you reconnect.
              </p>
              <Link href="/settings" className="text-xs font-bold uppercase tracking-wider text-amber-300 border border-amber-500/40 rounded-full px-3 py-1.5 hover:bg-amber-500/10 transition-colors">
                Reconnect
              </Link>
            </div>
          )}
          {failedCount > 0 && (
            <div className="relative z-10 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/[0.08] px-4 py-3">
              <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
              <p className="text-sm text-rose-200 flex-1 min-w-[220px]">
                <span className="font-bold">{failedCount} ingestion{failedCount > 1 ? "s" : ""} failed</span> and need attention.
              </p>
              <Link href="/products" className="text-xs font-bold uppercase tracking-wider text-rose-300 border border-rose-500/40 rounded-full px-3 py-1.5 hover:bg-rose-500/10 transition-colors">
                View
              </Link>
            </div>
          )}

          {/* The queue itself — oldest first, they've waited longest */}
          {readyQueue.length === 0 ? (
            <div className="relative z-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-heading font-bold">All clear — nothing waiting for review.</p>
              <p className="text-slate-400 text-sm mt-1">
                {waReady
                  ? "New supplier posts will land here automatically as they arrive."
                  : "Reconnect WhatsApp and new supplier posts will land here automatically."}
              </p>
            </div>
          ) : (
            <>
            {/* Selection + bulk actions */}
            <div className="relative z-10 mb-3 flex flex-wrap items-center gap-3 px-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={readyQueue.slice(0, 5).every((b) => selected.has(b.id))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(readyQueue.slice(0, 5).map((b) => b.id))
                        : new Set()
                    )
                  }
                  className="w-4 h-4 accent-amber-400 cursor-pointer"
                />
                Select all
              </label>
              {selected.size > 0 && (
                <>
                  <span className="text-xs font-bold text-gold-300">{selected.size} selected</span>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <button
                      onClick={() => runBulk("approve")}
                      disabled={bulkBusy}
                      className="text-xs font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/40 rounded-full px-3.5 py-1.5 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => runBulk("publish")}
                      disabled={bulkBusy}
                      className="text-xs font-bold uppercase tracking-wider text-gold-300 border border-gold-500/40 rounded-full px-3.5 py-1.5 hover:bg-gold-500/10 transition-colors disabled:opacity-50"
                    >
                      Publish
                    </button>
                    <button
                      onClick={() => runBulk("delete")}
                      disabled={bulkBusy}
                      className="text-xs font-bold uppercase tracking-wider text-rose-300 border border-rose-500/40 rounded-full px-3.5 py-1.5 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setSelected(new Set())}
                      className="text-xs font-bold uppercase tracking-wider text-slate-400 border border-white/15 rounded-full px-3.5 py-1.5 hover:bg-white/5 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {bulkBusy && <span className="text-xs text-slate-400">Working…</span>}
                </>
              )}
            </div>
            <ul className="relative z-10 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              {readyQueue.slice(0, 5).map((batch: any) => {
                const t = thumbFor(batch);
                return (
                  <li key={batch.id} className="flex items-stretch">
                    <label className="flex items-center pl-4 pr-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(batch.id)}
                        onChange={() => toggleSelect(batch.id)}
                        className="w-4 h-4 accent-amber-400 cursor-pointer"
                      />
                    </label>
                    <Link
                      href={`/products/${batch.id}`}
                      className="group flex flex-1 items-center gap-4 px-4 py-3.5 hover:bg-white/[0.03] transition-colors min-w-0"
                    >
                      <div className="w-12 h-12 rounded-lg bg-graphite border border-white/10 overflow-hidden shrink-0 relative">
                        {t.src ? (
                          t.isVideo ? (
                            <video src={t.src} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                          ) : (
                            <Image src={t.src} alt="" fill unoptimized className="object-cover" />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Zap className="w-4 h-4 text-slate-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-bold text-slate-100 truncate group-hover:text-gold-300 transition-colors">
                          {batch.extractedData?.product_name || `Product [${batch.id.split("-")[0]}]`}
                        </p>
                        <div className="flex items-center gap-2.5 mt-0.5 text-xs text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> waiting {formatDistanceToNow(new Date(batch.createdAt))}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <span>{batch.mediaAssets?.length || 0} assets</span>
                        </div>
                      </div>
                      {(batch.extractedData?.selling_price || batch.extractedData?.price) && (
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-bold text-gold-300 bg-gold-500/10 border border-gold-500/25 rounded-full px-3 py-1 inline-block">
                            {batch.extractedData?.selling_price || batch.extractedData?.price}
                          </span>
                          {batch.extractedData?.selling_price && batch.extractedData?.price && (
                            <div className="text-[10px] text-slate-500 mt-1.5 font-mono">
                              <span className="line-through">{batch.extractedData.price}</span> supplier
                            </div>
                          )}
                        </div>
                      )}
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            </>
          )}

          {/* Slim real pipeline summary */}
          <div className="relative z-10 mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-500">
            <span>Received <span className="text-slate-300 font-bold">{batches.length}</span></span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>Processing now <span className="text-slate-300 font-bold">{processingCount}</span></span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>Approved, to publish <span className="text-slate-300 font-bold">{approvedCount}</span></span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>Published <span className="text-emerald-300 font-bold">{publishedCount}</span></span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>WhatsApp <span className={waReady ? "text-emerald-300 font-bold" : "text-amber-300 font-bold"}>{waReady ? "Connected" : "Disconnected"}</span></span>
            <span className="ml-auto normal-case tracking-normal">Refreshes every 30s</span>
          </div>
        </motion.div>

{/* ——— Recent Activity ——— */}
        <motion.div variants={itemVariants} className="glass-card overflow-hidden">
          <div className="px-6 py-6 border-b border-graphite-border flex justify-between items-center bg-white/[0.02]">
            <h2 className="text-xl font-heading font-bold text-white">Recent Ingestions</h2>
            <Link href="/products" className="text-sm font-semibold text-gold-400 hover:text-gold-300 transition-colors flex items-center gap-2">
              View Matrix <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-graphite border border-graphite-border flex items-center justify-center shadow-lg shadow-black/50">
                <Database className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-lg text-white font-heading font-bold mb-2">No Data Streams Active</p>
              <p className="text-slate-400">Connect a WhatsApp source to begin data ingestion.</p>
            </div>
          ) : (
            <ul className="divide-y divide-graphite-border">
              {recent.map((batch: any, i: number) => (
                <motion.li
                  key={batch.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="group"
                >
                  <Link
                    href={`/products/${batch.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-5 hover:bg-white/[0.02] transition-all duration-300 relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-gold-400 to-gold-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                    {(() => {
                      const isVid = (m: any) => m?.mimeType?.startsWith('video/') || m?.originalUrl?.endsWith('.mp4') || m?.localPath?.endsWith('.mp4');
                      const thumbMedia = batch.mediaAssets?.find((m: any) => !isVid(m)) || batch.mediaAssets?.[0];
                      const mediaSrc = thumbMedia?.originalUrl || (thumbMedia?.localPath ? `${API_URL}/${thumbMedia.localPath}` : null);
                      const isVideo = isVid(thumbMedia);

                      return (
                        <div className="w-14 h-14 rounded-xl bg-graphite border border-white/10 overflow-hidden shrink-0 relative shadow-[0_14px_28px_-10px_rgba(0,0,0,0.9)] ring-1 ring-white/5 group-hover:scale-[1.04] transition-transform duration-500">
                          {mediaSrc ? (
                            isVideo ? (
                              <div className="w-full h-full relative">
                                <video
                                  src={mediaSrc}
                                  className="w-full h-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                />
                                <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 text-[9px] text-white font-mono">
                                  MP4
                                </div>
                              </div>
                            ) : (
                              <Image
                                src={mediaSrc}
                                alt=""
                                fill
                                unoptimized
                                className="object-cover group-hover:scale-110 transition-transform duration-700"
                              />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Zap className="w-5 h-5 text-slate-500" />
                            </div>
                          )}
                          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl pointer-events-none" />
                        </div>
                      );
                    })()}

                    <div className="flex-1 min-w-0">
                      <p className="font-heading text-lg font-bold text-slate-200 group-hover:text-gold-300 transition-colors truncate">
                        {batch.extractedData?.product_name || `Stream Node [${batch.id.split('-')[0]}]`}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 font-mono">
                        <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-brand-400" /> {batch.mediaAssets?.length || 0} Assets</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        <span>{formatDistanceToNow(new Date(batch.createdAt))} ago</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-4">
                      <StatusBadge status={batch.status} />
                      <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-white transition-colors group-hover:translate-x-1 duration-300" />
                    </div>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
