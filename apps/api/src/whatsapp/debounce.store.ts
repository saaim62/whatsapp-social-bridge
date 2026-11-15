import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { WAMessage } from '@whiskeysockets/baileys';

/**
 * Redis-backed debounce buffer for incoming WhatsApp messages.
 *
 * Replaces the previous in-process `Map` + `setTimeout` pair: buffered
 * messages now survive an API restart, and the API can run more than
 * one replica — the flush claim (`ZREM` on the due-set) is atomic, so
 * exactly one replica drains a given buffer.
 *
 * Layout:
 *   LIST  wa:debounce:list:{userId}:{senderId}  — JSON messages, arrival order
 *   ZSET  wa:debounce:due                       — member {userId}:{senderId},
 *                                                  score = flush deadline (ms)
 * Every push re-arms the deadline to now + DEBOUNCE_WINDOW_MS, which is
 * what makes it a debounce (flush after a window of silence) rather
 * than a fixed delay.
 */
export const DEBOUNCE_WINDOW_MS = 3500;

const DUE_KEY = 'wa:debounce:due';
const LIST_PREFIX = 'wa:debounce:list:';

export interface DueBuffer {
  userId: string;
  senderId: string;
  messages: WAMessage[];
}

/** Baileys timestamps can be protobuf Longs ({low, high}); JSON
 *  round-tripping turns them into plain objects. Revive them to plain
 *  numbers so downstream `Number(...)`/`toString()` handling behaves
 *  exactly as it does for live (non-serialized) messages. */
function reviveMessage(raw: unknown): WAMessage {
  const msg = raw as WAMessage & {
    messageTimestamp?: number | { low?: number; high?: number } | string;
  };
  const ts = msg.messageTimestamp;
  if (ts && typeof ts === 'object') {
    const low = ts.low ?? 0;
    const high = ts.high ?? 0;
    msg.messageTimestamp = high * 2 ** 32 + (low >>> 0);
  }
  return msg as WAMessage;
}

@Injectable()
export class DebounceStore {
  constructor(private readonly redis: Redis) {}

  private member(userId: string, senderId: string): string {
    // userIds are cuids (no ':'), sender JIDs may contain ':' after the
    // first separator — splitting on the FIRST ':' is therefore safe.
    return `${userId}:${senderId}`;
  }

  private listKey(member: string): string {
    return `${LIST_PREFIX}${member}`;
  }

  async push(
    userId: string,
    senderId: string,
    message: WAMessage,
  ): Promise<void> {
    const member = this.member(userId, senderId);
    await this.redis.rpush(this.listKey(member), JSON.stringify(message));
    await this.redis.zadd(
      DUE_KEY,
      Date.now() + DEBOUNCE_WINDOW_MS,
      member,
    );
  }

  /** Drain every buffer whose silence window has elapsed. */
  async collectDue(now: number = Date.now()): Promise<DueBuffer[]> {
    const members = await this.redis.zrangebyscore(DUE_KEY, '-inf', now);
    const buffers: DueBuffer[] = [];
    for (const member of members) {
      // Atomic claim: only the replica that removes the member drains it.
      const claimed = await this.redis.zrem(DUE_KEY, member);
      if (claimed !== 1) continue;
      const raw = await this.redis.lrange(this.listKey(member), 0, -1);
      await this.redis.del(this.listKey(member));
      if (raw.length === 0) continue;
      const sep = member.indexOf(':');
      buffers.push({
        userId: member.slice(0, sep),
        senderId: member.slice(sep + 1),
        messages: raw.map((entry) => reviveMessage(JSON.parse(entry))),
      });
    }
    return buffers;
  }

  /** Messages currently buffered for a source (inspection/tests). */
  async pendingMessages(
    userId: string,
    senderId: string,
  ): Promise<WAMessage[]> {
    const raw = await this.redis.lrange(
      this.listKey(this.member(userId, senderId)),
      0,
      -1,
    );
    return raw.map((entry) => reviveMessage(JSON.parse(entry)));
  }
}
