import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(private configService: ConfigService) {}

  private async compressVideo(inputPath: string): Promise<string> {
    const stats = fs.statSync(inputPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    // Only compress if it's decently large to save processing time
    if (sizeMB < 5) {
      return inputPath;
    }

    const outputPath = inputPath.replace(/\.[^/.]+$/, `_compressed_${Date.now()}.mp4`);
    this.logger.log(`Compressing video ${inputPath} (${sizeMB.toFixed(2)}MB) to ${outputPath}...`);
    try {
      // crf 28 is a good balance between compression and quality, preset fast for speed
      await execPromise(`ffmpeg -i ${inputPath} -vcodec libx264 -crf 28 -preset fast ${outputPath}`);
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

    const catboxRes = await axios.post('https://catbox.moe/user/api.php', formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return catboxRes.data;
  }

  private async pollInstagramContainer(containerId: string, accessToken: string): Promise<void> {
    this.logger.log(`Polling Instagram container ${containerId} for completion...`);
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 200; // 10 minutes max (3s * 200)

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        const statusRes = await axios.get(
          `https://graph.facebook.com/v19.0/${containerId}`,
          { params: { fields: 'status_code', access_token: accessToken } }
        );
        status = statusRes.data.status_code || 'ERROR';
        this.logger.log(`Container ${containerId} status: ${status}`);
      } catch (err: any) {
        this.logger.warn(`Failed to poll container ${containerId}, retrying...`);
      }
      attempts++;
    }

    if (status !== 'FINISHED') {
      throw new Error(`Container ${containerId} failed to process. Final status: ${status}`);
    }
  }

  async publishInstagram(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Instagram for batch ${batch.id}`);
    const igAccountId = this.configService.get('INSTAGRAM_ACCOUNT_ID');
    const accessToken = this.configService.get('FACEBOOK_PAGE_ACCESS_TOKEN');

    if (!igAccountId || !accessToken) {
      throw new Error('Instagram Account ID or Page Access Token is missing');
    }

    const caption = batch.generatedContent?.instagramCaption || batch.rawText;
    let finalCreationId = '';

    try {
      const photos = batch.mediaAssets?.filter((a: any) => !a.mimeType?.startsWith('video/')) || [];
      const videos = batch.mediaAssets?.filter((a: any) => a.mimeType?.startsWith('video/')) || [];

      // 1. Publish Photos (Carousel or Single)
      if (photos.length > 1) {
        // Instagram limit is 10 items per carousel
        const carouselPhotos = photos.slice(0, 10);
        const childContainerIds: string[] = [];
        
        for (const asset of carouselPhotos) {
          const absolutePath = path.join(process.cwd(), asset.localPath);
          if (fs.existsSync(absolutePath)) {
            const catboxUrl = await this.uploadToCatbox(absolutePath);
            const itemRes = await axios.post(
              `https://graph.facebook.com/v19.0/${igAccountId}/media`,
              null,
              { params: { image_url: catboxUrl, is_carousel_item: true, access_token: accessToken } }
            );
            childContainerIds.push(itemRes.data.id);
          }
        }

        const carouselRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`,
          null,
          { params: { caption, media_type: 'CAROUSEL', children: childContainerIds.join(','), access_token: accessToken } }
        );
        const creationId = carouselRes.data.id;
        finalCreationId = creationId; // Save as the primary ID
        
        await this.pollInstagramContainer(creationId, accessToken);
        const publishRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
          null,
          { params: { creation_id: creationId, access_token: accessToken } }
        );
        this.logger.log(`Successfully published Instagram photo carousel: ${publishRes.data.id}`);
        
      } else if (photos.length === 1) {
        const absolutePath = path.join(process.cwd(), photos[0].localPath);
        if (fs.existsSync(absolutePath)) {
          const catboxUrl = await this.uploadToCatbox(absolutePath);
          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media`,
            null,
            { params: { image_url: catboxUrl, caption, access_token: accessToken } }
          );
          const creationId = res.data.id;
          finalCreationId = creationId;
          
          await this.pollInstagramContainer(creationId, accessToken);
          const publishRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
            null,
            { params: { creation_id: creationId, access_token: accessToken } }
          );
          this.logger.log(`Successfully published single Instagram photo: ${publishRes.data.id}`);
        }
      }

      // 2. Publish Videos (Individual REELS)
      for (const asset of videos) {
        let absolutePath = path.join(process.cwd(), asset.localPath);
        if (fs.existsSync(absolutePath)) {
          absolutePath = await this.compressVideo(absolutePath);
          const catboxUrl = await this.uploadToCatbox(absolutePath);
          
          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media`,
            null,
            { params: { video_url: catboxUrl, media_type: 'REELS', caption, access_token: accessToken } }
          );
          
          const creationId = res.data.id;
          if (!finalCreationId) finalCreationId = creationId;
          
          await this.pollInstagramContainer(creationId, accessToken);
          const publishRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
            null,
            { params: { creation_id: creationId, access_token: accessToken } }
          );
          this.logger.log(`Successfully published Instagram Reel video: ${publishRes.data.id}`);
        }
      }

      if (photos.length === 0 && videos.length === 0) {
        this.logger.warn('No images/videos found for Instagram.');
      }

      return { id: finalCreationId || 'success' };
    } catch (error: any) {
      this.logger.error('Error publishing to Instagram', error.response?.data || error.message);
      throw error;
    }
  }

  async publishFacebook(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Facebook for batch ${batch.id}`);
    const pageId = this.configService.get('FACEBOOK_PAGE_ID');
    const accessToken = this.configService.get('FACEBOOK_PAGE_ACCESS_TOKEN');

    if (!pageId || !accessToken) {
      throw new Error('Facebook Page ID or Access Token is missing');
    }

    const caption = batch.generatedContent?.facebookCaption || batch.rawText;
    
    try {
      const photos = batch.mediaAssets?.filter((a: any) => !a.mimeType?.startsWith('video/')) || [];
      const videos = batch.mediaAssets?.filter((a: any) => a.mimeType?.startsWith('video/')) || [];
      
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
              { headers: formData.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
            );
            mediaFbids.push(res.data.id);
          }
        }

        const attachedMedia = mediaFbids.map(id => ({ media_fbid: id }));
        const feedRes = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          null,
          { params: { message: caption, attached_media: JSON.stringify(attachedMedia), access_token: accessToken } }
        );
        finalFeedResId = feedRes.data.id;
        this.logger.log(`Successfully published photo album to Facebook: ${finalFeedResId}`);
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
            { headers: formData.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
          );
          finalFeedResId = res.data.id;
          this.logger.log(`Successfully published single photo to Facebook: ${finalFeedResId}`);
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
            { headers: formData.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
          );
          finalFeedResId = res.data.id; // overwrite so we return at least one ID
          this.logger.log(`Successfully published individual video to Facebook: ${res.data.id}`);
        }
      }

      // 3. Text-only fallback if absolutely no media
      if (photos.length === 0 && videos.length === 0) {
        const res = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          null,
          { params: { message: caption, access_token: accessToken } }
        );
        finalFeedResId = res.data.id;
        this.logger.log(`Successfully published text to Facebook: ${finalFeedResId}`);
      }

      return { id: finalFeedResId };
    } catch (error: any) {
      this.logger.error('Error publishing to Facebook', error.response?.data || error.message);
      throw error;
    }
  }
}
