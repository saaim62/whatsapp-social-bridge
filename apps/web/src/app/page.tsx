"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox,
  Sparkles,
  Send,
  AlertTriangle,
  ArrowRight,
  ImageIcon,
} from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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

  if (loading) return <LoadingSpinner label="Loading dashboard..." />;

  const total = batches.length;
  const processed = batches.filter(
    (b) => !["RECEIVED", "PROCESSING"].includes(b.status),
  ).length;
  const published = batches.filter((b) =>
    ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status),
  ).length;
  const failed = batches.filter((b) => b.status === "FAILED").length;
  const recent = batches.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Real-time metrics for your WhatsApp-to-social automation pipeline."
      />

      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl mb-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-600" />
        <div>
          <h4 className="font-bold text-sm">Storage Notice</h4>
          <p className="text-sm mt-0.5 text-yellow-700">To save storage, all products are automatically removed 14 days after they are created.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
        <StatCard
          title="Received"
          value={total}
          icon={Inbox}
          gradient="bg-brand-500"
          iconBg="bg-gradient-to-br from-brand-500 to-brand-600"
          delay={0}
        />
        <StatCard
          title="Processed"
          value={processed}
          icon={Sparkles}
          gradient="bg-violet-500"
          iconBg="bg-gradient-to-br from-violet-500 to-violet-600"
          delay={0.08}
        />
        <StatCard
          title="Published"
          value={published}
          icon={Send}
          gradient="bg-emerald-500"
          iconBg="bg-gradient-to-br from-emerald-500 to-emerald-600"
          delay={0.16}
        />
        <StatCard
          title="Failed"
          value={failed}
          icon={AlertTriangle}
          gradient="bg-rose-500"
          iconBg="bg-gradient-to-br from-rose-500 to-rose-600"
          delay={0.24}
        />
      </div>

      {/* Pipeline visual */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="glass-card p-6 mb-10"
      >
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
          Pipeline Flow
        </h3>
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
          {[
            { label: "WhatsApp", color: "from-[#25D366] to-[#128C7E]" },
            { label: "AI Extract", color: "from-brand-500 to-violet-500" },
            { label: "Review", color: "from-amber-400 to-orange-500" },
            { label: "Publish", color: "from-pink-500 to-rose-500" },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-2 flex-1 min-w-[100px]">
              <div
                className={`flex-1 h-2 rounded-full bg-gradient-to-r ${step.color} opacity-80`}
                style={{ animationDelay: `${i * 0.2}s` }}
              />
              <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                {step.label}
              </span>
              {i < 3 && (
                <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Recent products */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="glass-card overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Recent Products</h3>
          <Link
            href="/products"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Inbox className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-600 font-medium">No products yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Link WhatsApp to start receiving product drops.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((batch: any, i: number) => (
              <motion.li
                key={batch.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.05 }}
              >
                <Link
                  href={`/products/${batch.id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-brand-50/30 transition-colors duration-200 group"
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    {batch.mediaAssets?.[0]?.localPath ? (
                      <img
                        src={`${API_URL}/${batch.mediaAssets[0].localPath}`}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
                      {batch.extractedData?.product_name ||
                        `Product from ${batch.senderName || "WhatsApp"}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {batch.senderName || "Direct"} ·{" "}
                      {batch.mediaAssets?.length || 0} media ·{" "}
                      {formatDistanceToNow(new Date(batch.createdAt))} ago
                      <span className="text-yellow-700 font-bold ml-2 bg-yellow-100 px-1.5 py-0.5 rounded-md">
                        Expires in {Math.max(0, 14 - Math.floor((new Date().getTime() - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24)))} days
                      </span>
                    </p>
                  </div>
                  </div>
                  <div className="sm:flex-shrink-0">
                    <StatusBadge status={batch.status} />
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
