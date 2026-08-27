"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Crop, Check } from "lucide-react";
import { API_URL, fetchWithAuth } from "@/lib/api";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function ImageMaskModal({
  isOpen,
  onClose,
  mediaId,
  mediaUrl,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  mediaId: string;
  mediaUrl: string;
  onSuccess: () => void;
}) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setCurrentBox(null);
      setBoxes([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getCoordinates = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
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
    if (isDrawing && currentBox && currentBox.width > 5 && currentBox.height > 5) {
      setBoxes(prev => [...prev, currentBox]);
    }
    setCurrentBox(null);
    setIsDrawing(false);
  };

  const handleSave = async () => {
    if (boxes.length === 0 || !imgRef.current) return;
    setIsSaving(true);

    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const realBoxes = boxes.map(box => ({
      left: box.left * scaleX,
      top: box.top * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    }));

    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/mask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxes: realBoxes }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
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
    setIsReverting(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/batches/media/${mediaId}/revert`, {
        method: "POST",
      });
      if (res.ok) {
        onSuccess();
        onClose();
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full flex flex-col max-h-[90vh]"
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Crop className="w-5 h-5 text-brand-500" />
                Mask Brand Logo
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Click and drag over any visible brand logos to blur them permanently.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 overflow-auto flex-1 bg-slate-50 flex items-center justify-center select-none">
            <div
              className="relative shadow-md bg-white cursor-crosshair inline-block max-w-full touch-none"
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handleMouseUp}
              onTouchCancel={handleMouseUp}
            >
              {/* Force a cache bust so it reloads if edited */}
              <img
                ref={imgRef}
                src={`${mediaUrl}?t=${Date.now()}`}
                alt="To mask"
                className="max-w-full max-h-[60vh] block pointer-events-none select-none"
                draggable={false}
              />
              {boxes.map((box, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-brand-500 bg-brand-500/20 backdrop-blur-sm"
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
                  className="absolute border-2 border-brand-500 bg-brand-500/20 backdrop-blur-sm pointer-events-none"
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

          <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center gap-3">
            <div>
              <button
                onClick={handleRevert}
                disabled={isReverting}
                className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all mr-2"
              >
                {isReverting ? "Reverting..." : "Remove Auto Blur"}
              </button>
              {boxes.length > 0 && (
                <button
                  onClick={() => setBoxes([])}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Clear Selection
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={boxes.length === 0 || isSaving}
                className="btn-gradient px-6"
              >
                {isSaving ? "Applying Blur..." : (
                  <>
                    <Check className="w-4 h-4 mr-2 inline" />
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
