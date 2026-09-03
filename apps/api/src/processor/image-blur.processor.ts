import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ai/ocr.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from '../storage/storage.service';
const sharp = require('sharp');

@Processor('image-blur')
export class ImageBlurProcessor extends WorkerHost implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImageBlurProcessor.name);
  private redisClient: Redis;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private ocrService: OcrService,
    private configService: ConfigService,
    private storageService: StorageService,
  ) {
    super();
    this.redisClient = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
  }

  onModuleInit() {
    this.logger.log('ImageBlurProcessor initialized. Starting heartbeat...');
    // Emit heartbeat every 10 seconds
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.redisClient.set('mac_worker_online', 'true', 'EX', 15);
      } catch (err) {
        this.logger.error('Failed to emit heartbeat to Redis', err);
      }
    }, 10000);
    // Initial heartbeat
    this.redisClient.set('mac_worker_online', 'true', 'EX', 15).catch(err => this.logger.error(err));
  }

  onModuleDestroy() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.redisClient.del('mac_worker_online').catch(() => {});
    this.redisClient.quit();
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
            // Adaptive padding: proportional to text size (min 3px, max 10px)
            const textSize = Math.max(box.width, box.height);
            const padding = Math.max(3, Math.min(10, Math.round(textSize * 0.04)));
            
            // Adaptive blur radius: proportional to text size (min 5, max 15)
            const blurRadius = Math.max(5, Math.min(15, Math.round(textSize * 0.06)));
            
            const targetLeft = box.left - padding;
            const targetTop = box.top - padding;
            const targetWidth = box.width + padding * 2;
            const targetHeight = box.height + padding * 2;

            const left = Math.max(0, Math.min(metadata.width! - 1, Math.round(targetLeft)));
            const top = Math.max(0, Math.min(metadata.height! - 1, Math.round(targetTop)));
            const width = Math.max(1, Math.min(metadata.width! - left, Math.round(targetWidth)));
            const height = Math.max(1, Math.min(metadata.height! - top, Math.round(targetHeight)));

            // Create a polygon mask with slight feathering for smooth edges
            const localizedSvgPoints = box.polygon.map((p: any) => `${p[0] - left},${p[1] - top}`).join(' ');
            const feather = Math.max(1, Math.round(padding * 0.5));
            const maskSvg = `<svg width="${width}" height="${height}">
              <defs><filter id="f"><feGaussianBlur stdDeviation="${feather}"/></filter></defs>
              <polygon points="${localizedSvgPoints}" fill="white" filter="url(#f)" />
            </svg>`;

            const maskBuffer = await sharp(Buffer.from(maskSvg))
              .toBuffer();

            const blurredCrop = await sharp(imageBuffer)
              .extract({ left, top, width, height })
              .blur(blurRadius)
              .toBuffer();

            const maskedBlurred = await sharp(blurredCrop)
              .composite([{ input: maskBuffer, blend: 'dest-in' }])
              .png()
              .toBuffer();

            imageBuffer = await sharp(imageBuffer)
              .composite([{ input: maskedBlurred, left, top }])
              .toBuffer();
          } else {
             // Fallback: adaptive rectangular blur
             const textSize = Math.max(box.width, box.height);
             const padding = Math.max(3, Math.min(10, Math.round(textSize * 0.04)));
             const blurRadius = Math.max(5, Math.min(15, Math.round(textSize * 0.06)));
             
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
              .blur(blurRadius) 
              .toBuffer();

             imageBuffer = await sharp(imageBuffer)
              .composite([{ input: blurredRegion, left, top }])
              .toBuffer();
          }
        }

        fs.writeFileSync(absolutePath, imageBuffer);
        this.logger.log(`Automatically processed logos for media ${mediaId}`);

        // Re-upload the blurred image to R2
        try {
          const fileName = path.basename(absolutePath);
          const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
          const r2Url = await this.storageService.uploadBuffer(imageBuffer, fileName, mimeType);
          this.logger.log(`Re-uploaded blurred image to R2: ${r2Url}`);
          
          await this.prisma.mediaAsset.update({
            where: { id: mediaId },
            data: { originalUrl: r2Url },
          });
        } catch (r2Err) {
          this.logger.error(`Failed to re-upload blurred image to R2`, r2Err);
        }
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
