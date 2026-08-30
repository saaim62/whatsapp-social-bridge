import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@Request() req: any) {
    return this.notificationService.getNotifications(req.user.userId);
  }

  @Post()
  async createNotification(@Request() req: any, @Body() body: any) {
    return this.notificationService.createNotification(
      req.user.userId,
      body.title,
      body.message,
      body.type,
      body.link
    );
  }

  @Post('mark-all-read')
  async markAllAsRead(@Request() req: any) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @Post(':id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, req.user.userId);
  }
}
