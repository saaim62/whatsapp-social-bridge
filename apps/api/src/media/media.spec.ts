import * as fs from 'fs';
import * as path from 'path';
import { MediaSigningService } from './media-signing.service';
import { MediaController } from './media.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Media protection (P1-5): uploads are no longer served statically.
 * Dashboard access is JWT + tenant-checked; public access exists only
 * through short-lived HMAC-signed URLs.
 */
describe('MediaSigningService', () => {
  const config = {
    get: jest.fn((key: string) =>
      ({ MEDIA_SIGNING_SECRET: 'test-signing-secret', PUBLIC_API_URL: 'https://api.example.com' })[key],
    ),
  };
  const signing = new MediaSigningService(config as any);

  it('round-trips a subject through sign/verify', () => {
    const token = signing.sign('a:asset-1', 900);
    expect(signing.verify(token)).toEqual({ subject: 'a:asset-1' });
    expect(signing.signedUrl('f:photo.jpg', 900)).toContain(
      'https://api.example.com/api/media/signed/',
    );
  });

  it('rejects an expired token', () => {
    const token = signing.sign('a:asset-1', -10);
    expect(signing.verify(token)).toBeNull();
  });

  it('rejects a tampered token (payload or signature)', () => {
    const token = signing.sign('a:asset-1', 900);
    const [b64, exp, sig] = token.split('.');
    const forgedPayload = `${Buffer.from('a:asset-2').toString('base64url')}.${exp}.${sig}`;
    expect(signing.verify(forgedPayload)).toBeNull();
    const forgedSig = `${b64}.${exp}.${sig[0] === 'a' ? 'b' : 'a'}${sig.slice(1)}`;
    expect(signing.verify(forgedSig)).toBeNull();
    expect(signing.verify('not-a-token')).toBeNull();
    expect(signing.verify('')).toBeNull();
  });
});

describe('MediaController', () => {
  const config = {
    get: jest.fn((key: string) =>
      ({ MEDIA_SIGNING_SECRET: 'test-signing-secret', PUBLIC_API_URL: 'https://api.example.com' })[key],
    ),
  };
  const signing = new MediaSigningService(config as any);

  let prisma: any;
  let controller: MediaController;
  let res: any;

  const ASSET = {
    id: 'asset-1',
    batchId: 'batch-1',
    localPath: null,
    originalUrl: 'https://cdn.example.com/photo.jpg',
    mimeType: 'image/jpeg',
    batch: { userId: 'user-1' },
  };

  beforeEach(() => {
    prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue(ASSET) } };
    controller = new MediaController(prisma, signing);
    res = {
      setHeader: jest.fn(),
      sendFile: jest.fn(),
      redirect: jest.fn(),
    };
  });

  it('the authenticated endpoint is behind the JWT guard', () => {
    // '__guards__' is Nest's GUARDS_METADATA key.
    const guards = Reflect.getMetadata('__guards__', MediaController.prototype.serveOwned);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('owner can fetch their own media', async () => {
    await controller.serveOwned('asset-1', { user: { userId: 'user-1' } }, res);
    expect(res.redirect).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg');
  });

  it('another tenant gets 404 (existence is not leaked)', async () => {
    await expect(
      controller.serveOwned('asset-1', { user: { userId: 'user-2' } }, res),
    ).rejects.toThrow('Media not found');
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('a signed URL works before expiry', async () => {
    const token = signing.sign('a:asset-1', 900);
    await controller.serveSigned(token, res);
    expect(res.redirect).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg');
  });

  it('a signed URL is rejected after expiry and when tampered', async () => {
    const expired = signing.sign('a:asset-1', -10);
    await expect(controller.serveSigned(expired, res)).rejects.toThrow(
      'Invalid or expired media link',
    );
    const [b64, exp, sig] = signing.sign('a:asset-1', 900).split('.');
    const tampered = `${b64}.${exp}.${sig[0] === 'a' ? 'b' : 'a'}${sig.slice(1)}`;
    await expect(controller.serveSigned(tampered, res)).rejects.toThrow(
      'Invalid or expired media link',
    );
  });

  it('a signed file URL serves the file from inside uploads/ and cannot traverse out of it', async () => {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const name = `media-spec-${Date.now()}.jpg`;
    const filePath = path.join(uploadsDir, name);
    fs.writeFileSync(filePath, 'fake-jpeg');
    try {
      await controller.serveSigned(signing.sign(`f:${name}`, 900), res);
      expect(res.sendFile).toHaveBeenCalledWith(filePath);

      res.sendFile.mockClear();
      // Traversal attempt: the subject resolves by basename inside
      // uploads/, where no such file exists → 404, never served.
      await expect(
        controller.serveSigned(signing.sign('f:../../schema.prisma', 900), res),
      ).rejects.toThrow('Media not found');
      expect(res.sendFile).not.toHaveBeenCalled();
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});
