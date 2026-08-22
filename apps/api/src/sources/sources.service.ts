import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
  ) {}

  async getSources() {
    return this.prisma.whatsappSource.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async toggleSource(id: string, isEnabled: boolean) {
    return this.prisma.whatsappSource.update({
      where: { id },
      data: { isEnabled },
    });
  }

  async deleteSource(id: string) {
    return this.prisma.whatsappSource.delete({
      where: { id },
    });
  }

  async syncGroups() {
    try {
      const client = this.whatsappService.getClient();
      if (!client) {
        throw new Error('WhatsApp client not ready');
      }

      const groups = await client.groupFetchAllParticipating();
      let syncedCount = 0;
      
      const meId = client.user?.id?.split(':')[0]; // Base phone number without device ID
      const activeGroupJids: string[] = [];

      for (const jid in groups) {
        // Fetch full metadata to guarantee we have the participants list
        let groupMeta;
        try {
          groupMeta = await client.groupMetadata(jid);
        } catch (e) {
          this.logger.warn(`Could not fetch metadata for group ${jid}, skipping.`);
          continue;
        }
        
        let isActiveParticipant = true;
        if (meId && groupMeta.participants) {
          const myLid = client.authState?.creds?.me?.lid?.split(':')[0] || '';
          isActiveParticipant = groupMeta.participants.some((p: any) => {
             return p.id.includes(meId) || 
                    (client.user?.id && p.id.includes(client.user.id.split('@')[0])) || 
                    (myLid && p.id.includes(myLid));
          });
        }
        
        if (!isActiveParticipant) {
          continue; // Skip groups the user is no longer in
        }
        
        activeGroupJids.push(jid);

        const memberCount = groupMeta.participants?.length || 0;
        const displayName = `${groupMeta.subject || 'Unknown Group'} (${memberCount} members)`;

        await this.prisma.whatsappSource.upsert({
          where: { jid },
          update: { name: displayName },
          create: {
            jid: groupMeta.id,
            name: displayName,
            type: 'GROUP',
            isEnabled: false, // default off
          }
        });
        syncedCount++;
      }

      // Optional: Delete any GROUP sources from DB that were not in this active list
      if (activeGroupJids.length > 0) {
        await this.prisma.whatsappSource.deleteMany({
          where: {
            type: 'GROUP',
            jid: { notIn: activeGroupJids },
          }
        });
      }

      this.logger.log(`Synced ${syncedCount} active WhatsApp groups to the database.`);
      return { success: true, count: syncedCount };
    } catch (err) {
      this.logger.error('Failed to sync WhatsApp groups', err);
      return { success: false, message: 'Failed to sync groups from WhatsApp' };
    }
  }

  // Intercept method to automatically add unknown sources and check if they are enabled
  async isSourceAllowed(jid: string, pushName?: string): Promise<boolean> {
    if (!jid) return false;

    // Check if it exists
    let source = await this.prisma.whatsappSource.findUnique({
      where: { jid },
    });

    if (!source) {
      // Auto-add unknown sources so they appear in the UI
      let type = 'INDIVIDUAL';
      if (jid.endsWith('@g.us')) type = 'GROUP';
      else if (jid.endsWith('@newsletter')) type = 'CHANNEL';
      else if (jid.endsWith('@broadcast')) type = 'CHANNEL';

      source = await this.prisma.whatsappSource.create({
        data: {
          jid,
          name: pushName || jid.split('@')[0],
          type,
          isEnabled: false, // All new sources are disabled by default
        },
      });
      this.logger.log(`Auto-added new source ${jid} (${source.name}) - Defaulting to blocked.`);
    }

    return source.isEnabled;
  }
}
