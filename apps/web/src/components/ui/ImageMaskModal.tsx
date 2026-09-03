"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crop, Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MediaItem {
  id: string;
  localPath: string;
  originalUrl?: string;
  mimeType?: string;
}

export function ImageMaskModal({
  isOpen,
  onClose,
  mediaList = [],
  initialIndex = 0,
  onImageUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  mediaList: MediaItem[];
  initialIndex?: number;
  onImageUpdated?: (mediaId: string) => void;
}) {
  const images = mediaList.filter((m) => !m.mimeType?.startsWith("video/"));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [imageTimestamps, setImageTimestamps] = useState<Record<string, number>>({});
  
  const imgRef = useRef<HTMLImageElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.max(0, Math.min(initialIndex, images.length - 1));
      setCurrentIndex(validIndex);
      setCurrentBox(null);
      setBoxes([]);
      setSuccessToast(null);
    }
  }, [isOpen, initialIndex, images.length]);

  // Reset boxes when switching images
  useEffect(() => {
    setCurrentBox(null);
    setBoxes([]);
    setSuccessToast(null);
  }, [currentIndex]);

  const currentMedia = images[currentIndex];
  const currentTimestamp = currentMedia ? (imageTimestamps[currentMedia.id] || 0) : 0;

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  if (!isOpen || !currentMedia) return null;

  const getCoordinates = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX, clientY;
    
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const { x, y } = getCoordinates(e);
    setStartPos({ x, y });
    setCurrentBox({ left: x, top: y, width: 0, height: 0 });
    setIsDrawing(true);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let { x, y } = getCoordinates(e);
    
    // clamp
    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));

    setCurrentBox({
      left: Math.min(startPos.x, x),
      top: Math.min(startPos.y, y),
      width: Math.abs(x - startPos.x),
      height: Math.abs(y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentBox && currentBox.width > 8 && currentBox.height > 8) {
      setBoxes((prev) => [...prev, currentBox]);
    }
    setCurrentBox(null);
    setIsDrawing(false);
  };

  const handleSave = async () => {
    if (boxes.length === 0 || !imgRef.current || !currentMedia) return;
    setIsSaving(true);

    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const realBoxes = boxes.map((box) => ({
      left: box.left * scaleX,
      top: box.top * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    }));

    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/media/${currentMedia.id}/mask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxes: realBoxes }),
      });
      if (res.ok) {
        // Cache bust local image without closing modal or reloading full page!
        const newTimestamp = Date.now();
        setImageTimestamps((prev) => ({ ...prev, [currentMedia.id]: newTimestamp }));
        setBoxes([]);
        showToast("Blur applied successfully!");
        onImageUpdated?.(currentMedia.id);
      } else {
        const errorData = await res.json().catch(() => null);
        alert(`Failed to apply mask: ${errorData?.message || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error applying mask");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!currentMedia) return;
    setIsReverting(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/media/${currentMedia.id}/revert`, {
        method: "POST",
      });
      if (res.ok) {
        const newTimestamp = Date.now();
        setImageTimestamps((prev) => ({ ...prev, [currentMedia.id]: newTimestamp }));
        setBoxes([]);
        showToast("Auto-blur removed! Restored original.");
        onImageUpdated?.(currentMedia.id);
      } else {
        const errorData = await res.json().catch(() => null);
        alert(`Failed to revert: ${errorData?.message || res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error reverting mask");
    } finally {
      setIsReverting(false);
    }
  };

  const imageUrl = currentMedia.originalUrl 
    ? `${currentMedia.originalUrl}${currentTimestamp ? `?t=${currentTimestamp}` : ""}`
    : `${API_URL}/${currentMedia.localPath}${currentTimestamp ? `?t=${currentTimestamp}` : ""}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full flex flex-col max-h-[95vh] sm:max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                <Crop className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Mask Brand Logo
                  </h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {currentIndex + 1} / {images.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden sm:block">
                  Drag to blur brand logos. Switch images using arrows or swipe.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Image Workspace with Slider Arrows */}
          <div className="relative p-2 sm:p-6 overflow-hidden flex-1 bg-slate-950/5 flex items-center justify-center select-none">
            {/* Left Chevron Button */}
            {images.length > 1 && (
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 rounded-full bg-white/90 shadow-lg text-slate-700 hover:bg-white transition-all disabled:opacity-30 disabled:pointer-events-none hover:scale-105 border border-slate-200/50`}
                title="Previous Image (Left Arrow)"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}

            {/* Right Chevron Button */}
            {images.length > 1 && (
              <button
                onClick={handleNext}
                disabled={currentIndex === images.length - 1}
                className={`absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 rounded-full bg-white/90 shadow-lg text-slate-700 hover:bg-white transition-all disabled:opacity-30 disabled:pointer-events-none hover:scale-105 border border-slate-200/50`}
                title="Next Image (Right Arrow)"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}

            {/* Toast feedback */}
            <AnimatePresence>
              {successToast && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-4 z-30 px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-lg flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  {successToast}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Interactive Drawing Container */}
            <div
              className="relative shadow-md bg-white cursor-crosshair inline-block max-w-full touch-none rounded-lg overflow-hidden"
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handleMouseUp}
              onTouchCancel={handleMouseUp}
            >
              <img
                ref={imgRef}
                key={`${currentMedia.id}-${currentTimestamp}`}
                src={imageUrl}
                alt="To mask"
                className="max-w-full max-h-[52vh] sm:max-h-[60vh] object-contain block pointer-events-none select-none"
                draggable={false}
              />
              
              {boxes.map((box, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-brand-500 bg-brand-500/25 backdrop-blur-[1px]"
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                  }}
                />
              ))}

              {currentBox && (
                <div
                  className="absolute border-2 border-brand-500 bg-brand-500/25 backdrop-blur-[1px] pointer-events-none"
                  style={{
                    left: currentBox.left,
                    top: currentBox.top,
                    width: currentBox.width,
                    height: currentBox.height,
                  }}
                />
              )}
            </div>
          </div>

          {/* Thumbnail Dots/Navigation Bar */}
          {images.length > 1 && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-1.5 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    idx === currentIndex
                      ? "bg-brand-600 scale-125 w-5"
                      : "bg-slate-300 hover:bg-slate-400"
                  }`}
                  title={`Go to image ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* Footer Controls */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={handleRevert}
                disabled={isReverting}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Restore unblurred original image"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isReverting ? "Restoring..." : "Remove Auto Blur"}
              </button>

              {boxes.length > 0 && (
                <button
                  onClick={() => setBoxes([])}
                  className="px-3 py-2 text-xs sm:text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              <button
                onClick={onClose}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Done
              </button>
              
              <button
                onClick={handleSave}
                disabled={boxes.length === 0 || isSaving}
                className="bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 px-4 sm:px-6 py-2 text-xs sm:text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSaving ? (
                  "Applying Blur..."
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1.5 inline" />
                    Apply Blur
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
