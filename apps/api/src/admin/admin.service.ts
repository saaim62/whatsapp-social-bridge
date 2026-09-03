import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    // Top-level stats
    const totalUsers = await this.prisma.user.count();
    const totalBatches = await this.prisma.productBatch.count();
    const activePipelines = await this.prisma.productBatch.count({
      where: { status: { notIn: ['PUBLISHED', 'FAILED', 'RECEIVED'] } }
    });

    // Total Media Size and count
    const mediaAgg = await this.prisma.mediaAsset.aggregate({
      _sum: { fileSize: true },
      _count: { id: true },
    });
    
    // User Activity grouped by day (last 7 days)
    const activeUsersByDay: any = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "lastActiveAt") as date, COUNT(*)::int as count
      FROM "User"
      WHERE "lastActiveAt" >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', "lastActiveAt")
      ORDER BY date ASC
    `;

    // Storage growth (simplified for demo: total storage per day based on MediaAsset createdAt)
    const storageByDay: any = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt") as date, COALESCE(SUM("fileSize"), 0)::bigint as size
      FROM "MediaAsset"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;

    // OS level disk stats for uploads directory
    // Calculate actual size of uploads directory instead of reading the entire node's 7TB disk
    let serverStorageConsumedBytes = 0;
    const serverStorageTotalBytes = 50n * 1024n * 1024n * 1024n; // 50 GB (Hugging Face Free Tier Limit)
    
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const getDirSize = (dirPath: string): number => {
        let size = 0;
        const files = fs.readdirSync(dirPath);
        for (let i = 0; i < files.length; i++) {
          const filePath = path.join(dirPath, files[i]);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) size += stats.size;
          else if (stats.isDirectory()) size += getDirSize(filePath);
        }
        return size;
      };
      
      serverStorageConsumedBytes = getDirSize(uploadsDir);
    } catch (err) {
      console.error("Failed to read server disk stats", err);
    }
    
    const serverStorageFreeBytes = Number(serverStorageTotalBytes) - serverStorageConsumedBytes;

    return {
      totalUsers,
      totalBatches,
      activePipelines,
      totalMediaCount: mediaAgg._count.id || 0,
      totalStorageBytes: mediaAgg._sum.fileSize || 0,
      serverStorageTotalBytes,
      serverStorageConsumedBytes,
      serverStorageFreeBytes,
      activeUsersByDay: activeUsersByDay.map(row => ({
        date: row.date,
        count: Number(row.count)
      })),
      storageByDay: storageByDay.map(row => ({
        date: row.date,
        size: Number(row.size)
      })),
    };
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        batches: {
          select: { id: true, mediaAssets: { select: { id: true, fileSize: true, localPath: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return users.map(user => {
      let totalMedia = 0;
      let totalStorage = 0;
      user.batches.forEach(b => {
        totalMedia += b.mediaAssets.length;
        b.mediaAssets.forEach(m => {
          let fsize = m.fileSize || 0;
          if (fsize === 0 && m.localPath && fs.existsSync(m.localPath)) {
            try {
              fsize = fs.statSync(m.localPath).size;
            } catch (e) {
              // Ignore
            }
          }
          totalStorage += fsize;
        });
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
        city: user.city,
        country: user.country,
        isBlocked: user.isBlocked,
        isPaid: user.isPaid,
        trialEndsAt: user.trialEndsAt,
        batchCount: user.batches.length,
        mediaCount: totalMedia,
        storageUsed: totalStorage,
        storageLimitBytes: Number(user.storageLimitBytes)
      };
    });
  }

  async toggleBlockStatus(userId: string, isBlocked: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked }
    });
  }

  async updateStorageLimit(userId: string, storageLimitBytes: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        batches: {
          select: { mediaAssets: { select: { id: true, fileSize: true, localPath: true } } }
        }
      }
    });

    if (!user) throw new Error("User not found");

    // Calculate current usage
    let currentUsage = 0;
    user.batches.forEach(b => {
      b.mediaAssets.forEach(m => {
        let fsize = m.fileSize || 0;
        if (fsize === 0 && m.localPath && fs.existsSync(m.localPath)) {
          try {
            fsize = fs.statSync(m.localPath).size;
          } catch (e) {
            // Ignore
          }
        }
        currentUsage += fsize;
      });
    });

    // If new limit is lower than current usage, we must simulate archiving the excess.
    if (storageLimitBytes < currentUsage) {
      console.log(`[STORAGE] User ${user.email} quota reduced from ${user.storageLimitBytes} to ${storageLimitBytes}.`);
      console.log(`[STORAGE] Current usage (${currentUsage}) exceeds new limit. Simulating migration of excess data to local 'archive' directory...`);
      
      const fs = require('fs');
      const path = require('path');
      
      // Ensure archive directory exists
      const archiveDir = path.join(process.cwd(), 'uploads', 'archive');
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }

      // We'll flatten all media assets and sort by oldest first (to delete oldest).
      const allAssets: any[] = [];
      user.batches.forEach(b => {
        b.mediaAssets.forEach(m => {
          allAssets.push(m);
        });
      });
      // Sort is not strictly needed since we just need to clear some, but conceptually oldest is best.
      // For simplicity, we just delete until currentUsage <= storageLimitBytes.
      
      let amountToClear = currentUsage - storageLimitBytes;
      let cleared = 0;
      
      for (const asset of allAssets) {
        if (cleared >= amountToClear) break;
        if (asset.localPath && fs.existsSync(asset.localPath)) {
          const fileName = path.basename(asset.localPath);
          const archivePath = path.join(archiveDir, fileName);
          // Simulate migration
          fs.copyFileSync(asset.localPath, archivePath);
          fs.unlinkSync(asset.localPath);
          console.log(`[STORAGE] Migrated ${fileName} to archive and deleted locally.`);
        }
        
        // Remove from DB so it's formally cleared
        await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
        cleared += (asset.fileSize || 0);
      }
      console.log(`[STORAGE] Migration complete. Cleared ${cleared} bytes.`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { storageLimitBytes: BigInt(storageLimitBytes) }
    });
  }
}
