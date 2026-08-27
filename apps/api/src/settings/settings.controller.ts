import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@Request() req: any) {
    return this.settingsService.getSettings(req.user.userId);
  }

  @Post()
  async updateSettings(@Request() req: any, @Body() body: any) {
    return this.settingsService.updateSettings(req.user.userId, body);
  }
}
