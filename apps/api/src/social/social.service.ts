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
    const maxAttempts = 40; // 2 minutes max (3s * 40)

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
    let mediaItems: { url: string, isVideo: boolean }[] = [];

    if (batch.mediaAssets && batch.mediaAssets.length > 0) {
      for (const asset of batch.mediaAssets) {
        let absolutePath = path.join(process.cwd(), asset.localPath);
        if (fs.existsSync(absolutePath)) {
          const isVideo = asset.mimeType?.startsWith('video/') || false;
          
          if (isVideo) {
             absolutePath = await this.compressVideo(absolutePath);
          }

          let url = '';
          if (process.env.NODE_ENV === 'production') {
             // Production logic would go here
             url = await this.uploadToCatbox(absolutePath);
          } else {
            url = await this.uploadToCatbox(absolutePath);
          }
          if (url) mediaItems.push({ url, isVideo });
        }
      }
    }

    if (mediaItems.length === 0) {
      this.logger.warn('No images found. Using placeholder URL.');
      mediaItems.push({ url: 'https://picsum.photos/800/800', isVideo: false });
    }

    try {
      let creationId: string;

      if (mediaItems.length === 1) {
        // Single media post
        const media = mediaItems[0];
        const params: any = {
          caption: caption,
          access_token: accessToken,
        };
        
        if (media.isVideo) {
          params.media_type = 'VIDEO';
          params.video_url = media.url;
        } else {
          params.image_url = media.url;
        }

        const containerRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`,
          null,
          { params }
        );
        creationId = containerRes.data.id;

        // If it's a video, we must poll before publishing
        if (media.isVideo) {
           await this.pollInstagramContainer(creationId, accessToken);
        }
      } else {
        // Carousel post
        const childContainerIds: string[] = [];
        
        for (const media of mediaItems) {
          const params: any = {
            is_carousel_item: true,
            access_token: accessToken,
          };
          if (media.isVideo) {
            params.media_type = 'VIDEO';
            params.video_url = media.url;
          } else {
            params.image_url = media.url;
          }

          const itemRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igAccountId}/media`,
            null,
            { params }
          );
          
          const itemId = itemRes.data.id;
          childContainerIds.push(itemId);
          
          // Must wait for video carousel items to process BEFORE creating the carousel container
          if (media.isVideo) {
            await this.pollInstagramContainer(itemId, accessToken);
          }
        }

        const carouselRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`,
          null,
          {
            params: {
              media_type: 'CAROUSEL',
              children: childContainerIds.join(','),
              caption: caption,
              access_token: accessToken,
            },
          }
        );
        creationId = carouselRes.data.id;
        
        // Polling the carousel container itself just in case
        await this.pollInstagramContainer(creationId, accessToken);
      }

      // Publish the container (single or carousel)
      const publishRes = await axios.post(
        `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: accessToken,
          },
        }
      );

      this.logger.log(`Successfully published to Instagram: ${publishRes.data.id}`);
      return { id: publishRes.data.id };
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
      if (batch.mediaAssets && batch.mediaAssets.length > 1) {
        // Multiple media - publish as album/feed with attached_media
        const mediaFbids: string[] = [];
        
        for (const asset of batch.mediaAssets) {
          let absolutePath = path.join(process.cwd(), asset.localPath);
          if (fs.existsSync(absolutePath)) {
            const isVideo = asset.mimeType?.startsWith('video/');
            
            if (isVideo) {
               absolutePath = await this.compressVideo(absolutePath);
            }

            const formData = new FormData();
            formData.append('source', fs.createReadStream(absolutePath));
            formData.append('published', 'false');
            formData.append('access_token', accessToken);

            const endpoint = isVideo ? 'videos' : 'photos';
            const res = await axios.post(
              `https://graph.facebook.com/v19.0/${pageId}/${endpoint}`,
              formData,
              { 
                headers: formData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
              }
            );
            mediaFbids.push(res.data.id);
            // Optional: for large Facebook videos, we might need to poll for status before attaching.
            // But usually attaching works immediately for standard videos.
          }
        }

        const attachedMedia = mediaFbids.map(id => ({ media_fbid: id }));
        
        const feedRes = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          null,
          {
            params: {
              message: caption,
              attached_media: JSON.stringify(attachedMedia),
              access_token: accessToken,
            },
          }
        );
        this.logger.log(`Successfully published mixed carousel to Facebook: ${feedRes.data.id}`);
        return { id: feedRes.data.id };

      } else if (batch.mediaAssets && batch.mediaAssets.length === 1) {
        // Single media
        const asset = batch.mediaAssets[0];
        let absolutePath = path.join(process.cwd(), asset.localPath);
        if (fs.existsSync(absolutePath)) {
          const isVideo = asset.mimeType?.startsWith('video/');
          
          if (isVideo) {
             absolutePath = await this.compressVideo(absolutePath);
          }

          const formData = new FormData();
          formData.append(isVideo ? 'description' : 'message', caption);
          formData.append('source', fs.createReadStream(absolutePath));
          formData.append('access_token', accessToken);

          const endpoint = isVideo ? 'videos' : 'photos';
          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/${endpoint}`,
            formData,
            { 
              headers: formData.getHeaders(),
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          );
          this.logger.log(`Successfully published media to Facebook: ${res.data.id}`);
          return { id: res.data.id };
        } else {
          throw new Error(`Local file not found: ${absolutePath}`);
        }
      } else {
        // Text-only post
        const res = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          null,
          {
            params: {
              message: caption,
              access_token: accessToken,
            },
          }
        );
        this.logger.log(`Successfully published text to Facebook: ${res.data.id}`);
        return { id: res.data.id };
      }
    } catch (error: any) {
      this.logger.error('Error publishing to Facebook', error.response?.data || error.message);
      throw error;
    }
  }
}
