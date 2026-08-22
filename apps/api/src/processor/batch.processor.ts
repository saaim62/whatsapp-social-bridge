import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SocialService } from '../social/social.service';
import { ConfigService } from '@nestjs/config';

@Processor('batch-processing')
export class BatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchProcessor.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private socialService: SocialService,
    private configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'process-batch':
        return this.handleProcessBatch(job.data.batchId);
      case 'publish-batch':
        return this.handlePublishBatch(job.data.batchId);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleProcessBatch(batchId: string) {
    this.logger.log(`Processing batch ${batchId}...`);

    const batch = await this.prisma.productBatch.findUnique({
      where: { id: batchId },
      include: { mediaAssets: true },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    if (!batch.mediaAssets || batch.mediaAssets.length === 0) {
      this.logger.warn(
        `Batch ${batchId} has no media assets. Dropping casual conversation.`,
      );
      await this.prisma.productBatch.delete({ where: { id: batchId } });
      return { success: false, message: 'Dropped text-only batch' };
    }

    try {
      // 1. AI Extraction
      let extractedData: any = {};
      if (batch.rawText) {
        extractedData = await this.aiService.extractProductDetails(
          batch.rawText,
        );
      }

      // Fallbacks if AI couldn't extract or no text was provided
      if (!extractedData.product_name)
        extractedData.product_name = 'Unknown Product (No text provided)';
      if (!extractedData.price) extractedData.price = 'Price not specified';

      // 2. Generate Content
      const generatedCaptions =
        await this.aiService.generateCaptions(extractedData);

      // 3. Update DB
      await this.prisma.$transaction(async (tx) => {
        await tx.productBatch.update({
          where: { id: batchId },
          data: {
            extractedData: extractedData,
            status: 'READY',
          },
        });

        await tx.generatedContent.create({
          data: {
            batchId,
            instagramCaption: generatedCaptions.instagramCaption,
            facebookCaption: generatedCaptions.facebookCaption,
            storyText: generatedCaptions.storyText,
          },
        });
      });

      this.logger.log(`Batch ${batchId} is READY for approval.`);

      // Auto publish if configured
      const autoPublish =
        this.configService.get('AUTO_PUBLISH', 'false') === 'true';
      if (autoPublish) {
        this.logger.log(`AUTO_PUBLISH is true. Approving batch ${batchId}...`);
        await this.prisma.productBatch.update({
          where: { id: batchId },
          data: { status: 'APPROVED' },
        });
        await this.handlePublishBatch(batchId);
      }
    } catch (e) {
      this.logger.error(`Error processing batch ${batchId}`, e);
      await this.prisma.productBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED' },
      });
      throw e; // Rethrow to let BullMQ retry
    }
  }

  private async handlePublishBatch(batchId: string) {
    this.logger.log(`Publishing batch ${batchId}...`);

    await this.prisma.productBatch.update({
      where: { id: batchId },
      data: { status: 'PUBLISHING' },
    });

    const batch = await this.prisma.productBatch.findUnique({
      where: { id: batchId },
      include: { mediaAssets: true, generatedContent: true },
    });

    if (!batch || !batch.generatedContent) {
      throw new Error(`Batch ${batchId} invalid for publishing`);
    }

    let allSuccess = true;
    let anySuccess = false;

    // Instagram
    try {
      const igResult = await this.socialService.publishInstagram(batch);
      await this.prisma.publication.create({
        data: {
          batchId,
          platform: 'INSTAGRAM',
          platformPostId: igResult.id,
          status: 'PUBLISHED',
        },
      });
      anySuccess = true;
    } catch (e) {
      allSuccess = false;
      await this.prisma.publication.create({
        data: {
          batchId,
          platform: 'INSTAGRAM',
          status: 'FAILED',
          error: e.message,
        },
      });
    }

    // Facebook
    try {
      const fbResult = await this.socialService.publishFacebook(batch);
      await this.prisma.publication.create({
        data: {
          batchId,
          platform: 'FACEBOOK',
          platformPostId: fbResult.id,
          status: 'PUBLISHED',
        },
      });
      anySuccess = true;
    } catch (e) {
      allSuccess = false;
      await this.prisma.publication.create({
        data: {
          batchId,
          platform: 'FACEBOOK',
          status: 'FAILED',
          error: e.message,
        },
      });
    }

    const finalStatus = allSuccess
      ? 'PUBLISHED'
      : anySuccess
        ? 'PARTIALLY_PUBLISHED'
        : 'FAILED';

    await this.prisma.productBatch.update({
      where: { id: batchId },
      data: { status: finalStatus },
    });
  }
}
