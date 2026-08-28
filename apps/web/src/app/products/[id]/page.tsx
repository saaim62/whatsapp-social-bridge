"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  const [maskModalInitialIndex, setMaskModalInitialIndex] = useState(0);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [mediaTimestamps, setMediaTimestamps] = useState<Record<string, number>>({});
  const [revertingMediaId, setRevertingMediaId] = useState<string | null>(null);
  const [isBulkReverting, setIsBulkReverting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
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

  const approveAndPublish = async () => {
    setBatch((prev: any) => ({ ...prev, status: "PUBLISHING" }));
    await fetchWithAuth(`${API_URL}/api/batches/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instagramCaption: applyPrice(editedInstagram),
        facebookCaption: applyPrice(editedFacebook),
        storyText: applyPrice(editedStory),
      }),
    });
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

  const imageAssets = (batch?.mediaAssets || []).filter(
    (a: any) => !a.mimeType?.startsWith("video/")
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

  if (loading) return <LoadingSpinner label="Loading product..." />;

  if (!batch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertCircle className="w-16 h-16 text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Product Not Found</h2>
        <button
          onClick={() => router.push("/products")}
          className="mt-4 btn-ghost"
        >
          Back to Products
        </button>
      </div>
    );
  }

  const isEditable = batch.status === "READY" || batch.status === "FAILED";

  return (
    <div className="-m-4 sm:-m-8">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 px-4 sm:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-2">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={() => router.push("/products")}
              className="p-1.5 sm:p-2 -ml-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <h1 className="text-base sm:text-xl font-extrabold text-slate-900 truncate">
                  {batch.extractedData?.product_name || "Product Review"}
                </h1>
                <div className="hidden sm:block">
                  <StatusBadge status={batch.status} />
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate flex items-center gap-2">
                From {batch.senderName || "WhatsApp"}
                <span className="text-yellow-700 font-bold bg-yellow-100 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs">
                  Expires in {Math.max(0, 14 - Math.floor((new Date().getTime() - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24)))} days
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={approveAndPublish}
            disabled={!isEditable}
            className="btn-gradient px-3 py-2 sm:px-4 text-[11px] sm:text-sm whitespace-nowrap flex-shrink-0"
          >
            <Save className="w-3 h-3 sm:w-4 sm:h-4 hidden sm:block" />
            <span className="hidden sm:inline">Approve & Publish</span>
            <span className="sm:hidden">Publish</span>
          </button>
        </div>
        {/* Mobile Status Badge under header */}
        <div className="sm:hidden mt-2 flex items-center justify-between">
          <StatusBadge status={batch.status} />
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-600" />
          <div>
            <h4 className="font-bold text-sm">Storage Notice</h4>
            <p className="text-sm mt-0.5 text-yellow-700">To save storage, this product will be automatically removed 14 days after creation.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column */}
          <div className="lg:col-span-5 space-y-6">
            {/* Pricing */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-gradient-to-r from-brand-50/50 to-violet-50/30">
                <Tag className="w-4 h-4 text-brand-500" />
                <h2 className="font-bold text-slate-800">Pricing & Details</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Product Name
                  </label>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    {batch.extractedData?.product_name || "N/A"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100/50">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
                    Override Price
                  </label>
                  <input
                    type="text"
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(e.target.value)}
                    placeholder="e.g. Rs. 4,500"
                    className="input-field mt-2 !bg-white"
                  />
                  <p className="text-xs text-brand-500/70 mt-2">
                    Injected live into captions on the right
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Features */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-card overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="font-bold text-slate-800">AI Extracted Features</h2>
              </div>
              <div className="p-6">
                {batch.extractedData?.features?.length > 0 ? (
                  <ul className="space-y-2.5">
                    {batch.extractedData.features.map(
                      (feat: string, i: number) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.05 }}
                          className="flex items-start gap-2 text-sm text-slate-700"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span className="font-medium">{feat}</span>
                        </motion.li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    No features extracted yet.
                  </p>
                )}
                {batch.rawText && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Raw Message
                    </label>
                    <pre className="mt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl font-mono whitespace-pre-wrap">
                      {batch.rawText}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Media Section with Bulk Selection & Fast Actions */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card overflow-hidden"
            >
              {/* Media Section Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  <h2 className="font-bold text-slate-800">
                    Media ({batch.mediaAssets?.length || 0})
                  </h2>
                </div>

                {batch.mediaAssets?.length > 1 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
                  >
                    {selectedMediaIds.size === batch.mediaAssets.length ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-brand-600" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        Select All ({batch.mediaAssets.length})
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Bulk Actions Floating/Pinned Bar */}
              <AnimatePresence>
                {selectedMediaIds.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-brand-50 border-b border-brand-100 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">
                        {selectedMediaIds.size} Selected
                      </span>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={handleBulkRevert}
                        disabled={isBulkReverting}
                        className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                        title="Remove Auto Blur on selected images"
                      >
                        <RotateCcw className="w-3 h-3 text-rose-500" />
                        {isBulkReverting ? "Reverting..." : "Remove Blur"}
                      </button>

                      <button
                        onClick={handleBulkDelete}
                        disabled={isBulkDeleting}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all ${
                          confirmBulkDelete
                            ? "bg-rose-700 text-white hover:bg-rose-800"
                            : "bg-rose-600 text-white hover:bg-rose-700"
                        } disabled:opacity-50`}
                        title="Delete selected images"
                      >
                        <Trash2 className="w-3 h-3" />
                        {isBulkDeleting
                          ? "Deleting..."
                          : confirmBulkDelete
                          ? "Confirm Delete?"
                          : "Delete"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-4 sm:p-6">
                {mediaOrder?.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={mediaOrder.map((m) => m.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {mediaOrder.map((asset: any, index: number) => {
                          const isImage = !asset.mimeType?.startsWith("video/");
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
                  <p className="text-sm text-slate-400 text-center py-6">
                    No media attached.
                  </p>
                )}
              </div>

            </motion.div>
          </div>

          {/* Right column — Captions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="lg:col-span-7"
          >
            <div className="glass-card overflow-hidden h-full flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50/50 to-fuchsia-50/30">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h2 className="font-bold text-slate-800">Social Copy Studio</h2>
                </div>
                {isEditable && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100">
                    Editable
                  </span>
                )}
              </div>

              <div className="p-6 space-y-6 flex-1">
                <CaptionBlock
                  platform="Instagram"
                  gradient="from-yellow-400 via-red-500 to-purple-500"
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
                  gradient="from-[#1877F2] to-[#0d65d9]"
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
                  gradient="from-slate-700 to-slate-900"
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
            </div>
          </motion.div>
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
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : (transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)'),
    zIndex: isDragging ? 999 : 1,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-xl overflow-hidden border aspect-square will-change-transform ${
        isSelected ? "border-brand-500 ring-2 ring-brand-500/30" : "border-slate-200"
      } ${isDragging ? "shadow-2xl shadow-brand-500/30 ring-2 ring-brand-500 bg-white opacity-90" : "bg-white hover:shadow-md"}`}
    >
      {/* Visual drag indicator */}
      <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex justify-center pt-1 pointer-events-none">
        <div className="w-8 h-1 bg-white/50 rounded-full" />
      </div>

      <div 
        {...attributes} 
        {...listeners} 
        className="absolute inset-0 z-[5] cursor-grab active:cursor-grabbing" 
        style={{ touchAction: 'none' }}
      />

      {index === 0 && (
        <div className="absolute top-2 left-2 z-20 bg-brand-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-brand-400 pointer-events-none">
          Thumbnail / 1st Image
        </div>
      )}
      
      {asset.mimeType?.startsWith("video/") ? (
        <video
          src={mediaSrc}
          className="w-full h-full object-cover pointer-events-none"
          muted
          loop
          autoPlay
          playsInline
        />
      ) : (
        <img
          src={mediaSrc}
          alt=""
          className="w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* AI Processing Overlay */}
      {asset.isProcessing && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
          <span className="text-xs font-bold text-brand-700 tracking-wider">
            PROCESSING AI...
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onStopBlur(asset.id, e)}
            className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full text-[10px] font-bold tracking-wide transition-colors cursor-pointer pointer-events-auto"
          >
            <XCircle className="w-3.5 h-3.5" />
            STOP
          </button>
        </div>
      )}

      {/* Interactive Card Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-slate-900/60 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 pointer-events-none ${
          asset.isProcessing ? "hidden" : ""
        }`}
      >
        {/* Top Controls */}
        <div className="flex items-center justify-between w-full pointer-events-auto">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onToggleSelect(asset.id, e)}
            className={`p-1.5 rounded-lg backdrop-blur-md shadow-sm transition-all ${
              isSelected
                ? "bg-brand-600 text-white"
                : "bg-slate-900/60 text-white/80 hover:bg-slate-900/80 hover:text-white"
            } cursor-pointer`}
          >
            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onSingleDelete(asset.id, e)}
            className={`p-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1 backdrop-blur-md bg-rose-600/90 text-white hover:bg-rose-600 cursor-pointer`}
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
                className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800/95 backdrop-blur-md hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all border border-white/10 text-center cursor-pointer"
              >
                Mask Logo
              </button>

              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onSingleRevert(asset.id, e)}
                disabled={revertingMediaId === asset.id}
                className="py-1.5 px-2.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 backdrop-blur-md text-white text-xs font-semibold shadow-sm transition-all border border-white/10 flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${revertingMediaId === asset.id ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Remove Blur</span>
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
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-5 h-5 rounded-md bg-gradient-to-br ${gradient}`}
        />
        <h3 className="text-sm font-bold text-slate-800">{platform}</h3>
      </div>
      {editable && onChange ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="input-field resize-y leading-relaxed !bg-slate-50/50"
          placeholder={`${platform} caption...`}
        />
      ) : (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {value || "Not generated yet"}
          </p>
        </div>
      )}
    </div>
  );
}
