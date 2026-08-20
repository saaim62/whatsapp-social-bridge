import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { SettingsService } from '../settings/settings.service';

@Processor('history-sync-queue', {
  concurrency: 1, // Ensure strict sequence to avoid blowing up memory/rate limits
})
export class HistoryProcessor extends WorkerHost {
  private readonly logger = new Logger(HistoryProcessor.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly settingsService: SettingsService,
  ) {
    super();
  }

  async process(job: Job<any[]>): Promise<any> {
    // Check if sync is enabled before processing stale/queued jobs
    const settings = await this.settingsService.getSettings();
    if (!settings.isSyncActive) {
      this.logger.log('Sync is paused. Discarding historical bundle job.');
      return;
    }

    const bundle = job.data;
    if (!bundle || !Array.isArray(bundle) || bundle.length === 0) return;

    this.logger.log(`Processing historical bundle of ${bundle.length} messages from ${bundle[0]?.key?.remoteJid}`);

    // Process all messages in this bundle (they are from the same sender and same time window)
    for (const msg of bundle) {
      try {
        await this.whatsappService.handleIncomingMessage(msg);
      } catch (err) {
        this.logger.error(`Failed to process historical message ${msg.key?.id}`, err);
      }
    }

    this.logger.log(`Completed historical bundle. Delaying next job to prevent rate limits...`);
    
    // Crucial: Wait a significant amount of time so the debounce window in batch.service.ts (30s) CLOSES
    // and sends this bundle to AI, before we start the next bundle.
    // Also gives the AI service time to process it silently.
    await new Promise(resolve => setTimeout(resolve, 40000)); // 40 seconds
  }
}
