"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  Sparkles,
  Tag,
  Image as ImageIcon,
  CheckCircle2,
  Save,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  XCircle,
  RotateCcw,
  CheckSquare,
  Square,
  Layers,
  Edit2,
  Search,
} from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ImageMaskModal } from "@/components/ui/ImageMaskModal";

export default function ProductDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [batch, setBatch] = useState<any>(null);
  const [mediaOrder, setMediaOrder] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteMediaId, setConfirmDeleteMediaId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [overridePrice, setOverridePrice] = useState("");
  const [editedInstagram, setEditedInstagram] = useState("");
  const [editedFacebook, setEditedFacebook] = useState("");
  const [editedStory, setEditedStory] = useState("");
  
  // Modal & Selection state
  const [isMaskModalOpen, setIsMaskModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishTargets, setPublishTargets] = useState<string[]>(['FACEBOOK', 'INSTAGRAM']);
  const [maskModalInitialIndex, setMaskModalInitialIndex] = useState(0);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [mediaTimestamps, setMediaTimestamps] = useState<Record<string, number>>({});
  const [revertingMediaId, setRevertingMediaId] = useState<string | null>(null);
  const [isBulkReverting, setIsBulkReverting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [batchesList, setBatchesList] = useState<any[]>([]);
  const [targetBatchId, setTargetBatchId] = useState("");
  const [moveSearchQuery, setMoveSearchQuery] = useState("");
  const [isMovingMedia, setIsMovingMedia] = useState(false);
  const [retainAIOnMove, setRetainAIOnMove] = useState(false);

  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [targetEmailsInput, setTargetEmailsInput] = useState("");
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");

  useEffect(() => {
    const history = localStorage.getItem("sentEmailsHistory");
    if (history) setEmailHistory(JSON.parse(history));
  }, []);
  
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10, // 10px movement required on desktop to start drag
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms hold to start drag (allows normal scrolling)
        tolerance: 8, // 8px tolerance to filter out natural finger jitter
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setMediaOrder((items) => {
          const oldIndex = items.findIndex((i) => i.id === active.id);
          const newIndex = items.findIndex((i) => i.id === over.id);

          const newOrder = arrayMove(items, oldIndex, newIndex);

          // Save to backend asynchronously
          fetchWithAuth(`${API_URL}/api/batches/${id}/media/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedMediaIds: newOrder.map((a) => a.id) }),
          }).catch((err) => console.error("Failed to reorder media", err));

          return newOrder;
        });
      }
    },
    [id]
  );
  
  const hasInitializedEdits = useRef(false);

  const applyPrice = (text: string) => {
    if (!text) return "";
    return text.replace(/\{\{PRICE\}\}/g, overridePrice || "");
  };

  const fetchBatchData = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/${id}`);
      if (res.ok) {
        const data = await res.json();
        
        // Auto-bust browser cache when media finishes processing
        setBatch((prev: any) => {
          if (prev?.mediaAssets) {
            const newTimestamps: Record<string, number> = {};
            for (const asset of data.mediaAssets || []) {
              const prevAsset = prev.mediaAssets.find((a: any) => a.id === asset.id);
              if (prevAsset?.isProcessing && !asset.isProcessing) {
                newTimestamps[asset.id] = Date.now();
              }
            }
            if (Object.keys(newTimestamps).length > 0) {
              setMediaTimestamps((ts) => ({ ...ts, ...newTimestamps }));
            }
          }
          return data;
        });
        
        setMediaOrder(prev => {
          // If the fetched assets match the current ones, keep current order (don't disrupt dragging)
          if (prev.length === data.mediaAssets.length && prev.every((p, i) => p.id === data.mediaAssets[i].id)) {
             // We can just update the underlying data objects but keep order
             return prev.map(p => data.mediaAssets.find((a: any) => a.id === p.id) || p);
          }
          // Otherwise initialize to the fetched order
          return data.mediaAssets || [];
        });
        
        if (!hasInitializedEdits.current) {
          if (data.generatedContent) {
            setEditedInstagram(data.generatedContent.instagramCaption || "");
            setEditedFacebook(data.generatedContent.facebookCaption || "");
            setEditedStory(data.generatedContent.storyText || "");
            hasInitializedEdits.current = true;
          }
          if (data.extractedData?.price) {
            setOverridePrice(data.extractedData.price);
          }
        }
        setLoading(false);
        return data;
      }
    } catch (err) {
      console.error("Failed to fetch batch data", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    fetchBatchData().then((data) => {
      if (data && data.status !== "PUBLISHED" && data.status !== "FAILED") {
        interval = setInterval(fetchBatchData, 3000);
      }
    });

    return () => clearInterval(interval);
  }, [fetchBatchData]);

  const openPublishModal = () => {
    setIsPublishModalOpen(true);
  };

  const approveAndPublish = async () => {
    setIsPublishModalOpen(false);
    setBatch((prev: any) => ({ ...prev, status: "PUBLISHING" }));
    try {
      if (batch.status === 'READY' || batch.status === 'FAILED' || batch.status === 'RECEIVED') {
        await fetchWithAuth(`${API_URL}/api/batches/${id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instagramCaption: applyPrice(editedInstagram),
            facebookCaption: applyPrice(editedFacebook),
            storyText: applyPrice(editedStory),
            targets: publishTargets
          }),
        });
      } else {
        // Just publish since it's already approved
        await fetchWithAuth(`${API_URL}/api/batches/${id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets: publishTargets }),
        });
      }
    } catch (e) {
      console.error(e);
      alert("Failed to queue publish job.");
    }
  };

  const handleImageUpdated = (mediaId: string) => {
    setMediaTimestamps((prev) => ({ ...prev, [mediaId]: Date.now() }));
    fetchBatchData();
  };

  const handleSingleRevert = async (mediaId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevertingMediaId(mediaId);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/revert`, {
        method: "POST",
      });
      if (res.ok) {
        handleImageUpdated(mediaId);
      } else {
        const errorData = await res.json().catch(() => null);
        alert(`Failed to revert: ${errorData?.message || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error reverting blur");
    } finally {
      setRevertingMediaId(null);
    }
  };

  const handleSingleDelete = async (mediaId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirmDeleteMediaId !== mediaId) {
      setConfirmDeleteMediaId(mediaId);
      setTimeout(() => setConfirmDeleteMediaId(null), 3000);
      return;
    }

    try {
      await fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/delete`, { method: "POST" });
      setBatch((prev: any) => ({
        ...prev,
        mediaAssets: prev.mediaAssets.filter((a: any) => a.id !== mediaId),
      }));
      setMediaOrder((prev) => prev.filter((a: any) => a.id !== mediaId));
      setSelectedMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      fetchBatchData();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteMediaId(null);
    }
  };

  const toggleSelectMedia = (mediaId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }
      return next;
    });
  };

  const isVideoAsset = (asset: any) => {
    if (asset.mimeType?.startsWith("video/")) return true;
    if (asset.localPath?.toLowerCase().match(/\.(mp4|mov|webm)$/)) return true;
    if (asset.originalUrl?.toLowerCase().match(/\.(mp4|mov|webm)$/)) return true;
    return false;
  };

  const imageAssets = (batch?.mediaAssets || []).filter(
    (a: any) => !isVideoAsset(a)
  );

  const toggleSelectAll = () => {
    if (selectedMediaIds.size === batch.mediaAssets.length) {
      setSelectedMediaIds(new Set());
    } else {
      setSelectedMediaIds(new Set(batch.mediaAssets.map((a: any) => a.id)));
    }
  };

  const handleBulkRevert = async () => {
    if (selectedMediaIds.size === 0) return;
    setIsBulkReverting(true);
    const ids = Array.from(selectedMediaIds);
    try {
      await Promise.all(
        ids.map((mediaId) =>
          fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/revert`, { method: "POST" })
        )
      );
      const now = Date.now();
      setMediaTimestamps((prev) => {
        const updated = { ...prev };
        ids.forEach((id) => {
          updated[id] = now;
        });
        return updated;
      });
      setSelectedMediaIds(new Set());
      await fetchBatchData();
    } catch (err) {
      console.error("Bulk revert error", err);
      alert("Failed to revert some images");
    } finally {
      setIsBulkReverting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMediaIds.size === 0) return;
    if (!confirmBulkDelete) {
      setConfirmBulkDelete(true);
      setTimeout(() => setConfirmBulkDelete(false), 4000);
      return;
    }

    setIsBulkDeleting(true);
    const ids = Array.from(selectedMediaIds);
    try {
      await Promise.all(
        ids.map((mediaId) =>
          fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/delete`, { method: "POST" })
        )
      );
      setBatch((prev: any) => ({
        ...prev,
        mediaAssets: prev.mediaAssets.filter((a: any) => !selectedMediaIds.has(a.id)),
      }));
      setMediaOrder((prev) => prev.filter((a: any) => !selectedMediaIds.has(a.id)));
      setSelectedMediaIds(new Set());
      await fetchBatchData();
    } catch (err) {
      console.error("Bulk delete error", err);
      alert("Failed to delete some images");
    } finally {
      setIsBulkDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

  const openMoveModal = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches`);
      if (res.ok) {
        const data = await res.json();
        setBatchesList(data.filter((b: any) => b.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
    setIsMoveModalOpen(true);
  };

  const handleMoveMedia = async () => {
    if (selectedMediaIds.size === 0 || !targetBatchId) return;
    setIsMovingMedia(true);
    const ids = Array.from(selectedMediaIds);
    try {
      await Promise.all(
        ids.map((mediaId) =>
          fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetBatchId, retainAI: retainAIOnMove }),
          })
        )
      );
      setBatch((prev: any) => ({
        ...prev,
        mediaAssets: prev.mediaAssets.filter((a: any) => !selectedMediaIds.has(a.id)),
      }));
      setMediaOrder((prev) => prev.filter((a: any) => !selectedMediaIds.has(a.id)));
      setSelectedMediaIds(new Set());
      setIsMoveModalOpen(false);
      await fetchBatchData();
    } catch (err) {
      console.error("Bulk move error", err);
      alert("Failed to move some images");
    } finally {
      setIsMovingMedia(false);
    }
  };

  const handleRenameProduct = async () => {
    if (!renameInput.trim() || renameInput === batch.extractedData?.product_name) {
      setIsRenaming(false);
      return;
    }
    try {
      await fetchWithAuth(`${API_URL}/api/batches/${id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameInput.trim() }),
      });
      setBatch((prev: any) => ({
        ...prev,
        extractedData: {
          ...prev.extractedData,
          product_name: renameInput.trim(),
        },
      }));
    } catch (err) {
      console.error(err);
      alert("Failed to rename product");
    } finally {
      setIsRenaming(false);
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
      const res = await fetchWithAuth(`${API_URL}/api/batches/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEmails: emails }),
      });
      if (res.ok) {
        setIsSendModalOpen(false);
        const newHistory = Array.from(new Set([...emails, ...emailHistory])).slice(0, 10);
        setEmailHistory(newHistory);
        localStorage.setItem("sentEmailsHistory", JSON.stringify(newHistory));
        alert("Product cloned and sent successfully!");
      } else {
        alert("Failed to send product. Ensure the emails belong to registered users.");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending product.");
    } finally {
      setIsSending(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading product..." />;

  if (!batch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-graphite/40 rounded-2xl border border-graphite-border">
        <AlertCircle className="w-16 h-16 text-slate-500 mb-4" />
        <h2 className="text-xl font-heading font-bold text-white">Node Not Found</h2>
        <button
          onClick={() => router.push("/products")}
          className="mt-4 btn-glass border-electric-cyan/30 text-electric-cyan hover:border-electric-cyan hover:bg-electric-cyan/10"
        >
          Return to Matrix
        </button>
      </div>
    );
  }

  const isEditable = batch.status === "READY" || batch.status === "FAILED";

  return (
    <div className="-mx-4 md:-mx-10 min-h-screen bg-graphite flex flex-col relative overflow-hidden">
      {/* Decorative ambient background */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-electric-cyan/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-electric-magenta/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Action Bar (HUD Style) */}
      <div className="sticky top-0 z-30 bg-graphite-darker/80 backdrop-blur-xl border-b border-graphite-border px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={() => router.push("/products")}
            className="w-10 h-10 rounded-xl bg-graphite border border-graphite-border flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-all flex-shrink-0 shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1 min-w-0">
             <div className="flex items-center gap-3">
               <h1 className="text-lg sm:text-xl font-heading font-bold text-white truncate">
                 {batch.extractedData?.product_name || "Unidentified Asset"}
               </h1>
               <div className="hidden sm:flex items-center gap-2">
                 <StatusBadge status={batch.status} />
                 {batch.publications?.some((p: any) => p.status === 'FAILED') && (
                   <div className="text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-xs font-bold" title={batch.publications.find((p: any) => p.status === 'FAILED')?.error}>
                     <AlertTriangle className="w-3 h-3 inline mr-1" />
                     {batch.publications.find((p: any) => p.status === 'FAILED')?.platform} Error
                   </div>
                 )}
               </div>
             </div>
             <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
               <span>Source: <span className="text-slate-300">{batch.senderName || "WhatsApp"}</span></span>
               <span className="text-graphite-border px-1">•</span>
               <span className="text-amber-500">T-{Math.max(0, 14 - Math.floor((new Date().getTime() - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24)))} days to auto-purge</span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="sm:hidden block">
             <StatusBadge status={batch.status} />
          </div>
          <button
            onClick={openSendModal}
            className="btn-glass flex items-center gap-2 border-electric-cyan/30 text-electric-cyan hover:border-electric-cyan hover:bg-electric-cyan/10"
            title="Send Product to Another User"
          >
            <span className="hidden sm:inline font-bold tracking-wide text-sm">
              Send to User
            </span>
          </button>
          <button
            onClick={handleClearAIContent}
            className="btn-glass flex items-center gap-2 border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-500/10"
            title="Clear AI Content"
          >
            <RotateCcw className="w-4 h-4 hidden sm:block" />
            <span className="hidden sm:inline font-bold tracking-wide text-sm">
              Clear AI Data
            </span>
          </button>
          <button
            onClick={openPublishModal}
            disabled={batch.status === "PUBLISHING"}
            className="btn-glow flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4 hidden sm:block" />
            <span className="hidden sm:inline font-bold tracking-wide text-sm">
              {isEditable ? "Commit & Execute" : "Republish"}
            </span>
            <span className="sm:hidden font-bold">
              {isEditable ? "Commit" : "Republish"}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1600px] w-full mx-auto relative z-10">
        
        {/* Studio Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          
          {/* Left Column: Asset Gallery & Studio */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card flex-1 flex flex-col min-h-[500px]"
            >
              {/* Media Studio Header */}
              <div className="px-6 py-4 border-b border-graphite-border bg-graphite/40 flex items-center justify-between backdrop-blur-sm sticky top-0 z-20">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-electric-cyan" />
                  <h2 className="font-heading font-bold text-white uppercase tracking-wider text-sm">
                    Visual Assets <span className="text-slate-500 ml-1">({batch.mediaAssets?.length || 0})</span>
                  </h2>
                </div>

                {batch.mediaAssets?.length > 1 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs font-semibold text-electric-cyan hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric-cyan/10 hover:bg-electric-cyan/20 border border-electric-cyan/20 transition-all"
                  >
                    {selectedMediaIds.size === batch.mediaAssets.length ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        Select All
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Bulk Actions Floating Bar */}
              <AnimatePresence>
                {selectedMediaIds.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-electric-cyan-dim border-b border-electric-cyan/20 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-[60px] z-20 backdrop-blur-xl"
                  >
                    <div className="text-xs font-bold text-electric-cyan uppercase tracking-wider">
                      {selectedMediaIds.size} Assets Selected
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <button
                        onClick={openMoveModal}
                        className="btn-glass px-3 py-1.5 text-xs text-white border-white/20 hover:border-white/40 hover:bg-white/10 flex items-center gap-1.5"
                      >
                        <Layers className="w-3 h-3 text-electric-cyan" />
                        Move
                      </button>

                      <button
                        onClick={handleBulkRevert}
                        disabled={isBulkReverting}
                        className="btn-glass px-3 py-1.5 text-xs text-white border-white/20 hover:border-white/40 hover:bg-white/10 flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3 text-electric-cyan" />
                        {isBulkReverting ? "Reverting..." : "Remove Blurs"}
                      </button>

                      <button
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting}
                        className="btn-glass px-3 py-1.5 text-xs text-red-400 border-red-500/30 hover:border-red-500 hover:bg-red-500/10 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        {isBulkDeleting
                          ? "Deleting..."
                          : confirmBulkDelete
                          ? "Confirm Delete?"
                          : "Delete Assets"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Studio Canvas (Grid) */}
              <div className="p-6 bg-graphite-darker/30 flex-1 overflow-y-auto">
                {mediaOrder?.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    measuring={{
                      droppable: {
                        strategy: MeasuringStrategy.Always,
                      }
                    }}
                  >
                    <SortableContext
                      items={mediaOrder.map((m) => m.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {mediaOrder.map((asset: any, index: number) => {
                          const isImage = !isVideoAsset(asset);
                          const imageIndex = isImage
                            ? imageAssets.findIndex((a: any) => a.id === asset.id)
                            : -1;
                          const isSelected = selectedMediaIds.has(asset.id);
                          const timestamp = mediaTimestamps[asset.id] || 0;
                          const mediaSrc = `${API_URL}/${asset.localPath}${
                            timestamp ? `?t=${timestamp}` : ""
                          }`;

                          return (
                            <SortableMediaItem
                              key={asset.id}
                              asset={asset}
                              index={index}
                              isImage={isImage}
                              imageIndex={imageIndex}
                              isSelected={isSelected}
                              mediaSrc={mediaSrc}
                              revertingMediaId={revertingMediaId}
                              onToggleSelect={toggleSelectMedia}
                              onSingleDelete={handleSingleDelete}
                              onMask={(idx: number, e: React.MouseEvent) => {
                                e.preventDefault();
                                setMaskModalInitialIndex(idx >= 0 ? idx : 0);
                                setIsMaskModalOpen(true);
                              }}
                              onSingleRevert={handleSingleRevert}
                              onStopBlur={async (assetId: string, e: React.MouseEvent) => {
                                e.preventDefault();
                                try {
                                  await fetchWithAuth(
                                    `${API_URL}/api/batches/media/${assetId}/stop-blur`,
                                    { method: "POST" }
                                  );
                                  fetchBatchData();
                                } catch (err) {
                                  console.error("Failed to stop blur", err);
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 min-h-[300px]">
                     <Layers className="w-12 h-12 mb-4 opacity-20" />
                     <p className="text-sm font-medium">No media assets available.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right Column: AI Extraction & Copy Settings */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Context/Extraction Panel */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-graphite-border bg-graphite/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-electric-magenta" />
                  <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Payload Data</h2>
                </div>
              </div>
              <div className="p-6 grid gap-6">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-graphite-darker/50 border border-graphite-border p-4 rounded-xl flex flex-col justify-between group/rename relative">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Asset Name</label>
                    {isRenaming ? (
                      <div className="flex mt-1 items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameProduct();
                            if (e.key === "Escape") setIsRenaming(false);
                          }}
                          className="w-full bg-graphite border border-electric-cyan/50 rounded px-2 py-1 text-white text-sm focus:outline-none"
                        />
                        <button onClick={handleRenameProduct} className="text-electric-cyan p-1 hover:bg-electric-cyan/10 rounded">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex mt-1 items-start justify-between gap-2">
                        <p className="font-bold text-white text-lg leading-tight">
                          {batch.extractedData?.product_name || "Unidentified"}
                        </p>
                        <button
                          onClick={() => {
                            setRenameInput(batch.extractedData?.product_name || "");
                            setIsRenaming(true);
                          }}
                          className="text-slate-400 hover:text-electric-cyan opacity-0 group-hover/rename:opacity-100 transition-opacity p-1"
                          title="Rename Product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-electric-cyan/5 border border-electric-cyan/20 p-4 rounded-xl">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-electric-cyan">Override Price</label>
                    <input
                      type="text"
                      value={overridePrice}
                      onChange={(e) => setOverridePrice(e.target.value)}
                      placeholder="e.g. $49.99"
                      className="w-full bg-graphite/50 border border-graphite-border rounded-lg mt-2 px-3 py-1.5 text-white focus:border-electric-cyan focus:ring-1 focus:ring-electric-cyan text-sm transition-all"
                    />
                  </div>
                </div>

                {batch.extractedData?.features?.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Extracted Vector Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {batch.extractedData.features.map((feat: string, i: number) => (
                        <span key={i} className="text-xs font-mono text-slate-300 bg-graphite border border-graphite-border px-2 py-1 rounded-md">
                           {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {batch.rawText && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Raw Network Stream</label>
                    <pre className="text-xs text-slate-400 bg-graphite-darker p-3 rounded-xl border border-graphite-border font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {batch.rawText}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Social Copy Panel */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="glass-card overflow-hidden flex-1 flex flex-col"
            >
              <div className="px-6 py-4 border-b border-graphite-border bg-graphite/40 flex items-center justify-between">
                <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Syndication Content</h2>
                {isEditable && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-electric-emerald bg-electric-emerald/10 px-2.5 py-1 rounded-md border border-electric-emerald/20">
                    Active
                  </span>
                )}
              </div>

              <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[500px]">
                <CaptionBlock
                  platform="Instagram"
                  gradient="from-fuchsia-500 to-orange-500"
                  value={
                    isEditable
                      ? applyPrice(editedInstagram)
                      : batch.generatedContent?.instagramCaption
                  }
                  onChange={isEditable ? setEditedInstagram : undefined}
                  editable={isEditable}
                  rows={6}
                />
                <CaptionBlock
                  platform="Facebook"
                  gradient="from-blue-500 to-cyan-500"
                  value={
                    isEditable
                      ? applyPrice(editedFacebook)
                      : batch.generatedContent?.facebookCaption
                  }
                  onChange={isEditable ? setEditedFacebook : undefined}
                  editable={isEditable}
                  rows={5}
                />
                <CaptionBlock
                  platform="Story"
                  gradient="from-slate-600 to-slate-800"
                  value={
                    isEditable
                      ? applyPrice(editedStory)
                      : batch.generatedContent?.storyText
                  }
                  onChange={isEditable ? setEditedStory : undefined}
                  editable={isEditable}
                  rows={3}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Multi-Image Mask Modal with Slider and Instant In-Place Updates */}
      <ImageMaskModal
        isOpen={isMaskModalOpen}
        mediaList={imageAssets}
        initialIndex={maskModalInitialIndex}
        onClose={() => setIsMaskModalOpen(false)}
        onImageUpdated={handleImageUpdated}
      />

      {/* Publish Platform Selection Modal */}
      <AnimatePresence>
        {isPublishModalOpen && (
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
                <h3 className="text-xl font-heading font-bold text-white mb-2">Publish Product</h3>
                <p className="text-sm text-slate-400 mb-6">Select which platforms to syndicate this content to.</p>

                <div className="space-y-3">
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${publishTargets.includes('FACEBOOK') ? 'bg-blue-500/10 border-blue-500/50' : 'bg-graphite border-graphite-border hover:border-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={publishTargets.includes('FACEBOOK')}
                      onChange={(e) => {
                        if (e.target.checked) setPublishTargets(prev => [...prev, 'FACEBOOK']);
                        else setPublishTargets(prev => prev.filter(t => t !== 'FACEBOOK'));
                      }}
                      className="w-5 h-5 rounded border-slate-600 bg-graphite-darker text-electric-cyan focus:ring-electric-cyan focus:ring-offset-graphite-darker"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-white">Facebook</p>
                      <p className="text-xs text-slate-400">Post to linked Page</p>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${publishTargets.includes('INSTAGRAM') ? 'bg-fuchsia-500/10 border-fuchsia-500/50' : 'bg-graphite border-graphite-border hover:border-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={publishTargets.includes('INSTAGRAM')}
                      onChange={(e) => {
                        if (e.target.checked) setPublishTargets(prev => [...prev, 'INSTAGRAM']);
                        else setPublishTargets(prev => prev.filter(t => t !== 'INSTAGRAM'));
                      }}
                      className="w-5 h-5 rounded border-slate-600 bg-graphite-darker text-electric-cyan focus:ring-electric-cyan focus:ring-offset-graphite-darker"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-white">Instagram</p>
                      <p className="text-xs text-slate-400">Post to linked IG Account</p>
                    </div>
                  </label>
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button
                    onClick={() => setIsPublishModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-graphite-border text-slate-300 font-bold hover:bg-graphite transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={approveAndPublish}
                    disabled={publishTargets.length === 0}
                    className="flex-1 py-2.5 rounded-xl bg-electric-cyan text-graphite-darker font-bold hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {isEditable ? "Execute" : "Republish"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move Media Modal */}
      <AnimatePresence>
        {isMoveModalOpen && (
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
                <h3 className="text-xl font-heading font-bold text-white mb-2">Move Media</h3>
                <p className="text-sm text-slate-400 mb-6">Select a destination product for the selected {selectedMediaIds.size} assets.</p>                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={moveSearchQuery}
                      onChange={(e) => setMoveSearchQuery(e.target.value)}
                      className="w-full bg-graphite border border-graphite-border rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-electric-cyan"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-xl border border-graphite-border bg-graphite custom-scrollbar">
                    {batchesList
                      .filter((b) => {
                        const name = b.extractedData?.product_name?.toLowerCase() || "";
                        const sender = b.senderName?.toLowerCase() || "";
                        const q = moveSearchQuery.toLowerCase();
                        return name.includes(q) || sender.includes(q);
                      })
                      .map((b) => (
                        <div
                          key={b.id}
                          onClick={() => setTargetBatchId(b.id)}
                          className={`px-4 py-3 cursor-pointer border-b border-graphite-border last:border-b-0 hover:bg-white/5 transition-colors ${
                            targetBatchId === b.id ? "bg-electric-cyan/10 border-l-2 border-l-electric-cyan" : ""
                          }`}
                        >
                          <div className="font-bold text-white text-sm truncate">
                            {b.extractedData?.product_name || "Unknown Product"}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {b.senderName || "WhatsApp"} • {new Date(b.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    {batchesList.length === 0 && (
                      <div className="p-4 text-sm text-slate-500 text-center">No other products found.</div>
                    )}
                  </div>
                </div>    
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-graphite-border cursor-pointer transition-colors hover:border-slate-600">
                    <input
                      type="checkbox"
                      checked={retainAIOnMove}
                      onChange={(e) => setRetainAIOnMove(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-graphite-darker text-electric-cyan"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm">Retain AI Data</p>
                      <p className="text-xs text-slate-400">Keep generated AI info on these assets</p>
                    </div>
                  </label>
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button
                    onClick={() => setIsMoveModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-graphite-border text-slate-300 font-bold hover:bg-graphite transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMoveMedia}
                    disabled={!targetBatchId || isMovingMedia}
                    className="flex-1 py-2.5 rounded-xl bg-electric-cyan text-graphite-darker font-bold hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {isMovingMedia ? "Moving..." : "Move"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <h3 className="text-xl font-heading font-bold text-white mb-2">Send to User</h3>
                <p className="text-sm text-slate-400 mb-6">Enter the email addresses of the users you want to send this product to.</p>

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

function SortableMediaItem({
  asset,
  index,
  isImage,
  imageIndex,
  isSelected,
  mediaSrc,
  revertingMediaId,
  onToggleSelect,
  onSingleDelete,
  onMask,
  onSingleRevert,
  onStopBlur,
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id });

  // CRITICAL: No transition on the dragged item — it must follow the finger/mouse
  // at native framerate. Only passive items (sliding out of the way) get a transition.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : (transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)'),
    zIndex: isDragging ? 999 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-xl overflow-hidden border aspect-square will-change-transform ${
        isSelected ? "border-electric-cyan ring-2 ring-electric-cyan/30" : "border-graphite-border"
      } ${isDragging ? "shadow-2xl shadow-electric-cyan/30 ring-2 ring-electric-cyan bg-graphite-darker opacity-90" : "bg-graphite-darker hover:border-electric-cyan/50"}`}
    >
      {/* Visual drag indicator */}
      <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex justify-center pt-1 pointer-events-none">
        <div className="w-8 h-1 bg-white/30 rounded-full" />
      </div>

      <div 
        {...attributes} 
        {...listeners} 
        className="absolute inset-0 z-[5] cursor-grab active:cursor-grabbing" 
        style={{ touchAction: 'none' }}
      />

      {index === 0 && (
        <div className="absolute top-2 left-2 z-20 bg-electric-cyan/90 backdrop-blur-md text-graphite-darker text-[10px] font-bold px-2 py-1 rounded-md shadow-[0_0_10px_rgba(0,255,255,0.3)] border border-electric-cyan pointer-events-none">
          Primary Asset
        </div>
      )}
      {!isImage && (
        <div className="absolute top-2 left-2 z-20 bg-electric-magenta/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-[0_0_10px_rgba(255,0,255,0.3)] border border-electric-magenta pointer-events-none">
          Video
        </div>
      )}
      
      {!isImage ? (
        <video
          src={mediaSrc}
          className="w-full h-full object-cover pointer-events-none"
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <Image
          src={mediaSrc}
          alt=""
          fill
          className="object-cover pointer-events-none"
        />
      )}

      {/* AI Processing Overlay */}
      {asset.isProcessing && (
        <div className="absolute inset-0 bg-graphite-darker/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 text-electric-cyan animate-spin mb-2" />
          <span className="text-xs font-bold text-electric-cyan tracking-wider">
            AI PROCESSING...
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onStopBlur(asset.id, e)}
            className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full text-[10px] font-bold tracking-wide transition-colors cursor-pointer pointer-events-auto border border-red-500/30"
          >
            <XCircle className="w-3.5 h-3.5" />
            HALT
          </button>
        </div>
      )}

      {/* Interactive Card Overlay */}
      <div
        className={`absolute inset-0 z-20 bg-gradient-to-t from-graphite-darker/95 via-graphite-darker/40 to-transparent opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 pointer-events-none`}
      >
        {/* Top Controls */}
        <div className="flex items-center justify-between w-full pointer-events-auto">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onToggleSelect(asset.id, e)}
            className={`p-1.5 rounded-lg backdrop-blur-md shadow-sm transition-all border ${
              isSelected
                ? "bg-electric-cyan/20 border-electric-cyan text-electric-cyan"
                : "bg-graphite/60 border-graphite-border text-white/50 hover:bg-graphite hover:text-white"
            } cursor-pointer`}
          >
            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onSingleDelete(asset.id, e)}
            className={`p-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1 backdrop-blur-md bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/40 cursor-pointer`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Bottom Controls */}
        {isImage && (
          <div className="flex flex-col gap-1.5 w-full pointer-events-auto">
            <div className="flex gap-1.5">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onMask(imageIndex, e)}
                className="flex-1 py-1.5 px-2 rounded-lg bg-graphite/80 backdrop-blur-md hover:bg-graphite-border text-slate-300 hover:text-white text-xs font-semibold shadow-sm transition-all border border-graphite-border text-center cursor-pointer"
              >
                Mask Target
              </button>

              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onSingleRevert(asset.id, e)}
                disabled={revertingMediaId === asset.id}
                className="py-1.5 px-2.5 rounded-lg bg-electric-cyan/10 hover:bg-electric-cyan/20 backdrop-blur-md text-electric-cyan text-xs font-semibold shadow-sm transition-all border border-electric-cyan/30 flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${revertingMediaId === asset.id ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Unblur</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CaptionBlock({
  platform,
  gradient,
  value,
  onChange,
  editable,
  rows,
}: {
  platform: string;
  gradient: string;
  value?: string;
  onChange?: (v: string) => void;
  editable: boolean;
  rows: number;
}) {
  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-5 h-5 rounded-md bg-gradient-to-br ${gradient} shadow-sm border border-white/10`}
        />
        <h3 className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">{platform}</h3>
      </div>
      {editable && onChange ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full bg-graphite-darker/50 border border-graphite-border rounded-xl px-4 py-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-electric-cyan focus:ring-1 focus:ring-electric-cyan resize-y leading-relaxed transition-all"
          placeholder={`${platform} caption...`}
        />
      ) : (
        <div className="bg-graphite-darker/50 border border-graphite-border rounded-xl p-4">
          <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
            {value || "Not generated yet"}
          </p>
        </div>
      )}
    </div>
  );
}
