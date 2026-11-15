import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateNotificationDto } from './dto/notification.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@Request() req: AuthenticatedRequest) {
    return this.notificationService.getNotifications(req.user.userId);
  }

  @Post()
  async createNotification(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateNotificationDto,
  ) {
    return this.notificationService.createNotification(
      req.user.userId,
      body.title,
      body.message,
      body.type,
      body.link,
    );
  }

  @Post('mark-all-read')
  async markAllAsRead(@Request() req: AuthenticatedRequest) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @Post(':id/read')
  async markAsRead(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.notificationService.markAsRead(id, req.user.userId);
  }
}
