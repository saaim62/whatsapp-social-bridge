"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  animate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
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

/* 3D tilt card — tracks the cursor, tilts in perspective, with a moving glare. */
function Tilt({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [7, -7]), { stiffness: 260, damping: 22 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-9, 9]), { stiffness: 260, damping: 22 });
  const glareX = useTransform(mx, (v) => `${v * 100}%`);
  const glareY = useTransform(my, (v) => `${v * 100}%`);
  const glare = useTransform(
    [glareX, glareY],
    ([x, y]) =>
      `radial-gradient(420px circle at ${x} ${y}, rgba(255,255,255,0.09), transparent 65%)`
  );

  return (
    <div style={{ perspective: 1200 }} className={className}>
      <motion.div
        ref={ref}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onMouseMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r) return;
          mx.set((e.clientX - r.left) / r.width);
          my.set((e.clientY - r.top) / r.height);
        }}
        onMouseLeave={() => {
          mx.set(0.5);
          my.set(0.5);
        }}
        className="relative h-full"
      >
        {children}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit] z-20"
          style={{ background: glare }}
        />
      </motion.div>
    </div>
  );
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
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } }
  };

  const stats = [
    {
      label: "Total Volume",
      sub: "Nodes Processed",
      value: batches.length,
      icon: Activity,
      iconClass: "text-[#e8c15a]",
      subClass: "text-[#e8c15a]",
      glow: "bg-[#d9a521]/15 group-hover:bg-[#d9a521]/25",
      bar: "from-transparent via-[#d9a521] to-transparent",
      numberClass: "bg-gradient-to-b from-[#f7e08c] via-[#e8c15a] to-[#9a7414] bg-clip-text text-transparent drop-shadow-[0_2px_18px_rgba(217,165,33,0.35)]",
    },
    {
      label: "Live Output",
      sub: "Active on Network",
      value: batches.filter(b => ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status)).length,
      icon: Globe,
      iconClass: "text-electric-emerald",
      subClass: "text-electric-emerald",
      glow: "bg-electric-emerald-dim group-hover:bg-electric-emerald/20",
      bar: "from-transparent via-electric-emerald to-transparent",
      numberClass: "text-white drop-shadow-[0_2px_18px_rgba(52,255,170,0.25)]",
    },
    {
      label: "Anomalies",
      sub: "Failed Transmissions",
      value: batches.filter(b => b.status === "FAILED").length,
      icon: AlertCircle,
      iconClass: "text-electric-magenta",
      subClass: "text-electric-magenta",
      glow: "bg-electric-magenta-dim group-hover:bg-electric-magenta/20",
      bar: "from-transparent via-electric-magenta to-transparent",
      numberClass: "text-white drop-shadow-[0_2px_18px_rgba(255,52,180,0.25)]",
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="relative max-w-6xl mx-auto"
    >
      {/* ——— Cinematic scene backdrop ——— */}
      <div className="pointer-events-none absolute inset-0 -mx-6 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/4 w-[560px] h-[380px] rounded-full bg-[#d9a521]/[0.07] blur-[110px]" />
        <div className="absolute top-24 -right-24 w-[480px] h-[420px] rounded-full bg-electric-cyan/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[420px] h-[300px] rounded-full bg-electric-magenta/[0.05] blur-[110px]" />
        {/* perspective floor grid */}
        <div
          className="absolute -bottom-10 left-[-10%] right-[-10%] h-72 opacity-[0.13]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,197,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,197,255,0.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            transform: "perspective(700px) rotateX(63deg)",
            transformOrigin: "bottom",
            maskImage: "linear-gradient(to top, black 30%, transparent 92%)",
            WebkitMaskImage: "linear-gradient(to top, black 30%, transparent 92%)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(0,0,0,0.5)_100%)]" />
      </div>

      <div className="relative space-y-10">
        {/* ——— System Status HUD ——— */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((s) => (
            <Tilt key={s.label}>
              <div className="glass-card group relative flex h-full flex-col justify-between overflow-hidden p-6 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.85)]">
                <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${s.bar} opacity-70`} />
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] transition-colors ${s.glow}`} />
                <div className="relative z-10 mb-8 flex items-center justify-between" style={{ transform: "translateZ(34px)" }}>
                  <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">{s.label}</span>
                  <s.icon className={`w-5 h-5 ${s.iconClass}`} />
                </div>
                <div className="relative z-10" style={{ transform: "translateZ(22px)" }}>
                  <div className={`text-6xl font-heading font-bold ${s.numberClass}`}>
                    <CountUp value={s.value} />
                  </div>
                  <div className={`text-sm mt-2 font-medium ${s.subClass}`}>{s.sub}</div>
                </div>
              </div>
            </Tilt>
          ))}
        </motion.div>

        {/* ——— Interactive Automation Visualizer ——— */}
        <motion.div
          variants={itemVariants}
          className="glass-panel relative overflow-hidden rounded-3xl p-8 shadow-[0_36px_90px_-24px_rgba(0,0,0,0.9)]"
        >
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
          <div className="absolute -top-24 left-1/3 w-96 h-56 rounded-full bg-electric-cyan/[0.07] blur-[90px] pointer-events-none" />

          <div className="relative z-10 mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-heading font-bold text-white">Live Data Stream</h2>
              <p className="text-slate-400 text-sm mt-1">Monitoring active commerce pipelines across all nodes</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-electric-cyan-dim border border-electric-cyan/30 text-electric-cyan text-xs font-bold tracking-widest uppercase shadow-[0_0_24px_rgba(34,211,238,0.25)]">
              <span className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse-cyan" />
              Active
            </div>
          </div>

          <div
            className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4 px-2 pb-6 pt-10"
            style={{ perspective: 1400 }}
          >
            {[
              {
                id: "whatsapp", label: "WhatsApp", desc: `${batches.length} Received`,
                icon: MessageCircle, color: "text-[#25D366]", bg: "bg-[#25D366]/10", border: "border-[#25D366]/30",
                pulse: false
              },
              {
                id: "db", label: "Commerce Hub", desc: `${batches.filter(b => b.extractedData).length} Processed`,
                icon: Database, color: "text-brand-400", bg: "bg-brand-500/10", border: "border-brand-500/30",
                pulse: batches.some(b => b.status === 'RECEIVED')
              },
              {
                id: "web", label: "Pending Review", desc: `${batches.filter(b => b.status === 'READY').length} Awaiting`,
                icon: Globe, color: "text-electric-cyan", bg: "bg-electric-cyan-dim", border: "border-electric-cyan/30",
                pulse: batches.some(b => b.status === 'READY')
              },
              {
                id: "social", label: "Meta Network", desc: `${batches.filter(b => ['PUBLISHED', 'PARTIALLY_PUBLISHED'].includes(b.status)).length} Published`,
                icon: Camera, color: "text-electric-magenta", bg: "bg-electric-magenta-dim", border: "border-electric-magenta/30",
                pulse: batches.some(b => b.status === 'PUBLISHING')
              },
            ].map((node, i, arr) => (
              <div key={node.id} className="flex items-center gap-4 w-full md:w-auto" style={{ transformStyle: "preserve-3d" }}>
                <motion.div
                  animate={{ y: [0, -9, 0] }}
                  transition={{ repeat: Infinity, duration: 5 + i * 0.7, ease: "easeInOut", delay: i * 0.55 }}
                  className="relative"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* floor glow beneath the floating node */}
                  <div className="absolute -bottom-5 left-1/2 h-4 w-24 -translate-x-1/2 rounded-[100%] bg-black/70 blur-md" />
                  <motion.div
                    whileHover={{ scale: 1.06, rotateX: -6, rotateY: 8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`relative flex h-36 w-40 flex-col items-center justify-center rounded-2xl border p-4 sm:p-6 backdrop-blur-md shadow-[0_28px_50px_-16px_rgba(0,0,0,0.9)] ${node.border} ${node.bg}`}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                    {node.pulse && (
                      <div className="absolute inset-0 rounded-2xl border-2 border-white/0 animate-pulse-cyan" />
                    )}
                    <node.icon className={`w-9 h-9 mb-2 ${node.color}`} style={{ transform: "translateZ(26px)" } as any} />
                    <span className="text-xs font-bold text-white text-center uppercase tracking-wider">{node.label}</span>
                    <span className={`text-[10px] font-bold mt-1.5 text-center ${node.color} bg-black/30 px-2 py-0.5 rounded-full`}>{node.desc}</span>
                  </motion.div>
                </motion.div>

                {i < arr.length - 1 && (
                  <div className="hidden md:block flex-1 min-w-[40px] lg:min-w-[64px] h-[3px] rounded-full bg-graphite-border/70 relative overflow-hidden shadow-[0_0_12px_rgba(34,211,238,0.15)]">
                    <motion.div
                      className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-electric-cyan to-transparent"
                      animate={{ x: ["-100%", "300%"] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear", delay: i * 0.2 }}
                    />
                  </div>
                )}
                {i < arr.length - 1 && (
                  <div className="md:hidden flex h-10 w-[3px] rounded-full bg-graphite-border/70 my-2 relative overflow-hidden">
                    <motion.div
                      className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-electric-cyan to-transparent"
                      animate={{ y: ["-100%", "300%"] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear", delay: i * 0.2 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ——— Recent Activity Matrix ——— */}
        <motion.div variants={itemVariants} className="glass-card overflow-hidden shadow-[0_30px_70px_-22px_rgba(0,0,0,0.9)]">
          <div className="px-6 py-6 border-b border-graphite-border flex justify-between items-center bg-graphite/40">
            <h2 className="text-xl font-heading font-bold text-white">Recent Ingestions</h2>
            <Link href="/products" className="text-sm font-semibold text-electric-cyan hover:text-white transition-colors flex items-center gap-2">
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
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#d9a521] to-electric-cyan opacity-0 group-hover:opacity-100 transition-opacity" />

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
                      <p className="font-heading text-lg font-bold text-slate-200 group-hover:text-electric-cyan transition-colors truncate">
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
