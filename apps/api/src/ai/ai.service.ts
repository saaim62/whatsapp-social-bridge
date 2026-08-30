import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import * as fs from 'fs';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('LLM_API_KEY');
    if (apiKey && apiKey !== 'test_gemini_key') {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-3.5-flash-lite',
      });
    } else {
      this.logger.warn(
        'No valid LLM_API_KEY found. AI features will be mocked.',
      );
    }
  }

  async extractProductDetails(rawText: string): Promise<any> {
    if (!this.model) {
      return {
        productName: 'Mock Product',
        price: 'Rs. 1000',
        sizes: ['40', '41'],
      };
    }

    try {
      const prompt = `Extract product details from the following WhatsApp message.
CRITICAL INSTRUCTION: Do NOT include any luxury brand names or altered spellings of brands (no Rolex, roolax, Omega, Casio, etc.). Focus exclusively on material, movement, size, color, and build quality.

Return ONLY a JSON object with the following schema:
{
  "product_name": "string",
  "price": "string",
  "features": ["string"]
}
In the "features" array, include all specific watch or product specifications like "Quartz movement", "Moonphase working", "Butterfly master lock", etc.
If a field is missing, leave it as null or empty array.
Message:
${rawText}`;
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (e) {
      this.logger.error('Failed to extract product details', e);
      return {};
    }
  }

  async generateCaptions(extractedData: any): Promise<{
    instagramCaption: string;
    facebookCaption: string;
    storyText: string;
  }> {
    if (!this.model) {
      return {
        instagramCaption: 'Mock IG Caption',
        facebookCaption: 'Mock FB Caption',
        storyText: 'Mock Story',
      };
    }

    try {
      const prompt = `Given the following product details: ${JSON.stringify(extractedData)}
Generate 3 pieces of content:
1. Instagram caption with emojis and hashtags. Mention the features seamlessly. Instead of writing the actual price, use the exact string "{{PRICE}}" so it can be dynamically replaced later.
2. Facebook post caption. Use "{{PRICE}}" instead of the actual price.
3. Very short text for an Instagram story overlay. Use "{{PRICE}}" instead of the actual price.

CRITICAL COPYRIGHT INSTRUCTION: 
- Do NOT include any luxury brand names or altered spellings of brands (no Rolex, Omega, etc.).
- Focus exclusively on material, movement, size, color, and build quality (e.g., "Automatic Mechanical", "Sapphire Glass", "Stainless Steel").
- Include a CTA in the Instagram and Facebook captions: "DM us or WhatsApp to see full details and order."
- NEVER generate hashtags of official brand names. Only use generic hashtags like #luxurywatch, #timepiece, #premiumquality.

Return ONLY a JSON object with this exact schema:
{
  "instagramCaption": "string",
  "facebookCaption": "string",
  "storyText": "string"
}`;
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (e) {
      this.logger.error('Failed to generate captions', e);
      return { instagramCaption: '', facebookCaption: '', storyText: '' };
    }
  }

  async detectLogoBoundingBoxes(imagePath: string): Promise<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null> {
    if (!this.model) {
      return null;
    }

    try {
      if (!fs.existsSync(imagePath)) return null;
      const imageBuffer = fs.readFileSync(imagePath);
      const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

      const imagePart: Part = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType,
        },
      };

      const prompt = `You are a brand rights protection scanner. Detect if there is any visible brand logo on this product.
If a brand logo is detected, return its bounding box coordinates scaled from 0 to 1000 in this EXACT JSON format:
{ "hasLogo": true, "box": { "ymin": 0, "xmin": 0, "ymax": 1000, "xmax": 1000 } }
If no logo is detected, return:
{ "hasLogo": false }

Return ONLY the JSON object.`;

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [imagePart, { text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const responseText = result.response.text();
      const data = JSON.parse(responseText);

      if (data.hasLogo && data.box) {
        // Wait, we need the original image dimensions to convert the 0-1000 scale to pixels.
        // We will assume the caller does this or we do it here if we use sharp to get metadata.
        // But since we just need to return normalized coordinates to the caller...
        // Let's return the normalized ones, and let the caller (BatchService) scale it, OR we scale it here if we read it.
        // For simplicity, let's return the normalized box.
        return {
          top: data.box.ymin / 1000,
          left: data.box.xmin / 1000,
          height: (data.box.ymax - data.box.ymin) / 1000,
          width: (data.box.xmax - data.box.xmin) / 1000,
        };
      }
      return null;
    } catch (e) {
      this.logger.error('Failed to detect logos', e);
      return null;
    }
  }
}
