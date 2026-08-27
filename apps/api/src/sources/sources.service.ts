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

  async bulkDelete(ids: string[], userId: string) {
    return this.prisma.whatsappSource.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
  }

  async clearAllSources(userId: string) {
    await this.prisma.whatsappSource.deleteMany({ where: { userId } });
    await this.prisma.whatsappContact.deleteMany({ where: { userId } });
    this.logger.log(`Cleared all sources and contacts for user ${userId}`);
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

      // Sync all 1-to-1 contacts from the local cache into Sources so they appear in the UI
      const contacts = await this.prisma.whatsappContact.findMany({
        where: { userId }
      });
      
      let individualCount = 0;
      for (const contact of contacts) {
        // Only add if it's a standard user (not status@broadcast or weird LIDs unless needed)
        if (!contact.jid.endsWith('@s.whatsapp.net')) continue;
        
        await this.prisma.whatsappSource.upsert({
          where: { userId_jid: { userId, jid: contact.jid } },
          update: { name: contact.name }, // keep name updated
          create: {
            userId,
            jid: contact.jid,
            name: contact.name,
            type: 'INDIVIDUAL',
            isEnabled: false, // default off
          }
        });
        individualCount++;
      }

      // Also heal any missing individual contact names from the local contact cache
      await this.healSourceNames(userId);

      this.logger.log(`Synced ${syncedCount} active WhatsApp groups and ${individualCount} contacts to the database for user ${userId}.`);
      return { success: true, count: syncedCount + individualCount };
    } catch (err) {
      this.logger.error(`Failed to sync WhatsApp groups/contacts for user ${userId}`, err);
      return { success: false, message: 'Failed to sync from WhatsApp' };
    }
  }

  async updateSourceName(id: string, name: string, userId: string) {
    return this.prisma.whatsappSource.update({
      where: { id, userId },
      data: { name },
    });
  }

  async healSourceNames(userId: string) {
    try {
      const sources = await this.prisma.whatsappSource.findMany({
        where: { userId, type: 'INDIVIDUAL' }
      });
      let healed = 0;
      for (const source of sources) {
        if (!source.name || source.name === source.jid.split('@')[0] || source.name === 'Unknown') {
          const contact = await this.prisma.whatsappContact.findUnique({
            where: { userId_jid: { userId, jid: source.jid } }
          });
          if (contact && contact.name) {
            await this.prisma.whatsappSource.update({
              where: { id: source.id },
              data: { name: contact.name }
            });
            healed++;
          }
        }
      }
      if (healed > 0) {
        this.logger.log(`Healed ${healed} individual source names for user ${userId} from contact cache.`);
      }
      return { success: true, count: healed };
    } catch (err) {
      this.logger.error(`Failed to heal source names for user ${userId}`, err);
      return { success: false };
    }
  }

  async syncContacts(userId: string, contacts: any[]) {
    try {
      let syncedCount = 0;
      for (let i = 0; i < contacts.length; i += 100) {
        const chunk = contacts.slice(i, i + 100);
        await Promise.all(
          chunk.map(async (c: any) => {
            const contactName = c.name || c.verifiedName || c.notify;
            if (!c.id || !contactName) return;
            try {
              await this.prisma.whatsappContact.upsert({
                where: { userId_jid: { userId, jid: c.id } },
                update: { name: contactName },
                create: { userId, jid: c.id, name: contactName },
              });

              // Also auto-heal any existing WhatsappSource that has a raw number name
              const source = await this.prisma.whatsappSource.findUnique({
                where: { userId_jid: { userId, jid: c.id } }
              });
              
              if (source && (source.name === source.jid.split('@')[0] || !source.name || source.name === 'Unknown')) {
                await this.prisma.whatsappSource.update({
                  where: { id: source.id },
                  data: { name: contactName }
                });
              }
            } catch (err) {
              // Ignore unique constraint or other minor errors during bulk sync
            }
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

      try {
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
      } catch (error: any) {
        if (error.code === 'P2002') {
          // A concurrent request already created the source. Fetch it.
          source = await this.prisma.whatsappSource.findUnique({
            where: { userId_jid: { userId, jid } },
          });
          if (!source) return false; // Should never happen unless deleted concurrently
        } else {
          throw error;
        }
      }
    } else {
      // Auto-heal existing source if we now have a pushName but it was previously a raw number
      if (pushName && (source.name === source.jid.split('@')[0] || !source.name || source.name === 'Unknown')) {
        await this.prisma.whatsappSource.update({
          where: { id: source.id },
          data: { name: pushName }
        });
        source.name = pushName;
        this.logger.log(`Auto-healed source name for ${jid} to ${pushName}`);
      }
    }

    return source.isEnabled;
  }
}

