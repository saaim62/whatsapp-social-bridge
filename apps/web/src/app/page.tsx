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
  Camera,
  MessageCircle,
  Activity,
  AlertCircle
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/batches`)
      .then((res) => res.json())
      .then((data) => {
        setBatches(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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

  const pipeline = [
    {
      id: "whatsapp", label: "WhatsApp", desc: `${batches.length} Received`,
      icon: MessageCircle, color: "text-[#4be07f]", bg: "bg-[#25D366]/[0.07]", border: "border-white/[0.09]",
      active: batches.length > 0,
    },
    {
      id: "db", label: "Commerce Hub", desc: `${batches.filter(b => b.extractedData).length} Processed`,
      icon: Database, color: "text-gold-400", bg: "bg-gold-500/[0.07]", border: "border-white/[0.09]",
      active: batches.some(b => b.status === 'RECEIVED'),
    },
    {
      id: "web", label: "Pending Review", desc: `${batches.filter(b => b.status === 'READY').length} Awaiting`,
      icon: Globe, color: "text-slate-200", bg: "bg-white/[0.04]", border: "border-white/[0.09]",
      active: batches.some(b => b.status === 'READY'),
    },
    {
      id: "social", label: "Meta Network", desc: `${batches.filter(b => ['PUBLISHED', 'PARTIALLY_PUBLISHED'].includes(b.status)).length} Published`,
      icon: Camera, color: "text-[#7db4f0]", bg: "bg-[#0082FB]/[0.07]", border: "border-white/[0.09]",
      active: batches.some(b => b.status === 'PUBLISHING'),
    },
  ];

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

        {/* ——— Pipeline ——— */}
        <motion.div
          variants={itemVariants}
          className="glass-panel relative overflow-hidden rounded-3xl p-8"
        >
          <div className="relative z-10 mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold text-white">Live Data Stream</h2>
              <p className="text-slate-400 text-sm mt-1">Monitoring active commerce pipelines across all nodes</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.09] text-slate-200 text-xs font-semibold tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Active
            </div>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 px-2 pb-4 pt-8">
            {pipeline.map((node, i, arr) => (
              <div key={node.id} className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                <div
                  className={`relative flex h-36 w-full md:w-40 flex-col items-center justify-center rounded-2xl border p-4 sm:p-6 backdrop-blur-xl shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)] ${node.border} ${node.bg}`}
                >
                  <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  {node.active && (
                    <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  <node.icon className={`w-9 h-9 mb-2 ${node.color}`} />
                  <span className="text-xs font-bold text-white text-center uppercase tracking-wider">{node.label}</span>
                  <span className={`text-[10px] font-bold mt-1.5 text-center ${node.color} bg-black/30 px-2 py-0.5 rounded-full`}>{node.desc}</span>
                </div>

                {i < arr.length - 1 && (
                  <div className="hidden md:block flex-1 min-w-[40px] lg:min-w-[64px] h-px bg-white/[0.12] relative overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-gold-400/80 to-transparent"
                      animate={{ x: ["-100%", "300%"] }}
                      transition={{ repeat: Infinity, duration: 2.6, ease: "linear", delay: i * 0.35 }}
                    />
                  </div>
                )}
                {i < arr.length - 1 && (
                  <div className="md:hidden flex h-10 w-px bg-white/[0.12] relative overflow-hidden">
                    <motion.div
                      className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-gold-400/80 to-transparent"
                      animate={{ y: ["-100%", "300%"] }}
                      transition={{ repeat: Infinity, duration: 2.6, ease: "linear", delay: i * 0.35 }}
                    />
                  </div>
                )}
              </div>
            ))}
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
