import { DebounceStore, DEBOUNCE_WINDOW_MS } from './debounce.store';
import type { WAMessage } from '@whiskeysockets/baileys';
import type Redis from 'ioredis';

/** Minimal in-memory stand-in for the ioredis commands DebounceStore uses. */
class FakeRedis {
  lists = new Map<string, string[]>();
  zsets = new Map<string, Map<string, number>>();

  rpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return Promise.resolve(list.length);
  }

  lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop === -1 ? list.length : stop + 1;
    return Promise.resolve(list.slice(start, end));
  }

  del(key: string): Promise<number> {
    const had = this.lists.delete(key) || this.zsets.delete(key);
    return Promise.resolve(had ? 1 : 0);
  }

  zadd(key: string, score: number, member: string): Promise<number> {
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    const isNew = !zset.has(member);
    zset.set(member, score);
    this.zsets.set(key, zset);
    return Promise.resolve(isNew ? 1 : 0);
  }

  zrem(key: string, member: string): Promise<number> {
    const zset = this.zsets.get(key);
    if (!zset || !zset.delete(member)) return Promise.resolve(0);
    return Promise.resolve(1);
  }

  zrangebyscore(key: string, min: string, max: number): Promise<string[]> {
    const zset = this.zsets.get(key);
    if (!zset) return Promise.resolve([]);
    const out: string[] = [];
    for (const [member, score] of zset) {
      if ((min === '-inf' || score >= Number(min)) && score <= max) {
        out.push(member);
      }
    }
    return Promise.resolve(out);
  }
}

function msg(id: string): WAMessage {
  return {
    key: { remoteJid: '111@g.us', fromMe: false, id },
    pushName: 'Supplier',
    message: { conversation: `drop ${id}` },
    messageTimestamp: 1700000000,
  };
}

describe('DebounceStore (Redis-backed debounce)', () => {
  const USER = 'user-1';
  const JID = '111@g.us';
  let redis: FakeRedis;
  let store: DebounceStore;

  beforeEach(() => {
    redis = new FakeRedis();
    store = new DebounceStore(redis as unknown as Redis);
  });

  it('does not release a buffer before the silence window elapses', async () => {
    const t0 = Date.now();
    await store.push(USER, JID, msg('m1'));
    const due = await store.collectDue(t0 + DEBOUNCE_WINDOW_MS - 500);
    expect(due).toEqual([]);
    expect(await store.pendingMessages(USER, JID)).toHaveLength(1);
  });

  it('releases buffered messages in arrival order once the window elapses', async () => {
    const t0 = Date.now();
    await store.push(USER, JID, msg('m1'));
    await store.push(USER, JID, msg('m2'));
    const due = await store.collectDue(t0 + DEBOUNCE_WINDOW_MS + 500);
    expect(due).toHaveLength(1);
    expect(due[0].userId).toBe(USER);
    expect(due[0].senderId).toBe(JID);
    expect(due[0].messages.map((m) => m.key.id)).toEqual(['m1', 'm2']);
    // Buffer is drained: a second sweep finds nothing.
    expect(await store.pendingMessages(USER, JID)).toEqual([]);
    expect(await store.collectDue(t0 + DEBOUNCE_WINDOW_MS + 1000)).toEqual([]);
  });

  it('each push re-arms the deadline (true debounce, not fixed delay)', async () => {
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      await store.push(USER, JID, msg('m1'));
      now += 3000; // 3s later, still inside the 3.5s window
      await store.push(USER, JID, msg('m2'));
      // 4s after the FIRST push but only 1s after the second: not due.
      expect(await store.collectDue(now + 1000)).toEqual([]);
      const due = await store.collectDue(now + DEBOUNCE_WINDOW_MS + 1);
      expect(due).toHaveLength(1);
      expect(due[0].messages).toHaveLength(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('keeps buffers for different sources separate', async () => {
    const t0 = Date.now();
    await store.push(USER, JID, msg('a'));
    await store.push(USER, '222@g.us', msg('b'));
    const due = await store.collectDue(t0 + DEBOUNCE_WINDOW_MS + 500);
    expect(due).toHaveLength(2);
    const bySender = Object.fromEntries(
      due.map((d) => [d.senderId, d.messages.map((m) => m.key.id)]),
    );
    expect(bySender[JID]).toEqual(['a']);
    expect(bySender['222@g.us']).toEqual(['b']);
  });

  it('revives protobuf-Long timestamps that JSON round-tripped into objects', async () => {
    const t0 = Date.now();
    const m = msg('m-long');
    (m as { messageTimestamp: unknown }).messageTimestamp = {
      low: 1700000000,
      high: 0,
      unsigned: true,
    };
    await store.push(USER, JID, m);
    const due = await store.collectDue(t0 + DEBOUNCE_WINDOW_MS + 500);
    expect(due[0].messages[0].messageTimestamp).toBe(1700000000);
  });
});
