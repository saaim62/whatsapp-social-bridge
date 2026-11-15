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
import { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  BulkDeleteSourcesDto,
  ToggleSourceDto,
  UpdateSourceNameDto,
} from './dto/sources.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  async getSources(@Request() req: AuthenticatedRequest) {
    return this.sourcesService.getSources(req.user.userId);
  }

  @Post(':id/toggle')
  async toggleSource(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ToggleSourceDto,
  ) {
    if (typeof body.isEnabled !== 'boolean') {
      throw new HttpException(
        'isEnabled must be a boolean',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.sourcesService.toggleSource(
      id,
      body.isEnabled,
      req.user.userId,
    );
  }

  @Patch(':id/name')
  async updateSourceName(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateSourceNameDto,
  ) {
    if (!body.name || typeof body.name !== 'string') {
      throw new HttpException(
        'name must be a non-empty string',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.sourcesService.updateSourceName(id, body.name, req.user.userId);
  }

  @Post('sync')
  async syncGroups(@Request() req: AuthenticatedRequest) {
    const result = await this.sourcesService.syncGroups(req.user.userId);
    if (!result.success) {
      throw new HttpException(
        result.message || 'Failed to sync',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return result;
  }

  @Delete(':id')
  async deleteSource(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sourcesService.deleteSource(id, req.user.userId);
  }

  @Post('bulk-delete')
  async bulkDeleteSources(
    @Request() req: AuthenticatedRequest,
    @Body() body: BulkDeleteSourcesDto,
  ) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new HttpException(
        'ids must be an array of strings',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.sourcesService.bulkDelete(body.ids, req.user.userId);
  }
}
