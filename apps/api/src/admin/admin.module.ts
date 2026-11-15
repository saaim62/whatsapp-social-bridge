import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    PrismaService,
    StorageService,
    AdminGuard,
    OwnerGuard,
  ],
})
export class AdminModule {}
