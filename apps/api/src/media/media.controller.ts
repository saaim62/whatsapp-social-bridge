import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { MediaSigningService } from './media-signing.service';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

/**
 * Media delivery (P1-5). The uploads directory is NOT served
 * statically anymore. Two guarded routes replace the old mounts:
 *
 *   GET /api/media/:id          — JWT-authenticated, tenant-checked
 *                                 (the asset's batch must belong to
 *                                 the caller; other tenants get 404
 *                                 so existence is not leaked).
 *   GET /api/media/signed/:token — public but capability-based: the
 *                                 HMAC token (see MediaSigningService)
 *                                 must be valid and unexpired. Used
 *                                 for dashboard <img> loads (2h) and
 *                                 Meta publishing fetches (15 min).
 */
@Controller('api/media')
export class MediaController {
  constructor(
    private prisma: PrismaService,
    private signing: MediaSigningService,
  ) {}

  private uploadsDir(): string {
    return path.join(process.cwd(), 'uploads');
  }

  private serveLocalFile(
    fileName: string,
    mimeType: string | null,
    res: Response,
  ) {
    const filePath = path.join(this.uploadsDir(), fileName);
    res.setHeader(
      'Content-Type',
      mimeType ||
        MIME_BY_EXT[path.extname(fileName).toLowerCase()] ||
        'application/octet-stream',
    );
    return res.sendFile(filePath);
  }

  private serveAsset(asset: any, res: Response) {
    if (asset.localPath) {
      // localPath values look like "api/uploads/<file>"; only the
      // basename is ever resolved inside the uploads directory.
      const fileName = path.basename(asset.localPath);
      if (fs.existsSync(path.join(this.uploadsDir(), fileName))) {
        return this.serveLocalFile(fileName, asset.mimeType, res);
      }
    }
    if (asset.originalUrl) {
      return res.redirect(asset.originalUrl);
    }
    throw new NotFoundException('Media file not available');
  }

  @Get('signed/:token')
  async serveSigned(@Param('token') token: string, @Res() res: Response) {
    const verified = this.signing.verify(token);
    if (!verified) {
      throw new UnauthorizedException('Invalid or expired media link');
    }
    const { subject } = verified;
    if (subject.startsWith('a:')) {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: subject.slice(2) },
      });
      if (!asset) throw new NotFoundException('Media not found');
      return this.serveAsset(asset, res);
    }
    if (subject.startsWith('f:')) {
      // Basename only: a crafted subject can never escape uploads/.
      const fileName = path.basename(subject.slice(2));
      if (!fs.existsSync(path.join(this.uploadsDir(), fileName))) {
        throw new NotFoundException('Media not found');
      }
      return this.serveLocalFile(fileName, null, res);
    }
    throw new UnauthorizedException('Invalid media link');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async serveOwned(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: { batch: { select: { userId: true } } },
    });
    if (!asset || asset.batch.userId !== req.user.userId) {
      throw new NotFoundException('Media not found');
    }
    return this.serveAsset(asset, res);
  }
}
