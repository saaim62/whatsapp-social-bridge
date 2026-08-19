import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('LLM_API_KEY');
    if (apiKey && apiKey !== 'test_gemini_key') {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    } else {
      this.logger.warn('No valid LLM_API_KEY found. AI features will be mocked.');
    }
  }

  async extractProductDetails(rawText: string): Promise<any> {
    if (!this.model) {
      return { productName: 'Mock Product', price: 'Rs. 1000', sizes: ['40', '41'] };
    }

    try {
      const prompt = `Extract product details from the following WhatsApp message.
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
        }
      });
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (e) {
      this.logger.error('Failed to extract product details', e);
      return {};
    }
  }

  async generateCaptions(extractedData: any): Promise<{ instagramCaption: string, facebookCaption: string, storyText: string }> {
    if (!this.model) {
      return { instagramCaption: 'Mock IG Caption', facebookCaption: 'Mock FB Caption', storyText: 'Mock Story' };
    }

    try {
      const prompt = `Given the following product details: ${JSON.stringify(extractedData)}
Generate 3 pieces of content:
1. Instagram caption with emojis and hashtags. Mention the features seamlessly. Instead of writing the actual price, use the exact string "{{PRICE}}" so it can be dynamically replaced later.
2. Facebook post caption. Use "{{PRICE}}" instead of the actual price.
3. Very short text for an Instagram story overlay. Use "{{PRICE}}" instead of the actual price.

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
        }
      });
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (e) {
      this.logger.error('Failed to generate captions', e);
      return { instagramCaption: '', facebookCaption: '', storyText: '' };
    }
  }
}
