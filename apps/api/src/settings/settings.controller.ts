import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@Request() req: AuthenticatedRequest) {
    return this.settingsService.getSettings(req.user.userId);
  }

  @Post()
  async updateSettings(@Request() req: AuthenticatedRequest, @Body() body: UpdateSettingsDto) {
    return this.settingsService.updateSettings(req.user.userId, body);
  }
}
