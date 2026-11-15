import { SourcesService } from './sources.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('sharp', () => jest.fn());

/**
 * Privacy regression tests for source authorization.
 *
 * These tests exercise the REAL SourcesService.isSourceAllowed against a
 * semantics-faithful in-memory Prisma — including an honest findFirst that
 * understands the (userId, name, isEnabled, NOT jid endsWith) query the old
 * code used. If name-based auto-enable ever comes back, these tests fail by
 * behavior (a stranger's chat gets admitted), not by mock error.
 *
 * Policy under test: authorization is by EXACT JID only. A display name is
 * presentation, never identity — two different people can share one name.
 */
describe('SourcesService.isSourceAllowed — exact-identity authorization', () => {
  const USER = 'user-1';
  const ALI_ENABLED_JID = '923001111111@s.whatsapp.net';
  const ALI_STRANGER_JID = '923002222222@s.whatsapp.net';
  const STRANGER_LID = '999888777@lid';

  let db: { sources: any[]; contacts: any[] };
  let service: SourcesService;

  function matchesWhere(row: any, where: any): boolean {
    for (const [key, cond] of Object.entries(where ?? {})) {
      if (key === 'NOT') {
        if (matchesWhere(row, cond)) return false;
        continue;
      }
      if (cond && typeof cond === 'object' && 'endsWith' in (cond as any)) {
        if (!String(row[key]).endsWith((cond as any).endsWith)) return false;
        continue;
      }
      if (row[key] !== cond) return false;
    }
    return true;
  }

  function makePrisma() {
    return {
      whatsappSource: {
        findUnique: jest.fn(async ({ where }: any) => {
          const { userId, jid } = where.userId_jid;
          return (
            db.sources.find((s) => s.userId === userId && s.jid === jid) ?? null
          );
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          return db.sources.find((s) => matchesWhere(s, where)) ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
          if (
            db.sources.some(
              (s) => s.userId === data.userId && s.jid === data.jid,
            )
          ) {
            const err: any = new Error('Unique constraint failed');
            err.code = 'P2002';
            throw err;
          }
          const row = {
            id: `src-${db.sources.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          db.sources.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = db.sources.find((s) => s.id === where.id);
          if (!row) throw new Error('Record not found');
          Object.assign(row, data);
          return row;
        }),
      },
      whatsappContact: {
        findUnique: jest.fn(async ({ where }: any) => {
          const { userId, jid } = where.userId_jid;
          return (
            db.contacts.find((c) => c.userId === userId && c.jid === jid) ??
            null
          );
        }),
      },
    };
  }

  function seed() {
    db = {
      sources: [
        // The one and only "Ali" the user actually enabled.
        {
          id: 'src-ali',
          userId: USER,
          jid: ALI_ENABLED_JID,
          name: 'Ali',
          type: 'INDIVIDUAL',
          isEnabled: true,
        },
      ],
      contacts: [
        { userId: USER, jid: ALI_ENABLED_JID, name: 'Ali' },
        // Contact sync writes the same display name under a contact's LID
        // JID as well — that cache entry must not become an authorization.
        { userId: USER, jid: STRANGER_LID, name: 'Ali' },
      ],
    };
    service = new SourcesService(makePrisma() as any, {} as any);
  }

  beforeEach(seed);

  it('admits the exact enabled JID', async () => {
    await expect(
      service.isSourceAllowed(ALI_ENABLED_JID, 'Ali', USER),
    ).resolves.toBe(true);
  });

  it('rejects a different contact ID that shares the enabled contact’s display name', async () => {
    await expect(
      service.isSourceAllowed(ALI_STRANGER_JID, 'Ali', USER),
    ).resolves.toBe(false);

    const created = db.sources.find((s) => s.jid === ALI_STRANGER_JID);
    expect(created).toBeDefined();
    expect(created.isEnabled).toBe(false);

    // Second sighting (existing-source path) must also stay rejected.
    await expect(
      service.isSourceAllowed(ALI_STRANGER_JID, 'Ali', USER),
    ).resolves.toBe(false);
    expect(db.sources.find((s) => s.jid === ALI_STRANGER_JID).isEnabled).toBe(
      false,
    );
  });

  it('rejects an unknown @lid sender whose display name matches an enabled contact', async () => {
    await expect(
      service.isSourceAllowed(STRANGER_LID, 'Ali', USER),
    ).resolves.toBe(false);

    const created = db.sources.find((s) => s.jid === STRANGER_LID);
    expect(created).toBeDefined();
    expect(created.isEnabled).toBe(false);

    // And again once the @lid source exists as a disabled row.
    await expect(
      service.isSourceAllowed(STRANGER_LID, 'Ali', USER),
    ).resolves.toBe(false);
    expect(db.sources.find((s) => s.jid === STRANGER_LID).isEnabled).toBe(
      false,
    );
  });

  it('admits an @lid source the user explicitly enabled by its exact JID', async () => {
    db.sources.push({
      id: 'src-lid',
      userId: USER,
      jid: STRANGER_LID,
      name: 'Ali',
      type: 'INDIVIDUAL',
      isEnabled: true,
    });
    await expect(
      service.isSourceAllowed(STRANGER_LID, 'Ali', USER),
    ).resolves.toBe(true);
  });

  it('registers unknown groups as disabled and rejects them', async () => {
    await expect(
      service.isSourceAllowed('120363000000@g.us', 'Some Group', USER),
    ).resolves.toBe(false);
    const created = db.sources.find((s) => s.jid === '120363000000@g.us');
    expect(created?.type).toBe('GROUP');
    expect(created?.isEnabled).toBe(false);
  });

  it('never enables a source belonging to a different user by name', async () => {
    await expect(
      service.isSourceAllowed(ALI_STRANGER_JID, 'Ali', 'user-2'),
    ).resolves.toBe(false);
    expect(
      db.sources.find(
        (s) => s.jid === ALI_STRANGER_JID && s.userId === 'user-2',
      )?.isEnabled,
    ).toBe(false);
  });
});
