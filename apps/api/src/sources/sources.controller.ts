import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import { SourcesService } from './sources.service';

@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  async getSources() {
    return this.sourcesService.getSources();
  }

  @Post(':id/toggle')
  async toggleSource(
    @Param('id') id: string,
    @Body() body: { isEnabled: boolean },
  ) {
    if (typeof body.isEnabled !== 'boolean') {
      throw new HttpException('isEnabled must be a boolean', HttpStatus.BAD_REQUEST);
    }
    return this.sourcesService.toggleSource(id, body.isEnabled);
  }

  @Post('sync')
  async syncGroups() {
    const result = await this.sourcesService.syncGroups();
    if (!result.success) {
      throw new HttpException(result.message || 'Failed to sync', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Delete(':id')
  async deleteSource(@Param('id') id: string) {
    return this.sourcesService.deleteSource(id);
  }
}
