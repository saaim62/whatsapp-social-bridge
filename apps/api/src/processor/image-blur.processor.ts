import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ai/ocr.service';
import * as fs from 'fs';
import * as path from 'path';
const sharp = require('sharp');

@Processor('image-blur')
export class ImageBlurProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageBlurProcessor.name);

  constructor(
    private prisma: PrismaService,
    private ocrService: OcrService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { mediaId, localPath } = job.data;
    this.logger.log(`Processing image-blur for media ${mediaId}`);

    try {
      await this.detectAndBlurLogo(mediaId, localPath);
    } finally {
      // Ensure we clear the processing state regardless of success or failure
      await this.prisma.mediaAsset.update({
        where: { id: mediaId },
        data: { isProcessing: false },
      });
    }
  }

  private async detectAndBlurLogo(mediaId: string, localPath: string) {
    let actualLocalPath = localPath;
    if (actualLocalPath.startsWith('api/')) {
      actualLocalPath = actualLocalPath.substring(4); // Remove 'api/' prefix for filesystem path
    }
    const absolutePath = path.join(process.cwd(), actualLocalPath);

    if (!fs.existsSync(absolutePath)) {
      this.logger.warn(`Media file not found at ${absolutePath}`);
      return;
    }

    const detectedBrands = await this.ocrService.detectBrandLogos(absolutePath);
    let needsManualReview = false;
    let minConfidence = 1.0;

    if (detectedBrands.length > 0) {
      try {
        let imageBuffer = fs.readFileSync(absolutePath);
        
        // Save backup for reverting later
        const ext = path.extname(absolutePath);
        const originalPath = absolutePath.replace(ext, `_original${ext}`);
        if (!fs.existsSync(originalPath)) {
           fs.writeFileSync(originalPath, imageBuffer);
        }

        for (const box of detectedBrands) {
          if (box.confidence !== undefined && box.confidence < minConfidence) {
            minConfidence = box.confidence;
          }

          if (box.confidence !== undefined && box.confidence < 0.85) {
            this.logger.warn(`Low confidence detection (${box.confidence}) for brand ${box.brand}. Flagging for review, but still blurring!`);
            needsManualReview = true;
          }

          const metadata = await sharp(imageBuffer).metadata();
          
          if (box.polygon) {
            const padding = 25;
            const targetLeft = box.left - padding;
            const targetTop = box.top - padding;
            const targetWidth = box.width + padding * 2;
            const targetHeight = box.height + padding * 2;

            const left = Math.max(0, Math.min(metadata.width! - 1, Math.round(targetLeft)));
            const top = Math.max(0, Math.min(metadata.height! - 1, Math.round(targetTop)));
            const width = Math.max(1, Math.min(metadata.width! - left, Math.round(targetWidth)));
            const height = Math.max(1, Math.min(metadata.height! - top, Math.round(targetHeight)));

            const localizedSvgPoints = box.polygon.map((p: any) => `${p[0] - left},${p[1] - top}`).join(' ');
            const maskSvg = `<svg width="${width}" height="${height}"><polygon points="${localizedSvgPoints}" fill="white" /></svg>`;

            const maskBuffer = await sharp(Buffer.from(maskSvg))
              .blur(2)
              .toBuffer();

            const blurredCrop = await sharp(imageBuffer)
              .extract({ left, top, width, height })
              .blur(25)
              .toBuffer();

            const maskedBlurred = await sharp(blurredCrop)
              .composite([{ input: maskBuffer, blend: 'dest-in' }])
              .png()
              .toBuffer();

            imageBuffer = await sharp(imageBuffer)
              .composite([{ input: maskedBlurred, left, top }])
              .toBuffer();
          } else {
             const padding = 25;
             const targetLeft = box.left - padding;
             const targetTop = box.top - padding;
             const targetWidth = box.width + padding * 2;
             const targetHeight = box.height + padding * 2;

             const left = Math.max(0, Math.min(metadata.width! - 1, Math.round(targetLeft)));
             const top = Math.max(0, Math.min(metadata.height! - 1, Math.round(targetTop)));
             const width = Math.max(1, Math.min(metadata.width! - left, Math.round(targetWidth)));
             const height = Math.max(1, Math.min(metadata.height! - top, Math.round(targetHeight)));

             const blurredRegion = await sharp(imageBuffer)
              .extract({ left, top, width, height })
              .blur(25) 
              .toBuffer();

             imageBuffer = await sharp(imageBuffer)
              .composite([{ input: blurredRegion, left, top }])
              .toBuffer();
          }
        }

        fs.writeFileSync(absolutePath, imageBuffer);
        this.logger.log(`Automatically processed logos for media ${mediaId}`);
      } catch (err) {
        this.logger.error(`Failed to apply auto-blur on media ${mediaId}`, err);
        throw err;
      }
    }

    await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        ocrConfidence: detectedBrands.length > 0 ? minConfidence : null,
        needsManualReview: needsManualReview,
      },
    });
  }
}
