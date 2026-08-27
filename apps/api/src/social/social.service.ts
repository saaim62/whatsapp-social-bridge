import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';

import { PrismaService } from '../prisma/prisma.service';

const execPromise = util.promisify(exec);

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

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

  private async uploadToCatbox(absolutePath: string): Promise<string> {
    this.logger.log(`Uploading ${absolutePath} temporarily to Catbox.moe...`);
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', fs.createReadStream(absolutePath));

    const catboxRes = await axios.post(
      'https://catbox.moe/user/api.php',
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    );
    return catboxRes.data;
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

  private async getMetaPublishingContext(userAccessToken: string): Promise<{ pageId: string, pageName: string, pageAccessToken: string, igAccountId?: string }> {
    try {
      // 1. Get the user's Facebook Pages
      const accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
        params: { access_token: userAccessToken }
      });
      
      const pages = accountsRes.data.data;
      if (!pages || pages.length === 0) {
        throw new Error('No Facebook Pages found for this user.');
      }
      
      let selectedPage = pages[0];
      let igAccountId: string | undefined = undefined;

      // 2. Find a page that has an Instagram Business Account linked
      for (const page of pages) {
        try {
          const igRes = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
            params: { fields: 'instagram_business_account', access_token: page.access_token }
          });
          if (igRes.data.instagram_business_account?.id) {
            selectedPage = page;
            igAccountId = igRes.data.instagram_business_account.id;
            break; // Found a good page!
          }
        } catch (igErr) {
          this.logger.warn(`Could not fetch Instagram account for page ${page.id}`);
        }
      }
      
      this.logger.log(`Selected Facebook Page: ${selectedPage.name} (${selectedPage.id})`);
      if (igAccountId) {
        this.logger.log(`Found linked Instagram Business Account: ${igAccountId}`);
      } else {
        this.logger.warn(`No Instagram Business Account linked to ${selectedPage.name}`);
      }

      return { 
        pageId: selectedPage.id, 
        pageName: selectedPage.name,
        pageAccessToken: selectedPage.access_token, 
        igAccountId 
      };
    } catch (err: any) {
      this.logger.error('Failed to fetch Meta publishing context', err.response?.data || err.message);
      throw new Error('Failed to fetch Facebook Pages. Ensure your user account has the required permissions.');
    }
  }

  async publishInstagram(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Instagram for batch ${batch.id}`);
    
    // We assume the Meta account is linked
    const socialAcc = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId: batch.userId, platform: 'META' } }
    });

    const userAccessToken = socialAcc?.accessToken;

    if (!userAccessToken) {
      throw new Error('User Access Token is missing. Please connect your Meta account.');
    }

    const { pageAccessToken, igAccountId } = await this.getMetaPublishingContext(userAccessToken);

    if (!igAccountId) {
      throw new Error('No Instagram Business Account linked to your Facebook Page.');
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
        let absolutePath = path.join(process.cwd(), asset.localPath);
        if (fs.existsSync(absolutePath)) {
          const isVideo = asset.mimeType?.startsWith('video/') || false;

          // Pad all media (images & videos) to perfect 1:1 square to satisfy Instagram API
          absolutePath = await this.padMedia(absolutePath, isVideo);

          const catboxUrl = await this.uploadToCatbox(absolutePath);

          const params: any = {
            is_carousel_item: 'true',
            access_token: accessToken,
          };

          if (isVideo) {
            params.video_url = catboxUrl;
            params.media_type = 'VIDEO';
          } else {
            params.image_url = catboxUrl;
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
    
    const socialAcc = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId: batch.userId, platform: 'META' } }
    });

    const userAccessToken = socialAcc?.accessToken;

    if (!userAccessToken) {
      throw new Error('Access Token is missing. Please connect your Meta account.');
    }

    const { pageId, pageAccessToken: accessToken } = await this.getMetaPublishingContext(userAccessToken);

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
          const absolutePath = path.join(process.cwd(), asset.localPath);
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
        const absolutePath = path.join(process.cwd(), photos[0].localPath);
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
        let absolutePath = path.join(process.cwd(), asset.localPath);
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

  getMetaOAuthUrl(userId: string): string {
    const appId = this.configService.get('META_APP_ID');
    const redirectUri = this.configService.get('FACEBOOK_REDIRECT_URI') || 'http://130.110.113.71:3001/api/social/oauth/facebook/callback';
    
    // Encode userId in state to correlate the callback
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    
    const scope = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'].join(',');
    
    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;
  }

  async handleMetaOAuthCallback(code: string, stateBase64: string): Promise<void> {
    const appId = this.configService.get('META_APP_ID');
    const appSecret = this.configService.get('META_APP_SECRET');
    const redirectUri = this.configService.get('FACEBOOK_REDIRECT_URI') || 'http://130.110.113.71:3001/api/social/oauth/facebook/callback';

    // Decode state
    let userId: string;
    try {
      const stateObj = JSON.parse(Buffer.from(stateBase64, 'base64').toString('utf-8'));
      userId = stateObj.userId;
    } catch (e) {
      throw new Error('Invalid state parameter');
    }

    if (!userId) {
      throw new Error('User ID not found in state');
    }

    // 1. Exchange code for short-lived access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    
    const tokenRes = await axios.get(tokenUrl);
    const shortLivedToken = tokenRes.data.access_token;

    // 2. Exchange short-lived token for long-lived token
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    
    const longLivedRes = await axios.get(longLivedUrl);
    const longLivedToken = longLivedRes.data.access_token;

    // 3. Save the token for the user
    await this.prisma.socialAccount.upsert({
      where: {
        userId_platform: {
          userId,
          platform: 'META',
        }
      },
      update: {
        accessToken: longLivedToken,
      },
      create: {
        userId,
        platform: 'META',
        accessToken: longLivedToken,
      }
    });

    this.logger.log(`Successfully connected Meta account for user ${userId}`);
  }

  async getSocialAccounts(userId: string) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      select: { platform: true, createdAt: true, updatedAt: true }
    });
    return accounts;
  }

  async disconnectMeta(userId: string) {
    await this.prisma.socialAccount.deleteMany({
      where: { userId, platform: 'META' }
    });
    this.logger.log(`Disconnected Meta for user ${userId}`);
    return { success: true };
  }
}
