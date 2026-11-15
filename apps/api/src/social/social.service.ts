import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';

import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import {
  encryptToken,
  decryptToken,
  assertTokenEncryptionConfigured,
} from './token-crypto';
import { MediaSigningService } from '../media/media-signing.service';

const execPromise = util.promisify(exec);

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OAUTH_STATE_FORMAT = /^[0-9a-f]{64}$/;

/**
 * Thrown when a publish is attempted before the user has chosen a
 * publishing destination in Settings. The batch processor treats this
 * as a user-actionable block (notification + back to review), not a
 * publish failure.
 */
export class MetaDestinationNotConfiguredError extends Error {
  constructor() {
    super(
      'No publishing destination selected. Choose your Facebook Page in Settings before publishing.',
    );
    this.name = 'MetaDestinationNotConfiguredError';
  }
}

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Optional() private mediaSigning?: MediaSigningService,
  ) {
    // Meta access tokens are encrypted at rest; production must not
    // boot without the key (see token-crypto.ts).
    assertTokenEncryptionConfigured();
  }

  /**
   * Fetch the user's stored Meta token, decrypted. Stored values may
   * be AES-256-GCM ciphertext (`enc:v1:`) or legacy plaintext from
   * before encryption landed — decryptToken handles both.
   */
  private async getMetaUserToken(userId: string): Promise<string | null> {
    const socialAcc = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform: 'META' } },
    });
    if (!socialAcc?.accessToken) return null;
    return decryptToken(socialAcc.accessToken);
  }

  private async compressVideo(inputPath: string): Promise<string> {
    const stats = fs.statSync(inputPath);
    const sizeMB = stats.size / (1024 * 1024);

    // Only compress if it's decently large to save processing time
    if (sizeMB < 5) {
      return inputPath;
    }

    const outputPath = inputPath.replace(
      /\.[^/.]+$/,
      `_compressed_${Date.now()}.mp4`,
    );
    this.logger.log(
      `Compressing video ${inputPath} (${sizeMB.toFixed(2)}MB) to ${outputPath}...`,
    );
    try {
      // crf 28 is a good balance between compression and quality, preset fast for speed
      await execPromise(
        `ffmpeg -i ${inputPath} -vcodec libx264 -crf 28 -preset fast ${outputPath}`,
      );
      return outputPath;
    } catch (e) {
      this.logger.error('Failed to compress video, returning original', e);
      return inputPath;
    }
  }

  private getPublicMediaUrl(absolutePath: string): string {
    const filename = path.basename(absolutePath);
    if (this.mediaSigning) {
      // P1-5: Meta fetches media through a short-lived signed URL
      // (15 minutes) — uploads are not publicly served anymore.
      return this.mediaSigning.signedUrl(`f:${filename}`, 15 * 60);
    }
    // Fallback for contexts where signing is not wired (unit tests):
    // the legacy public path. Production always injects the signer.
    const baseUrl =
      this.configService.get('PUBLIC_API_URL') ||
      'https://api-droproute.duckdns.org';
    return `${baseUrl}/api/uploads/${filename}`;
  }

  private async pollInstagramContainer(
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    this.logger.log(
      `Polling Instagram container ${containerId} for completion...`,
    );
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 200; // 10 minutes max (3s * 200)

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const statusRes = await axios.get(
          `https://graph.facebook.com/v19.0/${containerId}`,
          { params: { fields: 'status_code', access_token: accessToken } },
        );
        status = statusRes.data.status_code || 'ERROR';
        this.logger.log(`Container ${containerId} status: ${status}`);
      } catch (err: any) {
        this.logger.warn(
          `Failed to poll container ${containerId}, retrying...`,
        );
      }
      attempts++;
    }

    if (status !== 'FINISHED') {
      throw new Error(
        `Container ${containerId} failed to process. Final status: ${status}`,
      );
    }
  }

  private async padMedia(inputPath: string, isVideo: boolean): Promise<string> {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, `_padded_${Date.now()}${ext}`);
    this.logger.log(`Padding ${isVideo ? 'video' : 'image'} to 1:1 square...`);

    try {
      const vf =
        'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black';
      if (isVideo) {
        await execPromise(
          `ffmpeg -i "${inputPath}" -vf "${vf}" -vcodec libx264 -crf 28 -preset fast "${outputPath}"`,
        );
      } else {
        await execPromise(
          `ffmpeg -i "${inputPath}" -vf "${vf}" "${outputPath}"`,
        );
      }
      return outputPath;
    } catch (e) {
      this.logger.error('Failed to pad media, returning original', e);
      return inputPath;
    }
  }

  // ------------------------------------------------------------------
  // Explicit Meta destination (P0-4)
  //
  // Publishing used to auto-pick the first Facebook Page with a linked
  // Instagram account. For a reseller who manages several Pages that
  // can post a product to the WRONG shop. Now the reseller picks the
  // destination in Settings; it is stored on the SocialAccount row and
  // every publish path uses exactly those IDs. No saved destination →
  // publishing is blocked (MetaDestinationNotConfiguredError) until one
  // is chosen.
  // ------------------------------------------------------------------

  /** The user's saved publishing destination, or null when unset. */
  async getSavedDestination(userId: string): Promise<{
    pageId: string;
    pageName: string | null;
    igAccountId: string | null;
    igUsername: string | null;
  } | null> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform: 'META' } },
      select: {
        facebookPageId: true,
        facebookPageName: true,
        instagramUserId: true,
        instagramUsername: true,
      },
    });
    if (!account?.facebookPageId) return null;
    return {
      pageId: account.facebookPageId,
      pageName: account.facebookPageName,
      igAccountId: account.instagramUserId,
      igUsername: account.instagramUsername,
    };
  }

  private async fetchUserPages(userAccessToken: string): Promise<any[]> {
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts`,
      { params: { access_token: userAccessToken } },
    );
    return accountsRes.data?.data ?? [];
  }

  /**
   * List the connected account's Facebook Pages with their linked
   * Instagram accounts — the choices for the Settings destination
   * picker. A page whose IG lookup fails is still listed (without an
   * IG account) rather than failing the whole list.
   */
  async listMetaPages(userId: string): Promise<
    Array<{
      pageId: string;
      pageName: string;
      instagramAccountId: string | null;
      instagramUsername: string | null;
    }>
  > {
    const userAccessToken = await this.getMetaUserToken(userId);
    if (!userAccessToken) {
      throw new Error('Meta account is not connected.');
    }
    const pages = await this.fetchUserPages(userAccessToken);
    const result: Array<{
      pageId: string;
      pageName: string;
      instagramAccountId: string | null;
      instagramUsername: string | null;
    }> = [];
    for (const page of pages) {
      let instagramAccountId: string | null = null;
      let instagramUsername: string | null = null;
      try {
        const igRes = await axios.get(
          `https://graph.facebook.com/v19.0/${page.id}`,
          {
            params: {
              fields: 'instagram_business_account{id,username}',
              access_token: page.access_token,
            },
          },
        );
        const ig = igRes.data?.instagram_business_account;
        if (ig?.id) {
          instagramAccountId = ig.id;
          instagramUsername = ig.username ?? null;
        }
      } catch (igErr) {
        this.logger.warn(
          `Could not fetch Instagram account for page ${page.id}`,
        );
      }
      result.push({
        pageId: page.id,
        pageName: page.name,
        instagramAccountId,
        instagramUsername,
      });
    }
    return result;
  }

  /**
   * Save the user's chosen destination. The page must belong to the
   * connected account, and the Instagram account (when given) must be
   * the one actually linked to that page — both are validated against
   * Meta's live data, never trusted from the client.
   */
  async saveMetaDestination(
    userId: string,
    pageId: string,
    instagramAccountId?: string | null,
  ): Promise<{ success: boolean; message?: string }> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform: 'META' } },
    });
    if (!account) {
      return { success: false, message: 'Meta account is not connected' };
    }
    const pages = await this.listMetaPages(userId);
    const page = pages.find((p) => p.pageId === pageId);
    if (!page) {
      return {
        success: false,
        message: 'That Facebook Page does not belong to the connected account',
      };
    }
    let igId: string | null = null;
    let igUsername: string | null = null;
    if (instagramAccountId) {
      if (page.instagramAccountId !== instagramAccountId) {
        return {
          success: false,
          message: 'That Instagram account is not linked to the selected Page',
        };
      }
      igId = page.instagramAccountId;
      igUsername = page.instagramUsername;
    } else if (page.instagramAccountId) {
      // The picker submits the page's linked IG implicitly; store it so
      // Instagram publishing targets the account the user saw chosen.
      igId = page.instagramAccountId;
      igUsername = page.instagramUsername;
    }
    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        facebookPageId: page.pageId,
        facebookPageName: page.pageName,
        instagramUserId: igId,
        instagramUsername: igUsername,
      },
    });
    this.logger.log(
      `Saved Meta destination for user ${userId}: page ${page.pageName} (${page.pageId}), IG ${igId ?? 'none'}`,
    );
    return { success: true };
  }

  /**
   * Resolve the publishing context from the SAVED destination only.
   * Throws MetaDestinationNotConfiguredError when none is saved, and a
   * clear error when the saved page is no longer accessible — it never
   * falls back to another page.
   */
  private async getMetaPublishingContext(
    userId: string,
  ): Promise<{
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    igAccountId?: string;
  }> {
    const userAccessToken = await this.getMetaUserToken(userId);
    if (!userAccessToken) {
      throw new Error(
        'User Access Token is missing. Please connect your Meta account.',
      );
    }
    const saved = await this.getSavedDestination(userId);
    if (!saved) {
      throw new MetaDestinationNotConfiguredError();
    }
    let pages: any[];
    try {
      pages = await this.fetchUserPages(userAccessToken);
    } catch (err: any) {
      this.logger.error(
        'Failed to fetch Meta publishing context',
        err.response?.data || err.message,
      );
      throw new Error(
        'Failed to fetch Facebook Pages. Ensure your user account has the required permissions.',
      );
    }
    const page = pages.find((p) => p.id === saved.pageId);
    if (!page) {
      throw new Error(
        'Your saved Facebook Page is no longer accessible. Please choose your publishing destination again in Settings.',
      );
    }
    // Confirm the saved IG account is still the one linked to the page.
    // Live truth wins on a successful fetch; on a fetch failure keep
    // the saved value rather than blocking an otherwise-valid publish.
    let igAccountId: string | undefined = saved.igAccountId ?? undefined;
    try {
      const igRes = await axios.get(
        `https://graph.facebook.com/v19.0/${page.id}`,
        {
          params: {
            fields: 'instagram_business_account',
            access_token: page.access_token,
          },
        },
      );
      const liveIgId = igRes.data?.instagram_business_account?.id;
      if (liveIgId) igAccountId = liveIgId;
      else if (igAccountId) {
        this.logger.warn(
          `Saved Instagram account is no longer linked to page ${page.id}; Instagram publishing will fail until the destination is re-saved.`,
        );
        igAccountId = undefined;
      }
    } catch (igErr) {
      this.logger.warn(
        `Could not verify Instagram account for page ${page.id}; using the saved destination.`,
      );
    }

    this.logger.log(
      `Publishing destination: Facebook Page ${page.name} (${page.id})${igAccountId ? `, Instagram ${igAccountId}` : ''}`,
    );
    return {
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      igAccountId,
    };
  }

  async publishInstagram(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Instagram for batch ${batch.id}`);

    const userAccessToken = await this.getMetaUserToken(batch.userId);

    if (!userAccessToken) {
      throw new Error(
        'User Access Token is missing. Please connect your Meta account.',
      );
    }

    const { pageAccessToken, igAccountId } =
      await this.getMetaPublishingContext(batch.userId);

    if (!igAccountId) {
      throw new Error(
        'No Instagram Business Account linked to your Facebook Page.',
      );
    }
    const accessToken = pageAccessToken;

    const caption = batch.generatedContent?.instagramCaption || batch.rawText;
    let finalCreationId = '';

    try {
      const allAssets = batch.mediaAssets || [];
      if (allAssets.length === 0) {
        this.logger.warn('No images/videos found for Instagram.');
        return { id: 'success' };
      }

      // Max 10 items for a carousel
      const carouselAssets = allAssets.slice(0, 10);
      const childContainerIds: string[] = [];
      const isVideoMap: Record<string, boolean> = {};

      for (const asset of carouselAssets) {
        let absolutePath = path.join(
          process.cwd(),
          asset.localPath.replace(/^api\//, ''),
        );
        if (fs.existsSync(absolutePath)) {
          const isVideo = asset.mimeType?.startsWith('video/') || false;

          // Pad all media (images & videos) to perfect 1:1 square to satisfy Instagram API
          absolutePath = await this.padMedia(absolutePath, isVideo);

          const mediaUrl = this.getPublicMediaUrl(absolutePath);
          this.logger.log(`Using public URL for Instagram: ${mediaUrl}`);

          const params: any = {
            is_carousel_item: 'true',
            access_token: accessToken,
          };

          if (isVideo) {
            params.video_url = mediaUrl;
            params.media_type = 'VIDEO';
          } else {
            params.image_url = mediaUrl;
          }

          const itemRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media`,
            null,
            { params },
          );

          const itemId = itemRes.data.id;
          childContainerIds.push(itemId);
          isVideoMap[itemId] = isVideo;
        }
      }

      // Wait for all VIDEO containers to finish processing BEFORE creating the carousel container
      for (const id of childContainerIds) {
        if (isVideoMap[id]) {
          await this.pollInstagramContainer(id, accessToken);
        }
      }

      const carouselRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`,
        null,
        {
          params: {
            caption,
            media_type: 'CAROUSEL',
            children: childContainerIds.join(','),
            access_token: accessToken,
          },
        },
      );
      const creationId = carouselRes.data.id;
      finalCreationId = creationId; // Save as the primary ID

      await this.pollInstagramContainer(creationId, accessToken);
      const publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
        null,
        { params: { creation_id: creationId, access_token: accessToken } },
      );
      this.logger.log(
        `Successfully published Unified Instagram Carousel: ${publishRes.data.id}`,
      );

      return { id: finalCreationId || 'success' };
    } catch (error: any) {
      this.logger.error(
        'Error publishing to Instagram',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async publishFacebook(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Facebook for batch ${batch.id}`);

    const userAccessToken = await this.getMetaUserToken(batch.userId);

    if (!userAccessToken) {
      throw new Error(
        'Access Token is missing. Please connect your Meta account.',
      );
    }

    const { pageId, pageAccessToken: accessToken } =
      await this.getMetaPublishingContext(batch.userId);

    const caption = batch.generatedContent?.facebookCaption || batch.rawText;

    try {
      const photos =
        batch.mediaAssets?.filter(
          (a: any) => !a.mimeType?.startsWith('video/'),
        ) || [];
      const videos =
        batch.mediaAssets?.filter((a: any) =>
          a.mimeType?.startsWith('video/'),
        ) || [];

      let finalFeedResId = '';

      // 1. Publish all photos as a single Album Feed Post
      if (photos.length > 1) {
        const mediaFbids: string[] = [];
        for (const asset of photos) {
          const absolutePath = path.join(
            process.cwd(),
            asset.localPath.replace(/^api\//, ''),
          );
          if (fs.existsSync(absolutePath)) {
            const formData = new FormData();
            formData.append('source', fs.createReadStream(absolutePath));
            formData.append('published', 'false');
            formData.append('access_token', accessToken);

            const res = await axios.post(
              `https://graph.facebook.com/v19.0/${pageId}/photos`,
              formData,
              {
                headers: formData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
              },
            );
            mediaFbids.push(res.data.id);
          }
        }

        const attachedMedia = mediaFbids.map((id) => ({ media_fbid: id }));
        const feedRes = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          null,
          {
            params: {
              message: caption,
              attached_media: JSON.stringify(attachedMedia),
              access_token: accessToken,
            },
          },
        );
        finalFeedResId = feedRes.data.id;
        this.logger.log(
          `Successfully published photo album to Facebook: ${finalFeedResId}`,
        );
      } else if (photos.length === 1) {
        const absolutePath = path.join(
          process.cwd(),
          photos[0].localPath.replace(/^api\//, ''),
        );
        if (fs.existsSync(absolutePath)) {
          const formData = new FormData();
          formData.append('message', caption);
          formData.append('source', fs.createReadStream(absolutePath));
          formData.append('access_token', accessToken);

          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/photos`,
            formData,
            {
              headers: formData.getHeaders(),
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            },
          );
          finalFeedResId = res.data.id;
          this.logger.log(
            `Successfully published single photo to Facebook: ${finalFeedResId}`,
          );
        }
      }

      // 2. Publish all videos sequentially as individual posts
      for (const asset of videos) {
        let absolutePath = path.join(
          process.cwd(),
          asset.localPath.replace(/^api\//, ''),
        );
        if (fs.existsSync(absolutePath)) {
          absolutePath = await this.compressVideo(absolutePath);

          const formData = new FormData();
          formData.append('description', caption);
          formData.append('source', fs.createReadStream(absolutePath));
          formData.append('access_token', accessToken);

          // By omitting 'published=false', it directly posts to the page timeline.
          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/videos`,
            formData,
            {
              headers: formData.getHeaders(),
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            },
          );
          finalFeedResId = res.data.id; // overwrite so we return at least one ID
          this.logger.log(
            `Successfully published individual video to Facebook: ${res.data.id}`,
          );
        }
      }

      // 3. Text-only fallback if absolutely no media
      if (photos.length === 0 && videos.length === 0) {
        const res = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          null,
          { params: { message: caption, access_token: accessToken } },
        );
        finalFeedResId = res.data.id;
        this.logger.log(
          `Successfully published text to Facebook: ${finalFeedResId}`,
        );
      }

      return { id: finalFeedResId };
    } catch (error: any) {
      this.logger.error(
        'Error publishing to Facebook',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async getMetaOAuthUrl(userId: string): Promise<string> {
    const appId = this.configService.get('META_APP_ID');
    const redirectUri =
      this.configService.get('FACEBOOK_REDIRECT_URI') ||
      'http://localhost:3001/api/social/oauth/facebook/callback';

    // The state parameter is a cryptographically random nonce stored
    // server-side, bound to the initiating user, with a 10-minute TTL.
    // (It previously base64-encoded the userId, which anyone could forge
    // to attach a Meta token to someone else's account.)
    const state = randomBytes(32).toString('hex');
    await this.prisma.oAuthState.create({
      data: {
        nonce: state,
        userId,
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      },
    });

    const scope = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
    ].join(',');

    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;
  }

  async handleMetaOAuthCallback(code: string, state: string): Promise<void> {
    const appId = this.configService.get('META_APP_ID');
    const appSecret = this.configService.get('META_APP_SECRET');
    const redirectUri =
      this.configService.get('FACEBOOK_REDIRECT_URI') ||
      'http://localhost:3001/api/social/oauth/facebook/callback';

    // Consume the state nonce exactly once. Unknown, expired, malformed,
    // or replayed states are rejected before any token exchange happens.
    if (typeof state !== 'string' || !OAUTH_STATE_FORMAT.test(state)) {
      throw new Error('Invalid state parameter');
    }
    const record = await this.prisma.oAuthState.findUnique({
      where: { nonce: state },
    });
    if (!record) {
      throw new Error('Invalid state parameter');
    }
    const consumed = await this.prisma.oAuthState.deleteMany({
      where: { nonce: state, expiresAt: { gt: new Date() } },
    });
    if (consumed.count === 0) {
      throw new Error('Invalid or expired state parameter');
    }
    const userId = record.userId;

    // 1. Exchange code for short-lived access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;

    const tokenRes = await axios.get(tokenUrl);
    const shortLivedToken = tokenRes.data.access_token;

    // 2. Exchange short-lived token for long-lived token
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

    const longLivedRes = await axios.get(longLivedUrl);
    const longLivedToken = longLivedRes.data.access_token;

    // 3. Save the token for the user — encrypted at rest (AES-256-GCM,
    // see token-crypto.ts). Reads go through getMetaUserToken, which
    // also accepts legacy plaintext rows until the backfill runs.
    const encryptedToken = encryptToken(longLivedToken);
    await this.prisma.socialAccount.upsert({
      where: {
        userId_platform: {
          userId,
          platform: 'META',
        },
      },
      update: {
        accessToken: encryptedToken,
      },
      create: {
        userId,
        platform: 'META',
        accessToken: encryptedToken,
      },
    });

    this.logger.log(`Successfully connected Meta account for user ${userId}`);
  }

  async getSocialAccounts(userId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      select: {
        platform: true,
        facebookPageId: true,
        facebookPageName: true,
        instagramUserId: true,
        instagramUsername: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return accounts;
  }

  async disconnectMeta(userId: string) {
    await this.prisma.socialAccount.deleteMany({
      where: { userId, platform: 'META' },
    });
    this.logger.log(`Disconnected Meta for user ${userId}`);
    return { success: true };
  }

  async publishInstagramStory(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Instagram Story for batch ${batch.id}`);

    const userAccessToken = await this.getMetaUserToken(batch.userId);

    if (!userAccessToken) {
      throw new Error(
        'User Access Token is missing. Please connect your Meta account.',
      );
    }

    const { pageAccessToken, igAccountId } =
      await this.getMetaPublishingContext(batch.userId);

    if (!igAccountId) {
      throw new Error(
        'No Instagram Business Account linked to your Facebook Page.',
      );
    }
    const accessToken = pageAccessToken;

    try {
      const allAssets = batch.mediaAssets || [];
      if (allAssets.length === 0) {
        this.logger.warn('No images/videos found for Instagram Story.');
        return { id: 'success' };
      }

      // We publish only the first asset as a story (Instagram API limitation for simple flows)
      const asset = allAssets[0];
      let absolutePath = path.join(
        process.cwd(),
        asset.localPath.replace(/^api\//, ''),
      );
      let finalCreationId = '';

      if (fs.existsSync(absolutePath)) {
        const isVideo = asset.mimeType?.startsWith('video/') || false;

        const mediaUrl = this.getPublicMediaUrl(absolutePath);
        this.logger.log(`Using public URL for Instagram Story: ${mediaUrl}`);

        const params: any = {
          media_type: 'STORIES',
          access_token: accessToken,
        };

        if (isVideo) {
          params.video_url = mediaUrl;
        } else {
          params.image_url = mediaUrl;
        }

        const itemRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`,
          null,
          { params },
        );

        const creationId = itemRes.data.id;
        finalCreationId = creationId;

        await this.pollInstagramContainer(creationId, accessToken);

        const publishRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
          null,
          { params: { creation_id: creationId, access_token: accessToken } },
        );

        this.logger.log(
          `Successfully published Instagram Story: ${publishRes.data.id}`,
        );
      }
      return { id: finalCreationId || 'success' };
    } catch (error: any) {
      this.logger.error(
        'Error publishing to Instagram Story',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async publishFacebookStory(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Facebook Story for batch ${batch.id}`);

    const userAccessToken = await this.getMetaUserToken(batch.userId);

    if (!userAccessToken) {
      throw new Error(
        'Access Token is missing. Please connect your Meta account.',
      );
    }

    const { pageId, pageAccessToken: accessToken } =
      await this.getMetaPublishingContext(batch.userId);

    try {
      const allAssets = batch.mediaAssets || [];
      if (allAssets.length === 0) {
        this.logger.warn('No images/videos found for Facebook Story.');
        return { id: 'success' };
      }

      const asset = allAssets[0];
      let absolutePath = path.join(
        process.cwd(),
        asset.localPath.replace(/^api\//, ''),
      );
      let finalResId = '';

      if (fs.existsSync(absolutePath)) {
        const isVideo = asset.mimeType?.startsWith('video/') || false;

        if (isVideo) {
          absolutePath = await this.compressVideo(absolutePath);
        }

        const formData = new FormData();
        formData.append('source', fs.createReadStream(absolutePath));
        formData.append('access_token', accessToken);

        const endpoint = isVideo ? 'video_stories' : 'photo_stories';

        const res = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/${endpoint}`,
          formData,
          {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          },
        );
        finalResId = res.data.id || res.data.post_id || res.data.video_id;
        this.logger.log(
          `Successfully published to Facebook Story: ${finalResId}`,
        );
      }
      return { id: finalResId || 'success' };
    } catch (error: any) {
      this.logger.error(
        'Error publishing to Facebook Story',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}
