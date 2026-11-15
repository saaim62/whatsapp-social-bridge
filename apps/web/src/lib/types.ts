/**
 * Shared shapes for API responses consumed by the web app. These mirror
 * the NestJS API's Prisma models / response payloads; the fetch layer
 * casts `res.json()` results to these types at the boundary.
 */

export interface ExtractedData {
  product_name?: string | null;
  brand?: string | null;
  price?: string | null;
  description?: string | null;
  features?: string[];
  selling_price?: string | null;
  selling_price_value?: number | null;
  price_needs_review?: boolean;
  price_ambiguity?: string | null;
  manual_price_override?: number | null;
  [key: string]: unknown;
}

export interface MediaAsset {
  id: string;
  batchId: string;
  type: string;
  originalUrl: string | null;
  localPath: string | null;
  mimeType: string | null;
  isBlurred?: boolean;
  /** True while the blur/mask worker is processing this asset. */
  isProcessing?: boolean;
  /** Signed display URL attached by the API (P1-5). */
  mediaUrl?: string;
  createdAt?: string;
}

export interface GeneratedContent {
  id: string;
  batchId: string;
  platform: string;
  caption: string | null;
  hashtags: string[];
  status: string;
}

export interface Publication {
  id: string;
  batchId: string;
  platform: string;
  status: string;
  externalId?: string | null;
  externalUrl?: string | null;
  error?: string | null;
  publishedAt?: string | null;
}

export interface ProductBatch {
  id: string;
  userId: string;
  senderId: string;
  senderName: string | null;
  status: string;
  rawText: string | null;
  extractedData: ExtractedData | null;
  createdAt: string;
  updatedAt: string;
  mediaAssets: MediaAsset[];
  generatedContent: GeneratedContent[] | null;
  publications: Publication[];
}

export interface DbNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface WhatsAppSource {
  id: string;
  jid: string;
  name: string | null;
  type: string;
  isEnabled: boolean;
  profilePicUrl?: string | null;
}

export interface AppSettings {
  id: string;
  userId: string;
  isSyncActive: boolean;
  historySyncDepthHours: number;
  marginType: 'PERCENT' | 'FIXED';
  marginValue: number;
  priceRounding: number;
  captionFooter: string | null;
  [key: string]: unknown;
}
