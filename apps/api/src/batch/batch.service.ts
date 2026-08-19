import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);
  
  // For MVP, simplistic in-memory lock/debounce
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @InjectQueue('batch-processing') private batchQueue: Queue,
  ) {}

  async handleMessage(message: any) {
    // 1. Extract info from message
    const messageId = message.id;
    const from = message.from; // Sender ID (conversation)
    const timestamp = parseInt(message.timestamp, 10);
    const type = message.type; // 'text', 'image', etc.

    let textContent = '';
    let mediaId = null;
    let mimeType = null;
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

    // 2. Find or create active batch for this sender
    // We look for a batch that is still in "RECEIVED" state
    let activeBatch = await this.prisma.productBatch.findFirst({
      where: {
        status: 'RECEIVED',
        // In a real app, we'd filter by sender ID, assuming we add senderId to ProductBatch
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeBatch) {
      try {
        activeBatch = await this.prisma.productBatch.create({
          data: {
            whatsappMessageId: messageId,
            rawText: textContent,
            status: 'RECEIVED',
          },
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          this.logger.warn(`Duplicate webhook or test message received for ID ${messageId}. Ignoring.`);
          return;
        }
        throw err;
      }
    } else {
      // Append text if any
      if (textContent) {
        await this.prisma.productBatch.update({
          where: { id: activeBatch.id },
          data: { rawText: activeBatch.rawText ? `${activeBatch.rawText}\n${textContent}` : textContent },
        });
      }
    }

    // Add media if image
    if (mediaId) {
      await this.prisma.mediaAsset.create({
        data: {
          batchId: activeBatch.id,
          whatsappMediaId: mediaId,
          mimeType: mimeType,
          localPath: localPath,
        },
      });
    }

    // 3. Debounce processing
    const batchWindowStr = this.configService.get('BATCH_WINDOW_SECONDS', '30');
    const batchWindowMs = parseInt(batchWindowStr, 10) * 1000;

    if (this.activeTimeouts.has(activeBatch.id)) {
      clearTimeout(this.activeTimeouts.get(activeBatch.id));
    }

    const timeout = setTimeout(async () => {
      this.logger.log(`Batch window closed for ${activeBatch.id}. Queueing processing.`);
      await this.prisma.productBatch.update({
        where: { id: activeBatch.id },
        data: { status: 'PROCESSING' },
      });
      await this.batchQueue.add('process-batch', { batchId: activeBatch.id });
      this.activeTimeouts.delete(activeBatch.id);
    }, batchWindowMs);

    this.activeTimeouts.set(activeBatch.id, timeout);
  }

  // Dashboard API
  async getBatches() {
    return this.prisma.productBatch.findMany({
      include: {
        mediaAssets: true,
        generatedContent: true,
        publications: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBatch(id: string) {
    return this.prisma.productBatch.findUnique({
      where: { id },
      include: {
        mediaAssets: true,
        generatedContent: true,
        publications: true,
      },
    });
  }

  async approveBatch(id: string, body?: any) {
    if (body) {
      const { instagramCaption, facebookCaption, storyText } = body;
      
      const batch = await this.prisma.productBatch.findUnique({
        where: { id },
        include: { generatedContent: true }
      });

      if (batch && batch.generatedContent) {
        await this.prisma.generatedContent.update({
          where: { id: batch.generatedContent.id },
          data: {
            instagramCaption: instagramCaption ?? batch.generatedContent.instagramCaption,
            facebookCaption: facebookCaption ?? batch.generatedContent.facebookCaption,
            storyText: storyText ?? batch.generatedContent.storyText,
          }
        });
      }
    }

    await this.prisma.productBatch.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
    await this.batchQueue.add('publish-batch', { batchId: id });
    return { success: true };
  }

  async publishBatch(id: string) {
    await this.batchQueue.add('publish-batch', { batchId: id });
    return { success: true };
  }

  async rejectBatch(id: string) {
    await this.prisma.productBatch.update({
      where: { id },
      data: { status: 'FAILED' },
    });
    return { success: true };
  }

  private async downloadWhatsappMedia(mediaId: string): Promise<string | null> {
    const token = this.configService.get('WHATSAPP_ACCESS_TOKEN');
    if (!token || token === 'test_token') {
      this.logger.warn('No valid WHATSAPP_ACCESS_TOKEN. Cannot download media.');
      return null;
    }

    try {
      this.logger.log(`Fetching media URL for WhatsApp media: ${mediaId}`);
      // 1. Get Media URL
      const res = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const mediaUrl = res.data.url;
      const mimeType = res.data.mime_type;

      // 2. Download Binary
      const ext = mimeType.split('/')[1] || 'jpeg';
      const fileName = `${mediaId}.${ext}`;
      const localPath = `uploads/${fileName}`;
      const absolutePath = path.join(process.cwd(), localPath);

      this.logger.log(`Downloading media binary from: ${mediaUrl}`);
      const downloadRes = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'stream'
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
      this.logger.error(`Failed to download WhatsApp media ${mediaId}`, err.response?.data || err.message);
      return null;
    }
  }
}
