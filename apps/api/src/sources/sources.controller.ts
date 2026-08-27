import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Delete,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SourcesService } from './sources.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  async getSources(@Request() req: any) {
    return this.sourcesService.getSources(req.user.userId);
  }

  @Post(':id/toggle')
  async toggleSource(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { isEnabled: boolean },
  ) {
    if (typeof body.isEnabled !== 'boolean') {
      throw new HttpException('isEnabled must be a boolean', HttpStatus.BAD_REQUEST);
    }
    return this.sourcesService.toggleSource(id, body.isEnabled, req.user.userId);
  }

  @Patch(':id/name')
  async updateSourceName(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    if (!body.name || typeof body.name !== 'string') {
      throw new HttpException('name must be a non-empty string', HttpStatus.BAD_REQUEST);
    }
    return this.sourcesService.updateSourceName(id, body.name, req.user.userId);
  }

  @Post('sync')
  async syncGroups(@Request() req: any) {
    const result = await this.sourcesService.syncGroups(req.user.userId);
    if (!result.success) {
      throw new HttpException(result.message || 'Failed to sync', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Delete(':id')
  async deleteSource(@Request() req: any, @Param('id') id: string) {
    return this.sourcesService.deleteSource(id, req.user.userId);
  }
}
