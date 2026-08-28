"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Layers, Clock3, CheckCircle2, ImageIcon, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useNotifications } from "@/contexts/NotificationContext";

export default function ProductsPage() {
  const { batches, setBatches, loadingBatches: loading } = useNotifications();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New states for Bulk Delete, Search, and Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isPublishingBulk, setIsPublishingBulk] = useState(false);

  const deleteBatch = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/${id}/delete`, {
        method: 'POST',
      });
      if (res.ok) {
        setBatches(batches => batches.filter(b => b.id !== id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
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

  const deleteSelectedBatches = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} product(s)?`)) return;

    setIsDeletingBulk(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/delete-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setBatches(batches => batches.filter(b => !selectedIds.has(b.id)));
        setSelectedIds(new Set());
      } else {
        alert('Failed to delete products');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete products');
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const publishSelectedBatches = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to publish ${selectedIds.size} product(s)? They will be queued and published 1 minute apart.`)) return;

    setIsPublishingBulk(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/publish-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        alert(`${selectedIds.size} product(s) added to the publishing queue!`);
        setSelectedIds(new Set());
      } else {
        alert('Failed to queue products for publishing');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to queue products');
    } finally {
      setIsPublishingBulk(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading products..." />;

  const total = batches.length;
  const pending = batches.filter((b) => b.status === "READY").length;
  const published = batches.filter((b) =>
    ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status),
  ).length;

  // Filter batches based on search query
  const filteredBatches = batches.filter(b => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    const productName = (b.extractedData?.product_name || "").toLowerCase();
    const price = (b.extractedData?.price || "").toLowerCase();
    const brand = (b.extractedData?.brand || "").toLowerCase();
    const sender = (b.senderName || b.senderId || "").toLowerCase();
    
    return productName.includes(lowerQuery) || price.includes(lowerQuery) || brand.includes(lowerQuery) || sender.includes(lowerQuery);
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredBatches.length / itemsPerPage) || 1;
  const paginatedBatches = filteredBatches.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedBatches.length && paginatedBatches.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedBatches.map(b => b.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Product Catalog"
        description="All WhatsApp product batches — review, edit captions, and publish to social media."
      />

      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl mb-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-600" />
        <div>
          <h4 className="font-bold text-sm">Storage Notice</h4>
          <p className="text-sm mt-0.5 text-yellow-700">To save storage, all products are automatically removed 14 days after they are created.</p>
        </div>
      </div>

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
        {/* Toolbar: Search & Bulk Actions */}
        <div className="p-4 sm:p-5 border-b border-slate-100/50 bg-white/50 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by product name, price, brand, or sender..."
              className="w-full bg-white/80 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/50 transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // reset pagination on search
              }}
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                {selectedIds.size} selected
              </span>
              <button
                onClick={deleteSelectedBatches}
                disabled={isDeletingBulk}
                className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="text-sm">Delete Selected</span>
              </button>
              <button
                onClick={publishSelectedBatches}
                disabled={isPublishingBulk}
                className="flex items-center gap-1.5 bg-brand-600 text-white hover:bg-brand-700 font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isPublishingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                <span className="text-sm">Publish Selected</span>
              </button>
            </div>
          )}
        </div>

        {/* MOBILE CARD VIEW */}
        <div className="md:hidden flex flex-col divide-y divide-slate-100">
          {/* Mobile Select All */}
          {paginatedBatches.length > 0 && (
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-3">
              <input 
                type="checkbox" 
                checked={selectedIds.size > 0 && selectedIds.size === paginatedBatches.length}
                onChange={toggleSelectAll}
                className="w-5 h-5 rounded text-brand-600 border-slate-300 focus:ring-brand-500"
              />
              <span className="text-sm font-semibold text-slate-600">Select All on Page</span>
            </div>
          )}
          {paginatedBatches.map((batch, i) => (
            <motion.div
              key={batch.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.03 }}
              className={`p-4 sm:p-5 flex flex-col gap-4 transition-colors ${selectedIds.has(batch.id) ? 'bg-brand-50/30' : ''}`}
            >
              <div className="flex gap-4">
                {/* Mobile Checkbox */}
                <div className="pt-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(batch.id)}
                    onChange={() => toggleSelect(batch.id)}
                    className="w-5 h-5 rounded text-brand-600 border-slate-300 focus:ring-brand-500"
                  />
                </div>
                {/* Media Thumbnail */}
                <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200/80 shadow-sm bg-slate-50 relative flex-shrink-0">
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
                        muted loop autoPlay playsInline
                      />
                    ) : (
                      <img
                        src={`${API_URL}/${batch.mediaAssets[0].localPath}?t=${Date.now()}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="font-bold text-slate-900 line-clamp-1">
                    {batch.extractedData?.product_name || "Processing..."}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5 mb-2">
                    {batch.extractedData?.price || "—"}
                  </p>
                  <div>
                    <StatusBadge status={batch.status} />
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                <span className="truncate pr-2">
                  From: {batch.senderName || batch.senderId?.split("@")[0] || "Unknown"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap">
                    {formatDistanceToNow(new Date(batch.createdAt))} ago
                  </span>
                  <span className="text-yellow-700 font-bold bg-yellow-100 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                    {Math.max(0, 14 - Math.floor((new Date().getTime() - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24)))}d left
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => deleteBatch(batch.id)}
                  className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold transition-colors ${
                    confirmDeleteId === batch.id
                      ? "bg-red-500 text-white"
                      : "bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
                >
                  {confirmDeleteId === batch.id ? "Confirm" : "Delete"}
                </button>
                <Link
                  href={`/products/${batch.id}`}
                  className="flex-[2] btn-gradient text-center py-2.5 px-3 text-sm font-bold rounded-lg shadow-sm"
                >
                  Review Product
                </Link>
              </div>
            </motion.div>
          ))}
          {batches.length === 0 && (
            <div className="p-12 text-center">
              <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="font-medium text-slate-600">No products yet</p>
              <p className="text-xs text-slate-400 mt-1">Send a WhatsApp message.</p>
            </div>
          )}
        </div>

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 w-12 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === paginatedBatches.length}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded text-brand-600 border-slate-300 focus:ring-brand-500"
                  />
                </th>
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
              {paginatedBatches.map((batch, i) => (
                <motion.tr
                  key={batch.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.03 }}
                  className={`hover:bg-brand-50/20 transition-colors group ${selectedIds.has(batch.id) ? 'bg-brand-50/10' : ''}`}
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(batch.id)}
                      onChange={() => toggleSelect(batch.id)}
                      className="w-5 h-5 rounded text-brand-600 border-slate-300 focus:ring-brand-500"
                    />
                  </td>
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
                    <p className="font-bold text-slate-900 line-clamp-1">
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
                    <div>{formatDistanceToNow(new Date(batch.createdAt))} ago</div>
                    <div className="text-yellow-700 font-bold text-xs mt-1 bg-yellow-100 inline-block px-1.5 py-0.5 rounded-md">
                      Expires in {Math.max(0, 14 - Math.floor((new Date().getTime() - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24)))} days
                    </div>
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
              {paginatedBatches.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="font-medium text-slate-600">No products found</p>
                    <p className="text-sm text-slate-400 mt-1">
                      {searchQuery ? "Try adjusting your search filter." : "Send a WhatsApp message to your linked device."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        {filteredBatches.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-100/50 bg-slate-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 font-medium">Rows per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/50"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-1 text-sm text-slate-600 font-medium">
              <span className="hidden sm:inline">Page</span> {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
