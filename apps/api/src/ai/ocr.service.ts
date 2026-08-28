import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as FormData from 'form-data';
import { BRAND_WATCHLIST } from './brand-watchlist';
import { BlurBox } from './image-mask.util';
const sharp = require('sharp');

type DetectedLogo = BlurBox & { word: string; brand: string; confidence?: number; polygon?: [number, number][] };

@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);

  private readonly brands = BRAND_WATCHLIST.map((brand) => {
    const clean = this.normalize(brand);
    const parts = brand.toLowerCase().split(/\s+/).map(p => this.normalize(p)).filter(p => p.length >= 3);
    return { raw: brand, clean, parts };
  }).filter((b) => b.clean.length >= 3);

  async onModuleDestroy() {
    // No worker to clean up anymore
  }

  async detectBrandLogos(imagePath: string): Promise<DetectedLogo[]> {
    if (!fs.existsSync(imagePath)) {
      this.logger.warn(`OCR skipped, file missing: ${imagePath}`);
      return [];
    }

    this.logger.log(`Starting PaddleOCR scan on ${imagePath}`);

    try {
      const originalBuffer = fs.readFileSync(imagePath);
      const metadata = await sharp(originalBuffer).metadata();
      const originalWidth = metadata.width || 1;
      const originalHeight = metadata.height || 1;

      const formData = new FormData();
      formData.append('file', originalBuffer, { filename: 'image.jpg' });

      const remoteUrl = process.env.REMOTE_OCR_SERVER_URL;
      let data: any = null;

      if (remoteUrl) {
        try {
          this.logger.log(`Attempting remote OCR at ${remoteUrl}...`);
          const response = await axios.post(`${remoteUrl}/detect-text`, formData, {
            headers: { 
              ...formData.getHeaders(),
              'Connection': 'close'
            },
            timeout: 120000,
          });
          data = response.data;
          this.logger.log('Remote OCR succeeded.');
        } catch (err: any) {
          this.logger.warn(`Remote OCR failed or timed out (${err.message}). Falling back to local server...`);
        }
      }

      if (!data) {
        const response = await axios.post('http://127.0.0.1:8000/detect-text', formData, {
          headers: { 
            ...formData.getHeaders(),
            'Connection': 'close'
          },
        });
        data = response.data;
      }

      const found: DetectedLogo[] = [];

      for (const det of data.detections || []) {
        const text = det.text || '';
        
        // Find if this text matches any of our brands
        const words = text.split(/\s+/).filter(w => w.trim());
        for (let i = 0; i < words.length; i++) {
          for (let span = 1; span <= 3 && i + span <= words.length; span++) {
            const slice = words.slice(i, i + span);
            const joined = slice.join(' ');
            const brand = this.matchBrand(joined);
            if (!brand) continue;

            const coords = det.polygon; 
            const polygon = coords.map((p: any) => [p[0], p[1]]) as [number, number][];
            const xs = polygon.map(p => p[0]);
            const ys = polygon.map(p => p[1]);
            
            const left = Math.max(0, Math.floor(Math.min(...xs)));
            const top = Math.max(0, Math.floor(Math.min(...ys)));
            const width = Math.min(originalWidth - left, Math.ceil(Math.max(...xs) - left));
            const height = Math.min(originalHeight - top, Math.ceil(Math.max(...ys) - top));
            const confidence = det.confidence || 0;

            found.push({
              left,
              top,
              width,
              height,
              word: joined,
              brand,
              confidence,
              polygon,
            });
          }
        }
      }

      this.logger.log(`Found ${found.length} brand detections`);
      return this.dedupeBoxes(found);
    } catch (err: any) {
      this.logger.error(`Failed to process OCR via Python server: ${err.message}`);
      return [];
    }
  }

  private matchBrand(raw: string): string | null {
    const text = this.normalize(raw);
    if (text.length < 3) return null;

    for (const brand of this.brands) {
      // 1. Exact match
      if (text === brand.clean) return brand.raw;
      
      // 2. Substring matches for whole brand
      if (text.length >= 4 && text.includes(brand.clean)) return brand.raw;
      if (brand.clean.length >= 5 && brand.clean.includes(text) && text.length >= 4) {
        return brand.raw;
      }
      
      // 3. Fuzzy match whole brand
      const allowedDistWhole = Math.floor(brand.clean.length / 3) + (brand.clean.length >= 8 ? 1 : 0);
      if (text.length >= 4 && brand.clean.length >= 4 && this.levenshtein(text, brand.clean) <= allowedDistWhole) {
        return brand.raw;
      }

      // 4. Advanced heuristic for severely distorted OCR (shiny surfaces, weird angles)
      // Checks if boundaries match, lengths are similar, and characters somewhat overlap
      if (brand.clean.length >= 6 && text.length >= brand.clean.length - 3 && text.length <= brand.clean.length + 3) {
        if (text[0] === brand.clean[0] && text[text.length - 1] === brand.clean[brand.clean.length - 1]) {
           let charMatches = 0;
           for (const char of text) {
             if (brand.clean.includes(char)) charMatches++;
           }
           if (charMatches / text.length >= 0.4) {
             const dist = this.levenshtein(text, brand.clean);
             if (dist <= Math.floor(brand.clean.length / 1.5)) {
                return brand.raw;
             }
           }
        }
      }

      // 5. Match brand parts (e.g. "jimmy", "choo")
      if (brand.parts.length > 1) {
        for (const part of brand.parts) {
          if (text === part) return brand.raw;
          if (part.length >= 5 && part.includes(text) && text.length >= 4) return brand.raw;
          if (text.length >= 4 && text.includes(part)) return brand.raw;
          
          if (text.length >= 4 && part.length >= 4) {
             const allowedDistPart = Math.floor(part.length / 3);
             if (this.levenshtein(text, part) <= allowedDistPart) {
               return brand.raw;
             }
          }
        }
      }
    }
    return null;
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private dedupeBoxes(found: DetectedLogo[]): DetectedLogo[] {
    const unique: DetectedLogo[] = [];
    for (const box of found) {
      const overlap = unique.some(
        (existing) =>
          existing.brand === box.brand &&
          Math.abs(existing.left - box.left) < 30 &&
          Math.abs(existing.top - box.top) < 30,
      );
      if (!overlap) unique.push(box);
    }
    return unique;
  }

  private levenshtein(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i++) dp[i][0] = i;
    for (let j = 0; j < cols; j++) dp[0][j] = j;
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }
}
