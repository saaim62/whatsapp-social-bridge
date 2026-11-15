import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SocialService } from '../social/social.service';
import { ConfigService } from '@nestjs/config';
import {
  parsePrice,
  analyzePrice,
  computeSellingPrice,
  formatRs,
  finalizeCaption,
  PricingRule,
} from '../pricing/pricing.util';

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
        return this.handlePublishBatch(job.data.batchId, job.data.targets);
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

      // Fallbacks: NEVER set "Unknown Product (No text provided)" if rawText exists!
      if (!extractedData.product_name || extractedData.product_name.includes('Unknown Product')) {
        const heuristic = this.aiService.heuristicExtractProductDetails(batch.rawText || '');
        if (heuristic.product_name) {
          extractedData.product_name = heuristic.product_name;
        } else if (batch.rawText && batch.rawText.trim().length > 0) {
          extractedData.product_name = batch.rawText.trim().split('\n')[0].substring(0, 50);
        } else {
          extractedData.product_name = `Product [${batchId.substring(0, 8)}]`;
        }
      }
      if (!extractedData.price || extractedData.price === 'Price not specified') {
        const heuristic = this.aiService.heuristicExtractProductDetails(batch.rawText || '');
        if (heuristic.price) {
          extractedData.price = heuristic.price;
        }
      }

      // 1b. Selling price — apply the reseller's margin rule to the
      // supplier price so every surface (queue, review, publish)
      // works with the price the customer will actually see.
      // Ambiguous price text (a range, or a pack quantity like
      // "2 pcs 1850") is NEVER guessed: it is flagged for review and
      // no selling price is derived from it.
      const rule = await this.pricingRuleFor(batch.userId);
      const priceAnalysis = analyzePrice(extractedData.price);
      if (priceAnalysis.ambiguous) {
        extractedData.price_needs_review = true;
        extractedData.price_ambiguity = priceAnalysis.reason;
      }
      const selling = computeSellingPrice(priceAnalysis.price, rule);
      if (selling !== null && selling > 0) {
        extractedData.selling_price = formatRs(selling);
        extractedData.selling_price_value = selling;
      }

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

  /** The user's margin rule, with product defaults when unset. */
  private async pricingRuleFor(userId: string): Promise<PricingRule> {
    const s = await this.prisma.settings.findUnique({ where: { userId } });
    return {
      marginType: s?.marginType ?? 'PERCENT',
      marginValue: s?.marginValue ?? 30,
      priceRounding: s?.priceRounding ?? 50,
    };
  }

  private async handlePublishBatch(batchId: string, targets?: string[]) {
    this.logger.log(`Publishing batch ${batchId} to targets: ${targets?.join(', ') || 'ALL'}...`);

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

    // Finalize captions at publish time — the authoritative layer.
    // Every publish route (single, bulk, queued, auto) passes through
    // here, so the {{PRICE}} placeholder can never reach Meta and the
    // price shown is always the reseller's selling price, recomputed
    // from the CURRENT margin rule. If the review page already
    // committed a substituted caption (manual override), there is no
    // placeholder left and this is a no-op — the override wins.
    {
      const settings = await this.prisma.settings.findUnique({
        where: { userId: batch.userId },
      });
      const rule: PricingRule = {
        marginType: settings?.marginType ?? 'PERCENT',
        marginValue: settings?.marginValue ?? 30,
        priceRounding: settings?.priceRounding ?? 50,
      };
      const extracted: any = batch.extractedData || {};
      const gc: any = batch.generatedContent;
      const captions = [gc.instagramCaption, gc.facebookCaption, gc.storyText];
      const hasPlaceholder = captions.some((c) => (c ?? '').includes('{{PRICE}}'));
      // An explicit manual price override set on the batch wins over
      // every derived value. (The review page's other override path —
      // committing captions with the price already substituted, leaving
      // no {{PRICE}} placeholder — is honored below: with no placeholder
      // there is nothing to substitute, so the block does not apply.)
      const manualOverride =
        typeof extracted.manual_price_override === 'number' &&
        extracted.manual_price_override > 0
          ? extracted.manual_price_override
          : null;
      const selling =
        manualOverride ??
        computeSellingPrice(parsePrice(extracted.price), rule) ??
        (typeof extracted.selling_price_value === 'number'
          ? extracted.selling_price_value
          : null);

      // PRICE SAFETY GATE: never publish a zero or unknown price.
      // If the captions still carry {{PRICE}} and no valid selling
      // price exists (unparseable/ambiguous supplier text, or a margin
      // rule that computes to 0), publishing would substitute garbage
      // or "Rs. 0" into a live listing. Send the batch back to the
      // review queue and tell the user instead.
      if (hasPlaceholder && (selling === null || selling <= 0)) {
        this.logger.warn(
          `Publishing blocked for batch ${batchId}: no valid selling price (supplier price text: ${JSON.stringify(extracted.price ?? null)}). Sent back to review.`,
        );
        await this.prisma.productBatch.update({
          where: { id: batchId },
          data: { status: 'READY' },
        });
        await this.prisma.notification.create({
          data: {
            userId: batch.userId,
            title: 'Publishing blocked — price needs review',
            message:
              'A product could not be published because its price could not be determined safely. Open it, set the price, and publish again.',
            type: 'warning',
            link: `/products/${batchId}`,
          },
        });
        return;
      }

      const sellingStr =
        selling !== null && selling > 0 ? formatRs(selling) : (extracted.price ?? '');
      const footer = settings?.captionFooter ?? null;
      batch.generatedContent = {
        ...gc,
        instagramCaption: finalizeCaption(gc.instagramCaption, sellingStr, footer),
        facebookCaption: finalizeCaption(gc.facebookCaption, sellingStr, footer),
        storyText: finalizeCaption(gc.storyText, sellingStr, null, false),
      };
    }

    let allSuccess = true;
    let anySuccess = false;

    const publishTargets = (targets && targets.length > 0) ? targets : ['INSTAGRAM', 'FACEBOOK'];

    // Instagram Feed
    if (publishTargets.includes('INSTAGRAM')) {
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
    }

    // Instagram Story
    if (publishTargets.includes('INSTAGRAM_STORY')) {
      try {
        const igStoryResult = await this.socialService.publishInstagramStory(batch);
        await this.prisma.publication.create({
          data: {
            batchId,
            platform: 'INSTAGRAM_STORY',
            platformPostId: igStoryResult.id,
            status: 'PUBLISHED',
          },
        });
        anySuccess = true;
      } catch (e) {
        allSuccess = false;
        await this.prisma.publication.create({
          data: {
            batchId,
            platform: 'INSTAGRAM_STORY',
            status: 'FAILED',
            error: e.message,
          },
        });
      }
    }

    // Facebook Feed
    if (publishTargets.includes('FACEBOOK')) {
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
    }

    // Facebook Story
    if (publishTargets.includes('FACEBOOK_STORY')) {
      try {
        const fbStoryResult = await this.socialService.publishFacebookStory(batch);
        await this.prisma.publication.create({
          data: {
            batchId,
            platform: 'FACEBOOK_STORY',
            platformPostId: fbStoryResult.id,
            status: 'PUBLISHED',
          },
        });
        anySuccess = true;
      } catch (e) {
        allSuccess = false;
        await this.prisma.publication.create({
          data: {
            batchId,
            platform: 'FACEBOOK_STORY',
            status: 'FAILED',
            error: e.message,
          },
        });
      }
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
