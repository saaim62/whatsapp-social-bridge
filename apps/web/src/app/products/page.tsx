"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Layers, Clock3, CheckCircle2, ImageIcon, Trash2, Loader2, AlertCircle, Search, Filter, Send } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useNotifications } from "@/contexts/NotificationContext";

export default function ProductsPage() {
  const router = useRouter();
  const { batches, setBatches, loadingBatches: loading } = useNotifications();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isPublishingBulk, setIsPublishingBulk] = useState(false);
  const [isClearingAI, setIsClearingAI] = useState(false);

  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [targetEmailsInput, setTargetEmailsInput] = useState("");
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const history = localStorage.getItem("sentEmailsHistory");
    if (history) setEmailHistory(JSON.parse(history));
  }, []);

  const clearSelectedBatchesAI = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm("Are you sure you want to clear AI content for these selected batches?")) return;
    setIsClearingAI(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/clear-ai-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setBatches(batches => batches.map(b => {
          if (selectedIds.has(b.id)) {
            return { ...b, extractedData: null, generatedContent: null };
          }
          return b;
        }));
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsClearingAI(false);
    }
  };

  const openSendModal = () => {
    setTargetEmailsInput("");
    setIsSendModalOpen(true);
  };

  const handleSendToUser = async () => {
    const emails = targetEmailsInput.split(',').map(e => e.trim()).filter(e => e);
    if (emails.length === 0) return;
    setIsSending(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/send-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIds: Array.from(selectedIds), targetEmails: emails }),
      });
      if (res.ok) {
        setIsSendModalOpen(false);
        const newHistory = Array.from(new Set([...emails, ...emailHistory])).slice(0, 10);
        setEmailHistory(newHistory);
        localStorage.setItem("sentEmailsHistory", JSON.stringify(newHistory));
        alert("Products cloned and sent successfully!");
      } else {
        alert("Failed to send products. Ensure the emails belong to registered users.");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending products.");
    } finally {
      setIsSending(false);
    }
  };

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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const deleteSelectedBatches = async () => {
    if (selectedIds.size === 0) return;
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const publishSelectedBatches = async () => {
    if (selectedIds.size === 0) return;
    setIsPublishingBulk(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/publish-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPublishingBulk(false);
    }
  };

  if (loading) return <LoadingSpinner label="Initializing databanks..." />;

  const total = batches.length;
  const pending = batches.filter((b) => b.status === "READY").length;
  const published = batches.filter((b) =>
    ["PUBLISHED", "PARTIALLY_PUBLISHED"].includes(b.status),
  ).length;

  const filteredBatches = batches.filter(b => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    const productName = (b.extractedData?.product_name || "").toLowerCase();
    const price = (b.extractedData?.price || "").toLowerCase();
    const brand = (b.extractedData?.brand || "").toLowerCase();
    const sender = (b.senderName || b.senderId || "").toLowerCase();
    
    return productName.includes(lowerQuery) || price.includes(lowerQuery) || brand.includes(lowerQuery) || sender.includes(lowerQuery);
  });

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
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* HUD Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-white mb-2">Commerce Matrix</h1>
          <p className="text-slate-400">Manage all ingested product streams and orchestrate outbound syndication.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="glass-panel px-4 py-3 rounded-xl border border-electric-cyan/20 flex flex-col min-w-[120px]">
            <span className="text-xs font-bold text-electric-cyan uppercase tracking-wider mb-1">Pending</span>
            <span className="text-2xl font-heading font-bold text-white">{pending}</span>
          </div>
          <div className="glass-panel px-4 py-3 rounded-xl border border-electric-emerald/20 flex flex-col min-w-[120px]">
            <span className="text-xs font-bold text-electric-emerald uppercase tracking-wider mb-1">Live</span>
            <span className="text-2xl font-heading font-bold text-white">{published}</span>
          </div>
        </div>
      </div>

      {/* Main Command Area */}
      <div className="glass-card flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-graphite-border bg-graphite/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Query product network..."
              className="w-full bg-graphite-darker/50 border border-graphite-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-electric-cyan transition-colors"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3"
              >
                <span className="text-sm font-semibold text-electric-cyan bg-electric-cyan-dim px-3 py-1.5 rounded-lg border border-electric-cyan/20">
                  {selectedIds.size} nodes selected
                </span>
                <button
                  onClick={openSendModal}
                  className="btn-glass flex items-center gap-2 border-electric-cyan/30 hover:border-electric-cyan hover:bg-electric-cyan/10 text-electric-cyan"
                >
                  <Send className="w-4 h-4" />
                  <span className="text-sm">Send</span>
                </button>
                <button
                  onClick={clearSelectedBatchesAI}
                  disabled={isClearingAI}
                  className="btn-glass flex items-center gap-2 border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10 text-amber-400"
                >
                  {isClearingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  <span className="text-sm">Clear AI</span>
                </button>
                <button
                  onClick={deleteSelectedBatches}
                  disabled={isDeletingBulk}
                  className="btn-glass flex items-center gap-2 border-red-500/30 hover:border-red-500 hover:bg-red-500/10 text-red-400"
                >
                  {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span className="text-sm">Purge</span>
                </button>
                <button
                  onClick={publishSelectedBatches}
                  disabled={isPublishingBulk}
                  className="btn-glow flex items-center gap-2"
                >
                  {isPublishingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  <span className="text-sm">Execute Deploy</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Data Grid */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-graphite-border bg-graphite-darker/50">
                <th className="px-6 py-4 w-12">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === paginatedBatches.length}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded border-slate-600 bg-graphite-darker checked:bg-electric-cyan checked:border-electric-cyan focus:ring-electric-cyan focus:ring-offset-graphite transition-all"
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asset</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payload</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vector State</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source Node</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Telemetry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-border/50">
              {paginatedBatches.map((batch, i) => (
                <motion.tr
                  key={batch.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                  onClick={() => router.push(`/products/${batch.id}`)}
                  className={`group transition-colors cursor-pointer ${selectedIds.has(batch.id) ? 'bg-electric-cyan/5' : 'hover:bg-white/[0.02]'}`}
                >
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(batch.id)}
                      onChange={() => toggleSelect(batch.id)}
                      className="w-5 h-5 rounded border-slate-600 bg-graphite-darker checked:bg-electric-cyan checked:border-electric-cyan focus:ring-electric-cyan focus:ring-offset-graphite transition-all cursor-pointer"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-graphite-border bg-graphite-darker relative group-hover:border-electric-cyan/50 transition-colors">
                      {batch.mediaAssets?.some((m: any) => m.isProcessing) && (
                        <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                          <Loader2 className="w-5 h-5 text-electric-cyan animate-spin" />
                        </div>
                      )}
                      {batch.mediaAssets?.[0]?.localPath ? (
                        batch.mediaAssets[0].mimeType?.startsWith("video/") ? (
                          <video
                            src={`${API_URL}/${batch.mediaAssets[0].localPath}`}
                            className="w-full h-full object-cover"
                            muted loop playsInline preload="metadata"
                          />
                        ) : (
                          <Image
                            src={`${API_URL}/${batch.mediaAssets[0].localPath}`}
                            alt=""
                            fill
                            className="object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-slate-600" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-[200px]">
                    <p className="font-heading font-bold text-slate-200 truncate group-hover:text-electric-cyan transition-colors">
                      {batch.extractedData?.product_name || "Extracting payload..."}
                    </p>
                    <p className="text-sm font-mono text-electric-cyan mt-1">
                      {batch.extractedData?.price || "—"}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-6 py-4">
                     <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#25D366] shadow-[0_0_8px_#25D366]" />
                        {batch.senderName || batch.senderId?.split("@")[0] || "Unknown Node"}
                     </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-xs text-slate-400 font-mono">T-{formatDistanceToNow(new Date(batch.createdAt))}</div>
                      
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBatch(batch.id);
                          }}
                          className={`p-1.5 transition-all flex items-center rounded border ${
                            confirmDeleteId === batch.id
                              ? "bg-red-500 text-white border-red-500"
                              : "text-slate-500 border-transparent hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
                          }`}
                        >
                          {confirmDeleteId === batch.id && <span className="text-xs font-bold px-2">Confirm</span>}
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/products/${batch.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="btn-glass px-3 py-1.5 text-xs text-electric-cyan border-electric-cyan/30 hover:border-electric-cyan hover:bg-electric-cyan/10"
                        >
                          Inspect
                        </Link>
                      </div>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {paginatedBatches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-32 text-center">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-graphite border border-graphite-border flex items-center justify-center shadow-2xl relative overflow-hidden">
                       <div className="absolute inset-0 bg-electric-cyan/5 blur-xl" />
                       <Filter className="w-10 h-10 text-slate-600 relative z-10" />
                    </div>
                    <p className="text-xl font-heading font-bold text-white mb-2">No Active Streams</p>
                    <p className="text-slate-400">Adjust your telemetry filters or await incoming data.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        {filteredBatches.length > 0 && (
          <div className="p-4 border-t border-graphite-border bg-graphite/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Rows per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-graphite-darker border border-graphite-border text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-electric-cyan cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">Page {currentPage} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-graphite border border-graphite-border text-slate-300 hover:text-white hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                   &larr;
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-graphite border border-graphite-border text-slate-300 hover:text-white hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                   &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Send to User Modal */}
      <AnimatePresence>
        {isSendModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-graphite-darker border border-graphite-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6">
                <h3 className="text-xl font-heading font-bold text-white mb-2">Send to Users</h3>
                <p className="text-sm text-slate-400 mb-6">Enter the email addresses of the users you want to send {selectedIds.size} products to.</p>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={targetEmailsInput}
                    onChange={(e) => setTargetEmailsInput(e.target.value)}
                    placeholder="user1@example.com, user2@example.com"
                    className="w-full bg-graphite border border-graphite-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-electric-cyan"
                  />
                  {emailHistory.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Recent Contacts</p>
                      <div className="flex flex-wrap gap-2">
                        {emailHistory.map(email => (
                          <button
                            key={email}
                            onClick={() => {
                              const current = targetEmailsInput.split(',').map(e => e.trim()).filter(e => e);
                              if (!current.includes(email)) {
                                setTargetEmailsInput([...current, email].join(', '));
                              }
                            }}
                            className="px-2 py-1 rounded-md bg-graphite border border-graphite-border text-xs text-slate-300 hover:text-white hover:border-electric-cyan transition-colors"
                          >
                            {email}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button
                    onClick={() => setIsSendModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-graphite-border text-slate-300 font-bold hover:bg-graphite transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendToUser}
                    disabled={!targetEmailsInput.trim() || isSending}
                    className="flex-1 py-2.5 rounded-xl bg-electric-cyan text-graphite-darker font-bold hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {isSending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
