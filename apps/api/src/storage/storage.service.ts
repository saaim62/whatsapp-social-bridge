import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';

interface R2Account {
  id: string;
  client: S3Client;
  bucketName: string;
  publicUrl: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private accounts: R2Account[] = [];
  private redisClient: Redis;
  private readonly MAX_BYTES_PER_ACCOUNT = 9 * 1024 * 1024 * 1024; // 9 GB

  constructor(private configService: ConfigService) {
    this.redisClient = new Redis({
      host: '127.0.0.1',
      port: 6379,
    });
  }

  onModuleInit() {
    this.loadAccount(1);
    this.loadAccount(2);
    if (this.accounts.length === 0) {
      this.logger.warn('No R2 accounts configured. Uploads will fail.');
    }
  }

  private loadAccount(index: number) {
    const prefix = `R2_ACC${index}_`;
    const clean = (val?: string) => val ? val.replace(/^["']|["']$/g, '').trim() : undefined;
    const accountId = clean(this.configService.get<string>(`${prefix}ACCOUNT_ID`));
    const accessKeyId = clean(this.configService.get<string>(`${prefix}ACCESS_KEY_ID`));
    const secretAccessKey = clean(this.configService.get<string>(`${prefix}SECRET_ACCESS_KEY`));
    const bucketName = clean(this.configService.get<string>(`${prefix}BUCKET_NAME`));
    const publicUrl = clean(this.configService.get<string>(`${prefix}PUBLIC_URL`));

    if (accountId && accessKeyId && secretAccessKey && bucketName) {
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.accounts.push({
        id: `account_${index}`,
        client,
        bucketName,
        publicUrl: publicUrl || '',
      });
      this.logger.log(`Initialized R2 Account ${index} (Bucket: ${bucketName})`);
    } else {
      this.logger.warn(`R2 Account ${index} credentials incomplete: accountId=${!!accountId}, key=${!!accessKeyId}, secret=${!!secretAccessKey}, bucket=${!!bucketName}`);
    }
  }

  private async getAccountUsage(accountId: string): Promise<number> {
    try {
      const usage = await this.redisClient.get(`r2_usage:${accountId}`);
      return usage ? parseInt(usage, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  private async incrementAccountUsage(accountId: string, bytes: number): Promise<void> {
    try {
      await this.redisClient.incrby(`r2_usage:${accountId}`, bytes);
    } catch (e) {
      this.logger.warn(`Could not increment R2 usage in Redis: ${e.message}`);
    }
  }

  private async decrementAccountUsage(accountId: string, bytes: number): Promise<void> {
    try {
      const current = await this.getAccountUsage(accountId);
      if (current >= bytes) {
        await this.redisClient.decrby(`r2_usage:${accountId}`, bytes);
      } else {
        await this.redisClient.set(`r2_usage:${accountId}`, 0);
      }
    } catch (e) {
      this.logger.warn(`Could not decrement R2 usage in Redis: ${e.message}`);
    }
  }

  private async selectAvailableAccount(fileSizeBytes: number): Promise<R2Account> {
    for (const account of this.accounts) {
      const usage = await this.getAccountUsage(account.id);
      if (usage + fileSizeBytes < this.MAX_BYTES_PER_ACCOUNT) {
        return account;
      }
    }
    // If accounts exist, return the first one as fallback
    if (this.accounts.length > 0) {
      return this.accounts[0];
    }
    throw new Error('No R2 accounts configured');
  }

  async uploadBuffer(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    if (this.accounts.length === 0) {
      throw new Error('No R2 accounts configured');
    }

    const fileSizeBytes = buffer.length;
    const account = await this.selectAvailableAccount(fileSizeBytes);

    try {
      const command = new PutObjectCommand({
        Bucket: account.bucketName,
        Key: filename,
        Body: buffer,
        ContentType: mimeType,
      });

      await account.client.send(command);
      
      // Track usage
      await this.incrementAccountUsage(account.id, fileSizeBytes);
      
      // Save which account this file belongs to in Redis (for deletion later)
      try {
        await this.redisClient.set(`r2_file_account:${filename}`, account.id);
        await this.redisClient.set(`r2_file_size:${filename}`, fileSizeBytes);
      } catch (redisErr) {
        // Non-critical
      }

      if (account.publicUrl) {
        const baseUrl = account.publicUrl.endsWith('/') ? account.publicUrl.slice(0, -1) : account.publicUrl;
        return `${baseUrl}/${filename}`;
      }
      
      return filename;
    } catch (error) {
      this.logger.error(`Failed to upload ${filename} to R2 account ${account.id}`, error);
      throw error;
    }
  }

  async getStorageStats() {
    const stats: any[] = [];
    for (const acc of this.accounts) {
      const usage = await this.getAccountUsage(acc.id);
      stats.push({
        id: acc.id,
        bucketName: acc.bucketName,
        publicUrl: acc.publicUrl,
        usageBytes: usage,
        limitBytes: this.MAX_BYTES_PER_ACCOUNT,
      });
    }
    return stats;
  }

  async deleteFile(filename: string): Promise<void> {
    let accountId: string | null = null;
    try {
      accountId = await this.redisClient.get(`r2_file_account:${filename}`);
    } catch (e) { }

    const account = accountId ? this.accounts.find(a => a.id === accountId) : this.accounts[0];
    if (!account) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: account.bucketName,
        Key: filename,
      });
      await account.client.send(command);

      try {
        const sizeStr = await this.redisClient.get(`r2_file_size:${filename}`);
        if (sizeStr) {
          await this.decrementAccountUsage(account.id, parseInt(sizeStr, 10));
        }
        await this.redisClient.del(`r2_file_account:${filename}`);
        await this.redisClient.del(`r2_file_size:${filename}`);
      } catch (e) { }
    } catch (error) {
      this.logger.error(`Failed to delete ${filename} from R2 account ${account.id}`, error);
    }
  }
}
