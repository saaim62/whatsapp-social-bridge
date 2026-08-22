import { PrismaClient } from '@prisma/client';
import { OcrService } from './src/ai/ocr.service';
import * as path from 'path';
import * as fs from 'fs';
const sharp = require('sharp');

async function testAutoBlur() {
  const ocrService = new OcrService();
  const absolutePath = path.join(process.cwd(), 'uploads/3BE7C79D7292CE26550A.jpeg');
  const outPath = path.join(process.cwd(), 'uploads/3BE7C79D7292CE26550A_blurred.jpeg');
  
  // create a copy for testing
  if (!fs.existsSync(absolutePath)) {
    console.error(`Source image not found at ${absolutePath}`);
    return;
  }
  fs.copyFileSync(absolutePath, outPath);

  const detectedBrands = await ocrService.detectBrandLogos(outPath);
  console.log('Detected brands:', detectedBrands);

  if (detectedBrands.length > 0) {
    let imageBuffer = fs.readFileSync(outPath);
    const metadata = await sharp(imageBuffer).metadata();

    for (const box of detectedBrands) {
        const left = Math.max(
        0,
        Math.min(metadata.width! - 1, Math.round(box.left) - 10),
        );
        const top = Math.max(
        0,
        Math.min(metadata.height! - 1, Math.round(box.top) - 10),
        );
        const width = Math.min(
        metadata.width! - left,
        Math.max(1, Math.round(box.width) + 20),
        );
        const height = Math.min(
        metadata.height! - top,
        Math.max(1, Math.round(box.height) + 20),
        );

        const croppedArea = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .blur(15)
        .toBuffer();

        imageBuffer = await sharp(imageBuffer)
        .composite([{ input: croppedArea, left, top }])
        .toBuffer();
    }

    fs.writeFileSync(outPath, imageBuffer);
    console.log(`Successfully blurred ${detectedBrands.length} logos. Saved to ${outPath}`);
  } else {
    console.log("No brands detected to blur.");
  }
}

testAutoBlur();
