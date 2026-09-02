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
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
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
    const accountId = this.configService.get<string>(`${prefix}ACCOUNT_ID`);
    const accessKeyId = this.configService.get<string>(`${prefix}ACCESS_KEY_ID`);
    const secretAccessKey = this.configService.get<string>(`${prefix}SECRET_ACCESS_KEY`);
    const bucketName = this.configService.get<string>(`${prefix}BUCKET_NAME`);
    const publicUrl = this.configService.get<string>(`${prefix}PUBLIC_URL`);

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
      this.logger.log(`Initialized R2 Account ${index}`);
    }
  }

  private async getAccountUsage(accountId: string): Promise<number> {
    const usage = await this.redisClient.get(`r2_usage:${accountId}`);
    return usage ? parseInt(usage, 10) : 0;
  }

  private async incrementAccountUsage(accountId: string, bytes: number): Promise<void> {
    await this.redisClient.incrby(`r2_usage:${accountId}`, bytes);
  }

  private async decrementAccountUsage(accountId: string, bytes: number): Promise<void> {
    const current = await this.getAccountUsage(accountId);
    if (current >= bytes) {
      await this.redisClient.decrby(`r2_usage:${accountId}`, bytes);
    } else {
      await this.redisClient.set(`r2_usage:${accountId}`, 0);
    }
  }

  private async selectAvailableAccount(fileSizeBytes: number): Promise<R2Account> {
    for (const account of this.accounts) {
      const usage = await this.getAccountUsage(account.id);
      if (usage + fileSizeBytes < this.MAX_BYTES_PER_ACCOUNT) {
        return account;
      }
    }
    throw new Error('All R2 accounts have reached the 9GB limit!');
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
      await this.redisClient.set(`r2_file_account:${filename}`, account.id);
      await this.redisClient.set(`r2_file_size:${filename}`, fileSizeBytes);

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

  async deleteFile(filename: string): Promise<void> {
    // Determine which account holds this file
    const accountId = await this.redisClient.get(`r2_file_account:${filename}`);
    if (!accountId) {
      this.logger.warn(`Cannot delete ${filename}: Account tracking not found`);
      return;
    }

    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return;

    try {
      const command = new DeleteObjectCommand({
        Bucket: account.bucketName,
        Key: filename,
      });
      await account.client.send(command);

      const sizeStr = await this.redisClient.get(`r2_file_size:${filename}`);
      if (sizeStr) {
        await this.decrementAccountUsage(accountId, parseInt(sizeStr, 10));
      }

      await this.redisClient.del(`r2_file_account:${filename}`);
      await this.redisClient.del(`r2_file_size:${filename}`);
    } catch (error) {
      this.logger.error(`Failed to delete ${filename} from R2 account ${accountId}`, error);
    }
  }
}
