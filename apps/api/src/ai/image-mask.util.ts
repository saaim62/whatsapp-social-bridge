import * as fs from 'fs';
import { OverlayOptions } from 'sharp';
const sharp = require('sharp');

export type BlurBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function isRasterImage(filePath: string, mimeType?: string | null): boolean {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return false;
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(filePath);
}

export function isMaskableImage(
  filePath: string,
  mimeType?: string | null,
): boolean {
  return isRasterImage(filePath, mimeType);
}

export function clampBox(
  box: BlurBox,
  imageWidth: number,
  imageHeight: number,
  padding = 0,
): BlurBox | null {
  if (!imageWidth || !imageHeight) return null;

  const left = Math.max(0, Math.floor(box.left - padding));
  const top = Math.max(0, Math.floor(box.top - padding));
  const right = Math.min(imageWidth, Math.ceil(box.left + box.width + padding));
  const bottom = Math.min(
    imageHeight,
    Math.ceil(box.top + box.height + padding),
  );
  const width = right - left;
  const height = bottom - top;

  if (width < 2 || height < 2) return null;
  return { left, top, width, height };
}

/** Apply EXIF orientation and write a browser-stable sRGB file so UI coords match pixels. */
export async function normalizeImageFile(
  absolutePath: string,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(absolutePath).metadata();
  const format =
    meta.format === 'png' || meta.format === 'webp' ? meta.format : 'jpeg';

  const buffer = await sharp(absolutePath)
    .rotate()
    .toColourspace('srgb')
    .toFormat(format, { quality: 92 })
    .toBuffer();

  fs.writeFileSync(absolutePath, buffer);
  const after = await sharp(buffer).metadata();
  return { width: after.width || 0, height: after.height || 0 };
}

async function createBlurOverlay(
  imageBuffer: Buffer,
  box: BlurBox,
): Promise<Buffer> {
  const { left, top, width, height } = box;
  const smallW = Math.max(4, Math.round(width / 10));
  const smallH = Math.max(4, Math.round(height / 10));

  // Pixelate then blur so small logos are actually unreadable (plain gaussian on a 40px crop is too weak).
  return sharp(imageBuffer)
    .extract({ left, top, width, height })
    .resize(smallW, smallH)
    .blur(3)
    .resize(width, height, { kernel: 'nearest' })
    .blur(6)
    .png()
    .toBuffer();
}

export async function blurRegions(
  absolutePath: string,
  boxes: BlurBox[],
  padding = 0,
): Promise<number> {
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist on disk: ${absolutePath}`);
  }

  const oriented = await sharp(absolutePath)
    .rotate()
    .toColourspace('srgb')
    .toBuffer();
  const metadata = await sharp(oriented).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const format =
    metadata.format === 'png' || metadata.format === 'webp'
      ? metadata.format
      : 'jpeg';

  const composites: OverlayOptions[] = [];
  for (const raw of boxes) {
    const box = clampBox(raw, width, height, padding);
    if (!box) continue;
    const overlay = await createBlurOverlay(oriented, box);
    composites.push({ input: overlay, left: box.left, top: box.top });
  }

  if (composites.length === 0) {
    throw new Error(
      `Blur region is empty or outside the image (${width}x${height}). Check coordinates.`,
    );
  }

  const output = await sharp(oriented)
    .composite(composites)
    .toFormat(format, { quality: 92 })
    .toBuffer();

  fs.writeFileSync(absolutePath, output);
  return composites.length;
}
