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

  async getSources(userId: string) {
    return this.prisma.whatsappSource.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async toggleSource(id: string, isEnabled: boolean, userId: string) {
    return this.prisma.whatsappSource.update({
      where: { id, userId },
      data: { isEnabled },
    });
  }

  async deleteSource(id: string, userId: string) {
    return this.prisma.whatsappSource.delete({
      where: { id, userId },
    });
  }

  async syncGroups(userId: string) {
    try {
      const client = this.whatsappService.getClient(userId);
      if (!client) {
        throw new Error('WhatsApp client not ready for this user');
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
          where: { userId_jid: { userId, jid } },
          update: { name: displayName },
          create: {
            userId,
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
            userId,
            type: 'GROUP',
            jid: { notIn: activeGroupJids },
          }
        });
      }

      this.logger.log(`Synced ${syncedCount} active WhatsApp groups to the database for user ${userId}.`);
      return { success: true, count: syncedCount };
    } catch (err) {
      this.logger.error(`Failed to sync WhatsApp groups for user ${userId}`, err);
      return { success: false, message: 'Failed to sync groups from WhatsApp' };
    }
  }

  async updateSourceName(id: string, name: string, userId: string) {
    return this.prisma.whatsappSource.update({
      where: { id, userId },
      data: { name },
    });
  }

  async syncContacts(userId: string, contacts: any[]) {
    try {
      let syncedCount = 0;
      for (let i = 0; i < contacts.length; i += 100) {
        const chunk = contacts.slice(i, i + 100);
        await Promise.all(
          chunk.map((c: any) => {
            if (!c.id || !c.name) return;
            return this.prisma.whatsappContact.upsert({
              where: { userId_jid: { userId, jid: c.id } },
              update: { name: c.name },
              create: { userId, jid: c.id, name: c.name },
            }).catch(err => {
              // Ignore unique constraint or other minor errors during bulk sync
            });
          })
        );
        syncedCount += chunk.length;
      }
      this.logger.log(`Synced ${syncedCount} address book contacts for user ${userId}.`);
    } catch (err) {
      this.logger.error(`Failed to sync address book contacts for user ${userId}`, err);
    }
  }

  // Intercept method to automatically add unknown sources and check if they are enabled
  async isSourceAllowed(jid: string, pushName: string | undefined, userId: string): Promise<boolean> {
    if (!jid) return false;

    // Check if it exists
    let source = await this.prisma.whatsappSource.findUnique({
      where: { userId_jid: { userId, jid } },
    });

    if (!source) {
      // Auto-add unknown sources so they appear in the UI
      let type = 'INDIVIDUAL';
      if (jid.endsWith('@g.us')) type = 'GROUP';
      else if (jid.endsWith('@newsletter')) type = 'CHANNEL';
      else if (jid.endsWith('@broadcast')) type = 'CHANNEL';

      let resolvedName = pushName;
      if (!resolvedName) {
        // Fallback to address book contact if pushName is missing (e.g. LIDs)
        const contact = await this.prisma.whatsappContact.findUnique({
          where: { userId_jid: { userId, jid } }
        });
        if (contact && contact.name) {
          resolvedName = contact.name;
        } else {
          resolvedName = jid.split('@')[0];
        }
      }

      source = await this.prisma.whatsappSource.create({
        data: {
          userId,
          jid,
          name: resolvedName,
          type,
          isEnabled: false, // All new sources are disabled by default
        },
      });
      this.logger.log(`Auto-added new source ${jid} (${source.name}) for user ${userId} - Defaulting to blocked.`);
    }

    return source.isEnabled;
  }
}

