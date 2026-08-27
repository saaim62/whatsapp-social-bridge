import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
const sharp = require('sharp');
import { AiService } from '../ai/ai.service';
import { OcrService } from '../ai/ocr.service';
import {
  blurRegions,
  isMaskableImage,
  normalizeImageFile,
} from '../ai/image-mask.util';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  // For MVP, simplistic in-memory lock/debounce
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private processingLocks: Map<string, Promise<void>> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private aiService: AiService,
    private ocrService: OcrService,
    @InjectQueue('batch-processing') private batchQueue: Queue,
    @InjectQueue('history-sync-queue') private historySyncQueue: Queue,
    @InjectQueue('image-blur') private imageBlurQueue: Queue,
  ) {}

  async queueHistoryMessage(message: any) {
    await this.historySyncQueue.add('process-history-message', message);
  }

  async handleMessage(message: any) {
    const from = message.from;
    const userId = message.userId;
    if (!userId || !from) return;

    const lockKey = `${userId}-${from}`;
    const currentLock = this.processingLocks.get(lockKey) || Promise.resolve();

    const nextLock = currentLock.then(async () => {
      try {
        await this._handleMessage(message);
      } catch (err) {
        this.logger.error(`Error processing message in lock chain for ${lockKey}`, err);
      }
    }).catch(() => {});

    this.processingLocks.set(lockKey, nextLock);
    await nextLock;
  }

  private async _handleMessage(message: any) {
    // 1. Extract info from message
    const messageId = message.id;
    const from = message.from; // Sender ID (conversation)
    const senderName = message.senderName || '';
    const timestamp = parseInt(message.timestamp, 10);
    const type = message.type; // 'text', 'image', etc.
    const userId = message.userId;

    let textContent = '';
    let mediaId: string | null = null;
    let mimeType: string | null = null;
    let localPath: string | null = null;

    if (type === 'text') {
      textContent = message.text?.body || '';
    } else if (type === 'image') {
      mediaId = message.image?.id;
      mimeType = message.image?.mime_type;
      textContent = message.image?.caption || '';
      localPath = message._localPath || null;

      if (!localPath && mediaId) {
        localPath = await this.downloadWhatsappMedia(mediaId);
      }
    }

    this.logger.log(
      `BatchService extraction -> type: ${type}, mediaId: ${mediaId}, textLength: ${textContent?.length}`,
    );

    // 2. State Machine logic to slice batches
    let activeBatch = await this.prisma.productBatch.findFirst({
      where: {
        status: 'RECEIVED',
        senderId: from,
        userId: userId,
      },
      include: { mediaAssets: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    const isMediaMsg = !!mediaId;
    const isDescMsg = textContent.trim().length > 15;

    let shouldCreateNew = !activeBatch;

    if (activeBatch && (isMediaMsg || isDescMsg)) {
      const batchHasMedia = activeBatch.mediaAssets.length > 0;
      const batchHasDesc =
        !!activeBatch.rawText && activeBatch.rawText.trim().length > 15;

      let firstItemType = 'desc';
      if (batchHasMedia && !batchHasDesc) firstItemType = 'media';
      else if (batchHasMedia && batchHasDesc) {
        const firstMediaTime =
          activeBatch.mediaAssets[0]?.createdAt.getTime() || 0;
        const batchTime = activeBatch.createdAt.getTime();
        // If first media was created within 100ms of batch creation, media came first.
        if (firstMediaTime <= batchTime + 100) {
          firstItemType = 'media';
        }
      }

      if (isDescMsg && !isMediaMsg) {
        if (batchHasDesc) shouldCreateNew = true;
      } else if (isMediaMsg && !isDescMsg) {
        if (
          batchHasDesc &&
          (firstItemType === 'media' || firstItemType === 'both')
        )
          shouldCreateNew = true;
      } else if (isMediaMsg && isDescMsg) {
        if (batchHasDesc) shouldCreateNew = true;
      }
    }

    if (shouldCreateNew) {
      if (activeBatch) {
        // Immediately close the old batch!
        this.logger.log(
          `State machine slicing batch ${activeBatch.id}. Queueing processing immediately.`,
        );
        await this.prisma.productBatch.update({
          where: { id: activeBatch.id, userId },
          data: { status: 'PROCESSING' },
        });
        await this.batchQueue.add('process-batch', { batchId: activeBatch.id, userId });
        if (this.activeTimeouts.has(activeBatch.id)) {
          clearTimeout(this.activeTimeouts.get(activeBatch.id));
          this.activeTimeouts.delete(activeBatch.id);
        }
      }

      try {
        activeBatch = await this.prisma.productBatch.create({
          data: {
            userId: userId,
            whatsappMessageId: messageId,
            senderId: from,
            senderName: senderName,
            rawText: textContent,
            status: 'RECEIVED',
          },
          include: { mediaAssets: true },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          this.logger.warn(
            `Duplicate webhook or test message received for ID ${messageId}. Ignoring.`,
          );
          return;
        }
        throw err;
      }
    } else if (activeBatch) {
      // Append text if any
      if (textContent) {
        await this.prisma.productBatch.update({
          where: { id: activeBatch.id },
          data: {
            rawText: activeBatch.rawText
              ? `${activeBatch.rawText}\n${textContent}`
              : textContent,
          },
        });
      }
    }

    // Add media
    if (mediaId && activeBatch) {
      const isVideo = mimeType?.startsWith('video/');
      const media = await this.prisma.mediaAsset.create({
        data: {
          batchId: activeBatch.id,
          whatsappMediaId: mediaId,
          mimeType: mimeType,
          localPath: localPath,
          isProcessing: !isVideo,
        },
      });

      if (localPath && !isVideo) {
        await this.imageBlurQueue.add(
          'blur-image',
          { mediaId: media.id, localPath: localPath },
          { jobId: `blur-${media.id}` }
        );
      }
    }

    // 3. Debounce processing as a fallback
    if (!activeBatch) return;

    const batchWindowStr = this.configService.get('BATCH_WINDOW_SECONDS', '30');
    const batchWindowMs = parseInt(batchWindowStr, 10) * 1000;

    if (this.activeTimeouts.has(activeBatch.id)) {
      clearTimeout(this.activeTimeouts.get(activeBatch.id));
    }

    const timeout = setTimeout(async () => {
      try {
        this.logger.log(
          `Fallback window closed for ${activeBatch.id}. Queueing processing.`,
        );
        await this.prisma.productBatch.update({
          where: { id: activeBatch.id, userId },
          data: { status: 'PROCESSING' },
        });
        await this.batchQueue.add('process-batch', { batchId: activeBatch.id, userId });
      } catch (err) {
        this.logger.warn(`Could not update batch ${activeBatch.id} - it may have been deleted.`);
      } finally {
        this.activeTimeouts.delete(activeBatch.id);
      }
    }, batchWindowMs);

    this.activeTimeouts.set(activeBatch.id, timeout);
  }

  // Dashboard API
  async getBatches(userId: string) {
    return this.prisma.productBatch.findMany({
      where: { userId },
      include: {
        mediaAssets: true,
        generatedContent: true,
        publications: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBatch(id: string, userId: string) {
    return this.prisma.productBatch.findUnique({
      where: { id, userId },
      include: {
        mediaAssets: true,
        generatedContent: true,
        publications: true,
      },
    });
  }

  async approveBatch(id: string, body: any, userId: string) {
    if (body) {
      const { instagramCaption, facebookCaption, storyText } = body;

      const batch = await this.prisma.productBatch.findUnique({
        where: { id, userId },
        include: { generatedContent: true },
      });

      if (batch && batch.generatedContent) {
        await this.prisma.generatedContent.update({
          where: { id: batch.generatedContent.id },
          data: {
            instagramCaption:
              instagramCaption ?? batch.generatedContent.instagramCaption,
            facebookCaption:
              facebookCaption ?? batch.generatedContent.facebookCaption,
            storyText: storyText ?? batch.generatedContent.storyText,
          },
        });
      }
    }

    await this.prisma.productBatch.update({
      where: { id, userId },
      data: { status: 'APPROVED' },
    });
    await this.batchQueue.add('publish-batch', { batchId: id, userId });
    return { success: true };
  }

  async publishBatch(id: string, userId: string) {
    const batch = await this.prisma.productBatch.findUnique({ where: { id, userId }});
    if (!batch) return { success: false, message: 'Batch not found' };
    
    await this.batchQueue.add('publish-batch', { batchId: id, userId });
    return { success: true };
  }

  async rejectBatch(id: string, userId: string) {
    await this.prisma.productBatch.update({
      where: { id, userId },
      data: { status: 'FAILED' },
    });
    return { success: true };
  }

  async deleteBatch(id: string, userId: string) {
    const batch = await this.prisma.productBatch.findUnique({
      where: { id, userId },
      include: { mediaAssets: true },
    });

    if (!batch) {
      return { success: false, message: 'Batch not found' };
    }

    // Delete physical files
    for (const media of batch.mediaAssets) {
      if (media.localPath) {
        const absolutePath = path.join(process.cwd(), media.localPath.replace(/^api\//, ''));
        if (fs.existsSync(absolutePath)) {
          try {
            fs.unlinkSync(absolutePath);
            this.logger.log(`Deleted physical file: ${absolutePath}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${absolutePath}`, err);
          }
        }

        const ext = path.extname(absolutePath);
        const originalPath = absolutePath.replace(ext, `_original${ext}`);
        if (fs.existsSync(originalPath)) {
          try {
            fs.unlinkSync(originalPath);
            this.logger.log(`Deleted physical original file: ${originalPath}`);
          } catch (err) {
            this.logger.error(`Failed to delete original file: ${originalPath}`, err);
          }
        }
      }
    }

    await this.prisma.productBatch.delete({ where: { id } });
    return { success: true };
  }

  async deleteMedia(mediaId: string, userId: string) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: { batch: true },
    });
    if (!media || media.batch.userId !== userId) return { success: false, message: 'Media not found' };

    // 3. Delete physical file
    if (media.localPath) {
      const absolutePath = path.join(process.cwd(), media.localPath.replace(/^api\//, ''));
      if (fs.existsSync(absolutePath)) {
        try {
          fs.unlinkSync(absolutePath);
        } catch (err) {
          this.logger.error(`Failed to delete file: ${absolutePath}`, err);
        }
      }

      const ext = path.extname(absolutePath);
      const originalPath = absolutePath.replace(ext, `_original${ext}`);
      if (fs.existsSync(originalPath)) {
        try {
          fs.unlinkSync(originalPath);
        } catch (err) {
          this.logger.error(`Failed to delete original file: ${originalPath}`, err);
        }
      }
    }

    await this.prisma.mediaAsset.delete({ where: { id: mediaId } });
    return { success: true };
  }

  async maskMediaLogo(
    mediaId: string,
    boxes: { left: number; top: number; width: number; height: number }[],
    userId: string,
  ) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: { batch: true },
    });
    if (!media || media.batch.userId !== userId || !media.localPath) {
      return { success: false, message: 'Media or local file not found' };
    }

    const absolutePath = path.join(process.cwd(), media.localPath.replace(/^api\//, ''));
    if (!fs.existsSync(absolutePath)) {
      return { success: false, message: 'File does not exist on disk' };
    }

    // Stop auto-blur if it is in progress
    await this.stopMediaBlur(mediaId, userId);

    try {
      let imageBuffer = fs.readFileSync(absolutePath);
      
      // Save backup for reverting later if not exists
      const ext = path.extname(absolutePath);
      const originalPath = absolutePath.replace(ext, `_original${ext}`);
      if (!fs.existsSync(originalPath)) {
         fs.writeFileSync(originalPath, imageBuffer);
      }
      
      for (const box of boxes) {
        const metadata = await sharp(imageBuffer).metadata();

        const left = Math.max(
          0,
          Math.min(metadata.width! - 1, Math.round(box.left)),
        );
        const top = Math.max(
          0,
          Math.min(metadata.height! - 1, Math.round(box.top)),
        );
        const width = Math.min(
          metadata.width! - left,
          Math.max(1, Math.round(box.width)),
        );
        const height = Math.min(
          metadata.height! - top,
          Math.max(1, Math.round(box.height)),
        );

        const croppedArea = await sharp(imageBuffer)
          .extract({ left, top, width, height })
          .blur(15)
          .toBuffer();

        imageBuffer = await sharp(imageBuffer)
          .composite([{ input: croppedArea, left, top }])
          .toBuffer();
      }

      fs.writeFileSync(absolutePath, imageBuffer);
      return { success: true, message: 'Logos masked successfully' };
    } catch (e: any) {
      this.logger.error(`Failed to mask logo for media ${mediaId}`, e);
      return { success: false, message: e.message || 'Failed to mask logo' };
    }
  }

  async revertMediaLogo(mediaId: string, userId: string) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: { batch: true },
    });
    if (!media || media.batch.userId !== userId || !media.localPath) {
      return { success: false, message: 'Media or local file not found' };
    }

    const absolutePath = path.join(process.cwd(), media.localPath.replace(/^api\//, ''));
    const ext = path.extname(absolutePath);
    const originalPath = absolutePath.replace(ext, `_original${ext}`);
    
    if (fs.existsSync(originalPath)) {
      try {
        fs.copyFileSync(originalPath, absolutePath);
        return { success: true, message: 'Image reverted to original successfully' };
      } catch (e: any) {
        this.logger.error(`Failed to revert logo for media ${mediaId}`, e);
        return { success: false, message: 'Failed to copy backup file' };
      }
    } else {
      return { success: false, message: 'No backup found to revert' };
    }
  }



  private async downloadWhatsappMedia(mediaId: string): Promise<string | null> {
    const token = this.configService.get('WHATSAPP_ACCESS_TOKEN');
    if (!token || token === 'test_token') {
      this.logger.warn(
        'No valid WHATSAPP_ACCESS_TOKEN. Cannot download media.',
      );
      return null;
    }

    try {
      this.logger.log(`Fetching media URL for WhatsApp media: ${mediaId}`);
      // 1. Get Media URL
      const res = await axios.get(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const mediaUrl = res.data.url;
      const mimeType = res.data.mime_type;

      // 2. Download Binary
      const ext = mimeType.split('/')[1] || 'jpeg';
      const fileName = `${mediaId}.${ext}`;
      const localPath = `api/uploads/${fileName}`;
      const absolutePath = path.join(process.cwd(), 'uploads', fileName);

      this.logger.log(`Downloading media binary from: ${mediaUrl}`);
      const downloadRes = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(absolutePath);
      downloadRes.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(undefined));
        writer.on('error', reject);
      });

      this.logger.log(`Successfully downloaded WhatsApp media: ${localPath}`);
      return localPath;
    } catch (err: any) {
      this.logger.error(
        `Failed to download WhatsApp media ${mediaId}`,
        err.response?.data || err.message,
      );
      return null;
    }
  }

  async stopMediaBlur(mediaId: string, userId: string) {
    try {
      const media = await this.prisma.mediaAsset.findUnique({
        where: { id: mediaId },
        include: { batch: true },
      });
      if (!media || media.batch.userId !== userId) {
        return { success: false, message: 'Media not found' };
      }

      // Try to remove by jobId if it's waiting
      const job = await this.imageBlurQueue.getJob(`blur-${mediaId}`);
      if (job) {
        const state = await job.getState();
        if (state === 'waiting' || state === 'delayed') {
          await job.remove();
          this.logger.log(`Removed waiting blur job for media ${mediaId}`);
        }
      }
      
      // Fallback: iterate over waiting just in case it was queued without jobId
      const waitingJobs = await this.imageBlurQueue.getWaiting();
      for (const wJob of waitingJobs) {
        if (wJob.data && wJob.data.mediaId === mediaId) {
          await wJob.remove();
        }
      }

      await this.prisma.mediaAsset.update({
        where: { id: mediaId },
        data: { isProcessing: false },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error stopping blur for media ${mediaId}:`, error);
      return { success: false, message: 'Failed to stop blur process' };
    }
  }
}
