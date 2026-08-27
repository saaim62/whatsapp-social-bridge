"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Layers, Clock3, CheckCircle2, ImageIcon, Trash2, Loader2 } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function ProductsPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const fetchBatches = () => {
      fetchWithAuth(`${API_URL}/api/batches`)
        .then((res) => res.json())
        .then((data) => {
          setBatches(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchBatches();
    const interval = setInterval(fetchBatches, 5000);
    return () => clearInterval(interval);
  }, []);

  const deleteBatch = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000); // auto reset after 3s
      return;
    }
    
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/${id}/delete`, {
        method: 'POST',
      });
      if (res.ok) {
        setBatches(batches => batches.filter(b => b.id !== id));
      } else {
        alert('Failed to delete product');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete product');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  if (loading) return <LoadingSpinner label="Loading products..." />;

  const total = batches.length;
  const pending = batches.filter((b) => b.status === "READY").length;
  const published = batches.filter((b) =>
    ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status),
  ).length;

  return (
    <div>
      <PageHeader
        title="Product Catalog"
        description="All WhatsApp product batches — review, edit captions, and publish to social media."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard
          title="Total Batches"
          value={total}
          icon={Layers}
          gradient="bg-brand-500"
          iconBg="bg-gradient-to-br from-brand-500 to-brand-600"
        />
        <StatCard
          title="Awaiting Review"
          value={pending}
          icon={Clock3}
          gradient="bg-amber-500"
          iconBg="bg-gradient-to-br from-amber-500 to-amber-600"
          delay={0.08}
        />
        <StatCard
          title="Published"
          value={published}
          icon={CheckCircle2}
          gradient="bg-emerald-500"
          iconBg="bg-gradient-to-br from-emerald-500 to-emerald-600"
          delay={0.16}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="glass-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {["Media", "Product", "Status", "Sender", "Received", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {batches.map((batch, i) => (
                <motion.tr
                  key={batch.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.03 }}
                  className="hover:bg-brand-50/20 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200/80 shadow-sm bg-slate-50 relative group-hover:shadow-md transition-shadow">
                      {batch.mediaAssets?.some((m: any) => m.isProcessing) && (
                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                          <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
                        </div>
                      )}
                      {batch.mediaAssets?.[0]?.localPath ? (
                        batch.mediaAssets[0].mimeType?.startsWith("video/") ? (
                          <video
                            src={`${API_URL}/${batch.mediaAssets[0].localPath}`}
                            className="w-full h-full object-cover"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                        ) : (
                          <img
                            src={`${API_URL}/${batch.mediaAssets[0].localPath}?t=${Date.now()}`}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-slate-300" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">
                      {batch.extractedData?.product_name || "Processing..."}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {batch.extractedData?.price || "—"}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-700">
                    {batch.senderName ||
                      batch.senderId?.split("@")[0] ||
                      "Unknown"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {formatDistanceToNow(new Date(batch.createdAt))} ago
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => deleteBatch(batch.id)}
                        className={`p-2 transition-all flex items-center gap-1 rounded-md ${
                          confirmDeleteId === batch.id
                            ? "bg-red-500 text-white hover:bg-red-600 shadow-sm"
                            : "text-slate-400 hover:text-red-500 hover:bg-slate-100"
                        }`}
                        title={confirmDeleteId === batch.id ? "Click again to confirm" : "Delete batch"}
                      >
                        {confirmDeleteId === batch.id && <span className="text-xs font-bold pl-1">Confirm</span>}
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link
                        href={`/products/${batch.id}`}
                        className="btn-gradient !py-2 !px-4 !text-xs"
                      >
                        Review
                      </Link>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="font-medium text-slate-600">No products yet</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Send a WhatsApp message to your linked device.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
