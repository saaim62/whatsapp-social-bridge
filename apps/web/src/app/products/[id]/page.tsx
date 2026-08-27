"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Sparkles,
  Tag,
  Image as ImageIcon,
  CheckCircle2,
  Save,
  Trash2,
  AlertCircle,
  Loader2,
  XCircle,
} from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ImageMaskModal } from "@/components/ui/ImageMaskModal";

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [batch, setBatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteMediaId, setConfirmDeleteMediaId] = useState<string | null>(null);
  const [overridePrice, setOverridePrice] = useState("");
  const [editedInstagram, setEditedInstagram] = useState("");
  const [editedFacebook, setEditedFacebook] = useState("");
  const [editedStory, setEditedStory] = useState("");
  const [maskingMediaId, setMaskingMediaId] = useState<string | null>(null);
  const [maskingMediaUrl, setMaskingMediaUrl] = useState<string | null>(null);
  const hasInitializedEdits = useRef(false);

  const applyPrice = (text: string) => {
    if (!text) return "";
    return text.replace(/\{\{PRICE\}\}/g, overridePrice || "");
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchBatch = () => {
      fetchWithAuth(`${API_URL}/api/batches/${id}`)
        .then((res) => res.json())
        .then((data) => {
          setBatch(data);
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
          if (data.status === "PUBLISHED" || data.status === "FAILED") {
            clearInterval(interval);
          }
        });
    };

    fetchBatch();
    interval = setInterval(fetchBatch, 3000);
    return () => clearInterval(interval);
  }, [id]);

  const approveAndPublish = async () => {
    setBatch({ ...batch, status: "PUBLISHING" });
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
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
                From {batch.senderName || "WhatsApp"}
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

            {/* Media */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-500" />
                <h2 className="font-bold text-slate-800">
                  Media ({batch.mediaAssets?.length || 0})
                </h2>
              </div>
              <div className="p-6">
                {batch.mediaAssets?.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {batch.mediaAssets.map((asset: any) => (
                      <div
                        key={asset.id}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square"
                      >
                        {asset.mimeType?.startsWith("video/") ? (
                          <video
                            src={`${API_URL}/${asset.localPath}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                        ) : (
                          <img
                            src={`${API_URL}/${asset.localPath}?t=${Date.now()}`}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        )}
                        
                        {asset.isProcessing && (
                          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
                            <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-2" />
                            <span className="text-xs font-bold text-brand-700 tracking-wider">PROCESSING AI...</span>
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                try {
                                  await fetchWithAuth(`${API_URL}/api/batches/media/${asset.id}/stop-blur`, { method: "POST" });
                                  window.location.reload();
                                } catch (err) {
                                  console.error("Failed to stop blur", err);
                                }
                              }}
                              className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full text-[10px] font-bold tracking-wide transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              STOP
                            </button>
                          </div>
                        )}
                        
                        <div className={`absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-slate-900/40 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex flex-col items-end justify-between p-2 ${asset.isProcessing ? 'hidden' : ''}`}>
                          <button
                            onClick={async (e) => {
                              e.preventDefault();
                              if (confirmDeleteMediaId !== asset.id) {
                                setConfirmDeleteMediaId(asset.id);
                                setTimeout(() => setConfirmDeleteMediaId(null), 3000);
                                return;
                              }
                              
                              try {
                                await fetchWithAuth(`${API_URL}/api/batches/media/${asset.id}/delete`, { method: "POST" });
                                window.location.reload();
                              } catch (err) {
                                console.error(err);
                                setConfirmDeleteMediaId(null);
                              }
                            }}
                            className={`p-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1 backdrop-blur-md ${
                              confirmDeleteMediaId === asset.id 
                                ? "bg-rose-700 text-white hover:bg-rose-800" 
                                : "bg-rose-600/90 text-white hover:bg-rose-600"
                            }`}
                            title={confirmDeleteMediaId === asset.id ? "Click again to confirm" : "Delete Image"}
                          >
                            {confirmDeleteMediaId === asset.id && <span className="text-[10px] font-bold pl-1">Confirm</span>}
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          
                          {!asset.mimeType?.startsWith("video/") && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                setMaskingMediaId(asset.id);
                                setMaskingMediaUrl(`${API_URL}/${asset.localPath}`);
                              }}
                              className="w-full py-2 lg:py-1.5 rounded-lg bg-slate-800/90 backdrop-blur-md hover:bg-slate-800 text-white text-sm lg:text-xs font-semibold shadow-sm transition-all border border-white/10"
                            >
                              Mask Logo
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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

      <ImageMaskModal
        isOpen={!!maskingMediaId}
        mediaId={maskingMediaId || ""}
        mediaUrl={maskingMediaUrl || ""}
        onClose={() => {
          setMaskingMediaId(null);
          setMaskingMediaUrl(null);
        }}
        onSuccess={() => {
          // Add a timestamp to force the browser to reload the image
          window.location.reload();
        }}
      />
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
