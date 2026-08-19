import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(private configService: ConfigService) {}

  private async uploadToCatbox(absolutePath: string): Promise<string> {
    this.logger.log(`Uploading ${absolutePath} temporarily to Catbox.moe...`);
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', fs.createReadStream(absolutePath));

    const catboxRes = await axios.post('https://catbox.moe/user/api.php', formData, {
      headers: formData.getHeaders(),
    });
    return catboxRes.data;
  }

  async publishInstagram(batch: any): Promise<{ id: string }> {
    this.logger.log(`Publishing to Instagram for batch ${batch.id}`);
    const igAccountId = this.configService.get('INSTAGRAM_ACCOUNT_ID');
    const accessToken = this.configService.get('FACEBOOK_PAGE_ACCESS_TOKEN');

    if (!igAccountId || !accessToken) {
      throw new Error('Instagram Account ID or Page Access Token is missing');
    }

    const caption = batch.generatedContent?.instagramCaption || batch.rawText;
    
    // We will collect objects: { url, isVideo }
    let mediaItems: { url: string, isVideo: boolean }[] = [];

    if (batch.mediaAssets && batch.mediaAssets.length > 0) {
      for (const asset of batch.mediaAssets) {
        const absolutePath = path.join(process.cwd(), asset.localPath);
        if (fs.existsSync(absolutePath)) {
          const isVideo = asset.mimeType?.startsWith('video/') || false;
          let url = '';
          if (process.env.NODE_ENV === 'production') {
            // url = `https://yourdomain.com/${asset.localPath}`;
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
          childContainerIds.push(itemRes.data.id);
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
          const absolutePath = path.join(process.cwd(), asset.localPath);
          if (fs.existsSync(absolutePath)) {
            const isVideo = asset.mimeType?.startsWith('video/');
            const formData = new FormData();
            formData.append('source', fs.createReadStream(absolutePath));
            formData.append('published', 'false');
            formData.append('access_token', accessToken);

            const endpoint = isVideo ? 'videos' : 'photos';
            const res = await axios.post(
              `https://graph.facebook.com/v19.0/${pageId}/${endpoint}`,
              formData,
              { headers: formData.getHeaders() }
            );
            mediaFbids.push(res.data.id);
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
        const absolutePath = path.join(process.cwd(), asset.localPath);
        if (fs.existsSync(absolutePath)) {
          const isVideo = asset.mimeType?.startsWith('video/');
          const formData = new FormData();
          formData.append(isVideo ? 'description' : 'message', caption);
          formData.append('source', fs.createReadStream(absolutePath));
          formData.append('access_token', accessToken);

          const endpoint = isVideo ? 'videos' : 'photos';
          const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/${endpoint}`,
            formData,
            { headers: formData.getHeaders() }
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
