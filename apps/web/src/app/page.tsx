"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Zap,
  ArrowRight,
  Database,
  Globe,
  Camera,
  Share2,
  MessageCircle,
  Activity,
  AlertCircle
} from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";

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
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-6xl mx-auto space-y-8"
    >
      
      {/* System Status HUD */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-electric-cyan-dim rounded-full blur-[50px] group-hover:bg-electric-cyan/20 transition-colors" />
          <div className="flex items-center justify-between mb-8 relative z-10">
            <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">Total Volume</span>
            <Activity className="w-5 h-5 text-electric-cyan" />
          </div>
          <div className="relative z-10">
            <div className="text-5xl font-heading font-bold text-white">{batches.length}</div>
            <div className="text-sm text-electric-cyan mt-2 font-medium">Nodes Processed</div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-electric-emerald-dim rounded-full blur-[50px] group-hover:bg-electric-emerald/20 transition-colors" />
          <div className="flex items-center justify-between mb-8 relative z-10">
            <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">Live Output</span>
            <Globe className="w-5 h-5 text-electric-emerald" />
          </div>
          <div className="relative z-10">
            <div className="text-5xl font-heading font-bold text-white">
              {batches.filter(b => ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status)).length}
            </div>
            <div className="text-sm text-electric-emerald mt-2 font-medium">Active on Network</div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-electric-magenta-dim rounded-full blur-[50px] group-hover:bg-electric-magenta/20 transition-colors" />
          <div className="flex items-center justify-between mb-8 relative z-10">
            <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">Anomalies</span>
            <AlertCircle className="w-5 h-5 text-electric-magenta" />
          </div>
          <div className="relative z-10">
            <div className="text-5xl font-heading font-bold text-white">
              {batches.filter(b => b.status === "FAILED").length}
            </div>
            <div className="text-sm text-electric-magenta mt-2 font-medium">Failed Transmissions</div>
          </div>
        </div>
      </motion.div>

      {/* Interactive Automation Visualizer */}
      <motion.div variants={itemVariants} className="glass-panel rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
        
        <div className="flex items-center justify-between mb-10 relative z-10">
          <div>
            <h2 className="text-2xl font-heading font-bold text-white">Live Data Stream</h2>
            <p className="text-slate-400 text-sm mt-1">Monitoring active commerce pipelines across all nodes</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-electric-cyan-dim border border-electric-cyan/30 text-electric-cyan text-xs font-bold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse-cyan" />
            Active
          </div>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4 py-8">
          {[
            { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-[#25D366]", bg: "bg-[#25D366]/10", border: "border-[#25D366]/30" },
            { id: "db", label: "Commerce Hub", icon: Database, color: "text-brand-400", bg: "bg-brand-500/10", border: "border-brand-500/30" },
            { id: "web", label: "Web Storefront", icon: Globe, color: "text-electric-cyan", bg: "bg-electric-cyan-dim", border: "border-electric-cyan/30" },
            { id: "social", label: "Meta Network", icon: Camera, color: "text-electric-magenta", bg: "bg-electric-magenta-dim", border: "border-electric-magenta/30" },
          ].map((node, i, arr) => (
            <div key={node.id} className="flex items-center gap-4 w-full md:w-auto">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className={`flex flex-col items-center justify-center p-6 w-32 h-32 rounded-2xl border ${node.border} ${node.bg} backdrop-blur-md relative`}
              >
                {/* Active node pulse */}
                <div className={`absolute inset-0 rounded-2xl border-2 border-white/0 ${i === 1 ? 'animate-pulse-cyan' : ''}`} />
                <node.icon className={`w-8 h-8 mb-3 ${node.color}`} />
                <span className="text-xs font-bold text-white text-center uppercase tracking-wider">{node.label}</span>
              </motion.div>

              {i < arr.length - 1 && (
                <div className="hidden md:flex flex-1 min-w-[60px] h-0.5 bg-graphite-border relative overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-electric-cyan to-transparent"
                    animate={{ x: ["-100%", "300%"] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear", delay: i * 0.2 }}
                  />
                </div>
              )}
              {i < arr.length - 1 && (
                <div className="md:hidden flex h-10 w-0.5 bg-graphite-border my-2 relative overflow-hidden">
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

      {/* Recent Activity Matrix */}
      <motion.div variants={itemVariants} className="glass-card">
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
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-electric-cyan opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="w-14 h-14 rounded-xl bg-graphite border border-graphite-border overflow-hidden shrink-0 relative">
                    {batch.mediaAssets?.[0]?.localPath ? (
                      <img
                        src={`${API_URL}/${batch.mediaAssets[0].localPath}`}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Zap className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl" />
                  </div>
                  
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
    </motion.div>
  );
}
