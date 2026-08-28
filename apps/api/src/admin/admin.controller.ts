import { Controller, Get, UseGuards, Patch, Param, Body, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getAllUsers();
  }

  @Patch('users/:id/block')
  async toggleBlockStatus(@Param('id') id: string, @Body('isBlocked') isBlocked: boolean) {
    return this.adminService.toggleBlockStatus(id, isBlocked);
  }

  @Post('users/:id/storage')
  async updateStorageLimit(
    @Param('id') userId: string,
    @Body() body: { storageLimitBytes: number }
  ) {
    if (!body.storageLimitBytes || body.storageLimitBytes < 0) {
      throw new Error("Invalid storage limit");
    }
    const result = await this.adminService.updateStorageLimit(userId, body.storageLimitBytes);
    return { success: true, storageLimitBytes: Number(result.storageLimitBytes) };
  }
}
