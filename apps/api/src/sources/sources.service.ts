import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Format a phone number from a JID local part.
   * e.g. "923014775234" → "+923014775234"
   */
  private formatPhoneNumber(digits: string): string {
    const clean = digits.replace(/\D/g, '');
    if (!clean) return digits;
    return `+${clean}`;
  }

  /**
   * Detect names that are masked by WhatsApp (e.g. "+92∙∙∙∙∙∙∙∙34").
   */
  private isMaskedNumber(name: string): boolean {
    return /[∙•·]{2,}/.test(name);
  }

  /**
   * Detect names that are just raw numbers (no real saved name).
   */
  private isRawNumber(name: string): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    // Pure digits, or digits with + and spaces
    return /^[+\d\s\-().]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 6;
  }

  /**
   * Returns true if a name is "bad" — masked, raw number, or missing.
   * Bad names should be replaced with better ones when available.
   */
  private isBadName(name: string | null | undefined, jidLocalPart?: string): boolean {
    if (!name || name === 'Unknown') return true;
    if (jidLocalPart && name === jidLocalPart) return true;
    if (this.isMaskedNumber(name)) return true;
    if (this.isRawNumber(name)) return true;
    return false;
  }

  /**
   * Pick the best human-readable name from a Baileys contact object.
   * Returns null if no usable name is found.
   */
  private pickBestContactName(contact: any): string | null {
    // Priority: verifiedName > name (saved contact) > notify/pushName (self-set)
    // But skip masked/raw for the first pass
    const candidates = [contact.verifiedName, contact.name, contact.notify, contact.pushName];

    // First pass: real human-readable names only
    for (const name of candidates) {
      if (name && name.trim() && !this.isBadName(name)) {
        return name.trim();
      }
    }

    // Second pass: accept even masked/raw names — better than nothing
    for (const name of candidates) {
      if (name && name.trim()) {
        return name.trim();
      }
    }

    return null;
  }

  /**
   * Returns true if a JID should be completely ignored.
   * Only filters out `status@broadcast` — everything else is a real source.
   */
  private isUsableJid(jid: string): boolean {
    if (!jid) return false;
    if (jid === 'status@broadcast') return false;
    if (jid === '0@s.whatsapp.net') return false;
    return true;
  }

  // ─── CRUD ───────────────────────────────────────────────────

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

  // ─── Sync ───────────────────────────────────────────────────

  async syncGroups(userId: string) {
    try {
      const client = this.whatsappService.getClient(userId);
      if (!client) {
        throw new Error('WhatsApp client not ready for this user');
      }

      // ── Step 0: Clean up junk ──
      // Remove status@broadcast and 0@s.whatsapp.net sources
      await this.prisma.whatsappSource.deleteMany({
        where: { userId, jid: { in: ['status@broadcast', '0@s.whatsapp.net'] } },
      });

      // ── Step 1: Deduplicate sources ──
      // The DB has many duplicate JID entries. Keep only the best one per JID.
      await this.deduplicateSources(userId);

      // ── Step 1.5: Recover LID mappings from disk ──
      await this.recoverDiskLidMappings(userId);

      // ── Step 2: Sync active groups ──
      const groups = await client.groupFetchAllParticipating();
      let syncedCount = 0;
      
      const meId = client.user?.id?.split(':')[0];
      const activeGroupJids: string[] = [];

      for (const jid in groups) {
        const groupMeta = groups[jid];
        if (!groupMeta) continue;
        
        let isActiveParticipant = true;
        if (meId && groupMeta.participants) {
          const myLid = client.authState?.creds?.me?.lid?.split(':')[0] || '';
          isActiveParticipant = groupMeta.participants.some((p: any) => {
             return p.id.includes(meId) || 
                    (client.user?.id && p.id.includes(client.user.id.split('@')[0])) || 
                    (myLid && p.id.includes(myLid));
          });
        }
        
        if (!isActiveParticipant) continue;
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
            isEnabled: false,
          }
        });
        syncedCount++;
      }

      // Delete stale groups we're no longer in
      if (activeGroupJids.length > 0) {
        await this.prisma.whatsappSource.deleteMany({
          where: {
            userId,
            type: 'GROUP',
            jid: { notIn: activeGroupJids },
          }
        });
      }

      // ── Step 3: Sync individual contacts ──
      const contacts = await this.prisma.whatsappContact.findMany({
        where: { userId }
      });
      
      let individualCount = 0;
      for (const contact of contacts) {
        // Only standard user JIDs — @lid sources are created automatically when messages arrive
        if (!contact.jid.endsWith('@s.whatsapp.net')) continue;
        if (!this.isUsableJid(contact.jid)) continue;
        
        // Determine the best display name for this contact
        const localPart = contact.jid.split('@')[0];
        let displayName: string;
        if (this.isBadName(contact.name, localPart)) {
          // Contact has no real saved name — show the phone number
          displayName = this.formatPhoneNumber(localPart);
        } else {
          displayName = contact.name;
        }
        
        await this.prisma.whatsappSource.upsert({
          where: { userId_jid: { userId, jid: contact.jid } },
          update: { name: displayName },
          create: {
            userId,
            jid: contact.jid,
            name: displayName,
            type: 'INDIVIDUAL',
            isEnabled: false,
          }
        });
        individualCount++;
      }

      // ── Step 4: Heal all bad names ──
      await this.healSourceNames(userId);

      this.logger.log(`Synced ${syncedCount} groups and ${individualCount} contacts for user ${userId}.`);
      return { success: true, count: syncedCount + individualCount };
    } catch (err) {
      this.logger.error(`Failed to sync WhatsApp groups/contacts for user ${userId}`, err);
      return { success: false, message: 'Failed to sync from WhatsApp' };
    }
  }

  /**
   * Baileys saves LID mappings to disk (`lid-mapping-..._reverse.json`) but doesn't always
   * emit them via `contacts.upsert`. This reads the disk cache and links them in the DB.
   */
  private async recoverDiskLidMappings(userId: string) {
    try {
      const sessionDir = path.join(process.cwd(), `sessions/user_${userId}_auth`);
      if (!fs.existsSync(sessionDir)) return;

      const files = fs.readdirSync(sessionDir);
      let mapped = 0;

      for (const file of files) {
        if (file.startsWith('lid-mapping-') && file.endsWith('_reverse.json')) {
          const lid = file.replace('lid-mapping-', '').replace('_reverse.json', '');
          const content = fs.readFileSync(path.join(sessionDir, file), 'utf8');
          const phone = JSON.parse(content);
          
          const lidJid = lid + '@lid';
          const phoneJid = phone + '@s.whatsapp.net';
          
          // Find if we have a name for either of them
          const lidContact = await this.prisma.whatsappContact.findUnique({ where: { userId_jid: { userId, jid: lidJid } } });
          const phoneContact = await this.prisma.whatsappContact.findUnique({ where: { userId_jid: { userId, jid: phoneJid } } });
          
          let bestName: string | null = null;
          if (lidContact && !this.isBadName(lidContact.name, lid)) bestName = lidContact.name;
          if (phoneContact && !this.isBadName(phoneContact.name, phone)) bestName = phoneContact.name;
          
          if (bestName) {
            // Upsert both with the real name
            await this.prisma.whatsappContact.upsert({
              where: { userId_jid: { userId, jid: lidJid } },
              update: { name: bestName },
              create: { userId, jid: lidJid, name: bestName }
            });
            await this.prisma.whatsappContact.upsert({
              where: { userId_jid: { userId, jid: phoneJid } },
              update: { name: bestName },
              create: { userId, jid: phoneJid, name: bestName }
            });
            mapped++;
          }
        }
      }
      if (mapped > 0) {
        this.logger.log(`Recovered ${mapped} LID contact mappings from disk for user ${userId}.`);
      }
    } catch (err) {
      this.logger.error(`Failed to recover LID mappings for user ${userId}`, err);
    }
  }

  /**
   * Remove duplicate WhatsappSource entries (same userId + jid).
   * Keeps the one with a real name and/or isEnabled=true, deletes the rest.
   */
  private async deduplicateSources(userId: string) {
    const sources = await this.prisma.whatsappSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Group by jid
    const byJid: Record<string, typeof sources> = {};
    for (const s of sources) {
      if (!byJid[s.jid]) byJid[s.jid] = [];
      byJid[s.jid].push(s);
    }

    let deletedCount = 0;
    for (const jid in byJid) {
      const entries = byJid[jid];
      if (entries.length <= 1) continue;

      // Pick the best entry to keep:
      // 1. Prefer enabled sources
      // 2. Prefer sources with a real name (not raw numbers)
      // 3. Prefer the most recently created
      entries.sort((a, b) => {
        // Enabled wins
        if (a.isEnabled && !b.isEnabled) return -1;
        if (!a.isEnabled && b.isEnabled) return 1;
        // Real name wins
        const aGood = !this.isBadName(a.name, a.jid.split('@')[0]);
        const bGood = !this.isBadName(b.name, b.jid.split('@')[0]);
        if (aGood && !bGood) return -1;
        if (!aGood && bGood) return 1;
        // Newer wins
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      // Keep the first (best), delete the rest
      const keepId = entries[0].id;
      const deleteIds = entries.slice(1).map(e => e.id);
      
      // Transfer isEnabled=true to the keeper if any duplicate had it enabled
      const anyEnabled = entries.some(e => e.isEnabled);
      if (anyEnabled && !entries[0].isEnabled) {
        await this.prisma.whatsappSource.update({
          where: { id: keepId },
          data: { isEnabled: true },
        });
      }

      await this.prisma.whatsappSource.deleteMany({
        where: { id: { in: deleteIds } },
      });
      deletedCount += deleteIds.length;
    }

    if (deletedCount > 0) {
      this.logger.log(`Deduplicated: removed ${deletedCount} duplicate sources for user ${userId}`);
    }
  }

  async updateSourceName(id: string, name: string, userId: string) {
    return this.prisma.whatsappSource.update({
      where: { id, userId },
      data: { name },
    });
  }

  /**
   * Fix source names that are raw numbers, masked numbers, or missing.
   * Tries the WhatsappContact cache first, then falls back to formatting the phone number.
   */
  async healSourceNames(userId: string) {
    try {
      const sources = await this.prisma.whatsappSource.findMany({
        where: { userId, type: 'INDIVIDUAL' }
      });
      let healed = 0;
      for (const source of sources) {
        const localPart = source.jid.split('@')[0];
        
        // Try to find a real name in the contacts cache
        const contact = await this.prisma.whatsappContact.findUnique({
          where: { userId_jid: { userId, jid: source.jid } }
        });

        let newName: string | null = null;
        if (contact && !this.isBadName(contact.name, localPart)) {
          newName = contact.name;
        } else if (this.isBadName(source.name, localPart) && source.jid.endsWith('@s.whatsapp.net')) {
          // For phone-number JIDs with bad names, format the number nicely
          newName = this.formatPhoneNumber(localPart);
        }

        if (newName && newName !== source.name) {
          // If the user manually edited this source name, we should avoid overwriting it.
          // We assume a manual edit happened if the name is good (not bad) and not matching the contact exactly,
          // but just to be safe, if the current name is bad, we overwrite it.
          if (this.isBadName(source.name, localPart) || (contact && source.name !== contact.name)) {
            await this.prisma.whatsappSource.update({
              where: { id: source.id },
              data: { name: newName }
            });
            healed++;
          }
        }
      }
      if (healed > 0) {
        this.logger.log(`Healed ${healed} source names for user ${userId}.`);
      }
      return { success: true, count: healed };
    } catch (err) {
      this.logger.error(`Failed to heal source names for user ${userId}`, err);
      return { success: false };
    }
  }

  /**
   * Sync contacts from Baileys contacts.upsert events into the DB.
   * Also maps LID JIDs to real names via the `lid` field.
   */
  async syncContacts(userId: string, contacts: any[]) {
    try {
      let syncedCount = 0;
      for (let i = 0; i < contacts.length; i += 100) {
        const chunk = contacts.slice(i, i + 100);
        await Promise.all(
          chunk.map(async (c: any) => {
            if (!c.id || !this.isUsableJid(c.id)) return;

            const contactName = this.pickBestContactName(c);
            if (!contactName) return;

            try {
              // Save contact under their primary JID
              await this.prisma.whatsappContact.upsert({
                where: { userId_jid: { userId, jid: c.id } },
                update: { name: contactName },
                create: { userId, jid: c.id, name: contactName },
              });

              // If this contact has a LID mapping, save the name under the LID JID too.
              // This is how we resolve names for @lid sources.
              const lidJid = c.lid || c.lidJid;
              if (lidJid && lidJid !== c.id) {
                await this.prisma.whatsappContact.upsert({
                  where: { userId_jid: { userId, jid: lidJid } },
                  update: { name: contactName },
                  create: { userId, jid: lidJid, name: contactName },
                });
                // Also heal the LID source if it exists
                await this.healSourceFromContact(userId, lidJid, contactName);
              }

              // Auto-heal the primary JID source if it has a bad name
              await this.healSourceFromContact(userId, c.id, contactName);
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

  /**
   * If a WhatsappSource exists for this JID and has a bad name,
   * update it with the given good name.
   */
  private async healSourceFromContact(userId: string, jid: string, goodName: string) {
    if (this.isBadName(goodName, jid.split('@')[0])) return; // Don't "heal" with another bad name
    
    try {
      const source = await this.prisma.whatsappSource.findUnique({
        where: { userId_jid: { userId, jid } }
      });
      if (!source) return;

      const localPart = source.jid.split('@')[0];
      if (this.isBadName(source.name, localPart)) {
        await this.prisma.whatsappSource.update({
          where: { id: source.id },
          data: { name: goodName }
        });
        this.logger.log(`Healed source name for ${jid}: "${source.name}" → "${goodName}"`);
      }
    } catch (err) {
      // ignore
    }
  }

  // ─── Message Gating ─────────────────────────────────────────

  /**
   * Check if a source is allowed to send messages.
   * Auto-creates unknown sources so they show up in the UI.
   */
  async isSourceAllowed(jid: string, pushName: string | undefined, userId: string): Promise<boolean> {
    if (!jid) return false;
    if (!this.isUsableJid(jid)) return false;

    let source = await this.prisma.whatsappSource.findUnique({
      where: { userId_jid: { userId, jid } },
    });

    if (!source) {
      // Auto-add unknown sources so they appear in the UI
      let type = 'INDIVIDUAL';
      if (jid.endsWith('@g.us')) type = 'GROUP';
      else if (jid.endsWith('@newsletter')) type = 'CHANNEL';

      // Build the best display name:
      // 1. Real pushName (not a number)
      // 2. Contact cache lookup
      // 3. Formatted phone number (for @s.whatsapp.net)
      // 4. Raw local part (for @lid — best we can do)
      const localPart = jid.split('@')[0];
      let resolvedName: string = localPart;

      // Try the contact cache FIRST (official phonebook name)
      const contact = await this.prisma.whatsappContact.findUnique({
        where: { userId_jid: { userId, jid } }
      });
      
      if (contact && !this.isBadName(contact.name, localPart)) {
        resolvedName = contact.name;
      } else if (pushName && !this.isBadName(pushName, localPart)) {
        // Try pushName SECOND (self-set profile name)
        resolvedName = pushName;
      } else if (jid.endsWith('@s.whatsapp.net')) {
        // Format the phone number nicely as a LAST resort
        resolvedName = this.formatPhoneNumber(localPart);
      }
      // For @lid with no contact match, keep localPart (the LID number)

      try {
        source = await this.prisma.whatsappSource.create({
          data: {
            userId,
            jid,
            name: resolvedName,
            type: jid.endsWith('@g.us')
              ? 'GROUP'
              : jid.endsWith('@newsletter')
                ? 'CHANNEL'
                : 'INDIVIDUAL',
            isEnabled: false,
          },
        });
        
        // --- LID AUTO-RESOLUTION ---
        // If this is a Linked Device ID (@lid) and it was just created as disabled,
        // check if the user has already enabled the primary phone number source with the exact same contact name.
        if (jid.endsWith('@lid') && resolvedName && !this.isBadName(resolvedName, localPart)) {
          const matchingPrimary = await this.prisma.whatsappSource.findFirst({
            where: {
              userId,
              name: resolvedName,
              isEnabled: true,
              NOT: { jid: { endsWith: '@lid' } }
            }
          });
          
          if (matchingPrimary) {
            this.logger.log(`Auto-enabling LID ${jid} because its primary contact '${resolvedName}' is enabled.`);
            source = await this.prisma.whatsappSource.update({
              where: { id: source.id },
              data: { isEnabled: true }
            });
          }
        }
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Concurrent create — just fetch it
          source = await this.prisma.whatsappSource.findUnique({
            where: { userId_jid: { userId, jid } },
          });
          if (!source) return false;
        } else {
          throw error;
        }
      }
    } else {
      // --- LID AUTO-RESOLUTION FOR EXISTING DISABLED LIDS ---
      if (!source.isEnabled && jid.endsWith('@lid')) {
        const localPart = source.jid.split('@')[0];
        if (!this.isBadName(source.name, localPart)) {
          const matchingPrimary = await this.prisma.whatsappSource.findFirst({
            where: {
              userId,
              name: source.name,
              isEnabled: true,
              NOT: { jid: { endsWith: '@lid' } }
            }
          });
          
          if (matchingPrimary) {
            this.logger.log(`Auto-enabling existing LID ${jid} because primary contact '${source.name}' is enabled.`);
            source = await this.prisma.whatsappSource.update({
              where: { id: source.id },
              data: { isEnabled: true }
            });
          }
        }
      }

      // Auto-heal existing source if we now have a better name
      const localPart = source.jid.split('@')[0];
      if (this.isBadName(source.name, localPart)) {
        let betterName: string | null = null;

        const contact = await this.prisma.whatsappContact.findUnique({
          where: { userId_jid: { userId, jid } }
        });
        if (contact && !this.isBadName(contact.name, localPart)) {
          betterName = contact.name;
        } else if (pushName && !this.isBadName(pushName, localPart)) {
          betterName = pushName;
        }

        if (betterName) {
          await this.prisma.whatsappSource.update({
            where: { id: source.id },
            data: { name: betterName }
          });
          source.name = betterName;
          this.logger.log(`Auto-healed source name for ${jid} → "${betterName}"`);
        }
      }
    }

    return source.isEnabled;
  }
}
