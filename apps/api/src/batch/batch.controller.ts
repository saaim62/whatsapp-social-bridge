import {
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BatchService } from './batch.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  ApproveBatchDto,
  IdsDto,
  MaskMediaDto,
  MoveMediaDto,
  PublishBatchDto,
  PublishBulkDto,
  RenameBatchDto,
  ReorderMediaDto,
  SendBatchDto,
  SendBulkDto,
  SetPriceDto,
} from './dto/batch.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Get()
  async getAllBatches(@Request() req: AuthenticatedRequest) {
    return this.batchService.getBatches(req.user.userId);
  }

  @Get(':id')
  async getBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.batchService.getBatch(id, req.user.userId);
  }

  @Post(':id/delete')
  async deleteBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.batchService.deleteBatch(id, req.user.userId);
  }

  @Post('delete-bulk')
  async deleteBatchesBulk(
    @Request() req: AuthenticatedRequest,
    @Body() body: IdsDto,
  ) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.deleteBatchesBulk(body.ids, req.user.userId);
  }

  @Post('publish-bulk')
  async publishBatchesBulk(
    @Request() req: AuthenticatedRequest,
    @Body() body: PublishBulkDto,
  ) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.publishBatchesBulk(
      body.ids,
      req.user.userId,
      body?.force === true,
    );
  }

  @Post(':id/approve')
  async approveBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ApproveBatchDto,
  ) {
    return this.batchService.approveBatch(id, body, req.user.userId);
  }

  @Post(':id/publish')
  async publishBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: PublishBatchDto,
  ) {
    // `force: true` is the explicit opt-in to re-post to destinations
    // that already have a live PUBLISHED record (P0-3); default false.
    return this.batchService.publishBatch(
      id,
      req.user.userId,
      body?.targets,
      body?.force === true,
    );
  }

  @Post(':id/reject')
  async rejectBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.batchService.rejectBatch(id, req.user.userId);
  }

  @Post(':id/clear-ai')
  async clearAIContent(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.batchService.clearAIContent(id, req.user.userId);
  }

  @Post('clear-ai-bulk')
  async clearAIContentBulk(
    @Request() req: AuthenticatedRequest,
    @Body() body: IdsDto,
  ) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.clearAIContentBulk(body.ids, req.user.userId);
  }

  @Post('media/:mediaId/delete')
  async deleteMedia(
    @Request() req: AuthenticatedRequest,
    @Param('mediaId') mediaId: string,
  ) {
    return this.batchService.deleteMedia(mediaId, req.user.userId);
  }

  @Post(':id/media/reorder')
  async reorderMedia(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ReorderMediaDto,
  ) {
    if (!body.orderedMediaIds || !Array.isArray(body.orderedMediaIds)) {
      throw new HttpException('Invalid media IDs', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.reorderMedia(
      id,
      body.orderedMediaIds,
      req.user.userId,
    );
  }

  @Post('media/:mediaId/mask')
  async maskMedia(
    @Request() req: AuthenticatedRequest,
    @Param('mediaId') mediaId: string,
    @Body() body: MaskMediaDto,
  ) {
    const result = await this.batchService.maskMediaLogo(
      mediaId,
      body.boxes,
      req.user.userId,
    );
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('media/:mediaId/revert')
  async revertMedia(
    @Request() req: AuthenticatedRequest,
    @Param('mediaId') mediaId: string,
  ) {
    const result = await this.batchService.revertMediaLogo(
      mediaId,
      req.user.userId,
    );
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('worker-status')
  getWorkerStatus() {
    const isOnline = this.batchService.isMacWorkerOnline();
    return { isWorkerOnline: isOnline };
  }

  @Post('media/:mediaId/trigger-auto-blur')
  async triggerAutoBlur(
    @Request() req: AuthenticatedRequest,
    @Param('mediaId') mediaId: string,
  ) {
    const result = await this.batchService.triggerManualAutoBlur(
      mediaId,
      req.user.userId,
    );
    if (!result.success) {
      throw new HttpException(
        result.message || 'Failed to trigger blur',
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('media/:mediaId/stop-blur')
  async stopMediaBlur(
    @Request() req: AuthenticatedRequest,
    @Param('mediaId') mediaId: string,
  ) {
    const result = await this.batchService.stopMediaBlur(
      mediaId,
      req.user.userId,
    );
    if (!result.success) {
      throw new HttpException(
        result.message || 'Failed to stop blur',
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('media/:mediaId/move')
  async moveMedia(
    @Request() req: AuthenticatedRequest,
    @Param('mediaId') mediaId: string,
    @Body() body: MoveMediaDto,
  ) {
    if (!body.targetBatchId) {
      throw new HttpException(
        'targetBatchId is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.batchService.moveMedia(
      mediaId,
      body.targetBatchId,
      req.user.userId,
      body.retainAI,
    );
  }

  @Post('send-bulk')
  async sendBatchesBulk(
    @Request() req: AuthenticatedRequest,
    @Body() body: SendBulkDto,
  ) {
    if (
      !body.batchIds ||
      !body.targetEmails ||
      body.targetEmails.length === 0 ||
      body.batchIds.length === 0
    ) {
      throw new HttpException(
        'batchIds and targetEmails are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.batchService.sendBatchesBulk(
      body.batchIds,
      req.user.userId,
      body.targetEmails,
    );
  }

  @Post(':id/send')
  async sendBatchToUser(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SendBatchDto,
  ) {
    if (!body.targetEmails || body.targetEmails.length === 0) {
      throw new HttpException(
        'targetEmails is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.batchService.sendBatchToUsers(
      id,
      req.user.userId,
      body.targetEmails,
    );
  }

  @Patch(':id/rename')
  async renameBatch(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RenameBatchDto,
  ) {
    if (!body.name) {
      throw new HttpException('name is required', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.renameBatch(id, req.user.userId, body.name);
  }

  @Patch(':id/price')
  async setBatchPrice(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetPriceDto,
  ) {
    if (body.price === undefined || body.price === null) {
      throw new HttpException('price is required', HttpStatus.BAD_REQUEST);
    }
    const result = await this.batchService.setManualPrice(
      id,
      req.user.userId,
      Number(body.price),
    );
    if (!result.success) {
      throw new HttpException(
        result.message || 'Failed to set price',
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('media/:id/force-image')
  async forceImage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.batchService.forceImage(id, req.user.userId);
  }
}
