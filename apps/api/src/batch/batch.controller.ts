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

@UseGuards(JwtAuthGuard)
@Controller('api/batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Get()
  async getAllBatches(@Request() req: any) {
    return this.batchService.getBatches(req.user.userId);
  }

  @Get(':id')
  async getBatch(@Request() req: any, @Param('id') id: string) {
    return this.batchService.getBatch(id, req.user.userId);
  }

  @Post(':id/delete')
  async deleteBatch(@Request() req: any, @Param('id') id: string) {
    return this.batchService.deleteBatch(id, req.user.userId);
  }

  @Post('delete-bulk')
  async deleteBatchesBulk(@Request() req: any, @Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.deleteBatchesBulk(body.ids, req.user.userId);
  }

  @Post('publish-bulk')
  async publishBatchesBulk(@Request() req: any, @Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.publishBatchesBulk(body.ids, req.user.userId);
  }

  @Post(':id/approve')
  async approveBatch(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.batchService.approveBatch(id, body, req.user.userId);
  }

  @Post(':id/publish')
  async publishBatch(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.batchService.publishBatch(id, req.user.userId, body?.targets);
  }

  @Post(':id/reject')
  async rejectBatch(@Request() req: any, @Param('id') id: string) {
    return this.batchService.rejectBatch(id, req.user.userId);
  }

  @Post(':id/clear-ai')
  async clearAIContent(@Request() req: any, @Param('id') id: string) {
    return this.batchService.clearAIContent(id, req.user.userId);
  }

  @Post('clear-ai-bulk')
  async clearAIContentBulk(@Request() req: any, @Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.clearAIContentBulk(body.ids, req.user.userId);
  }

  @Post('media/:mediaId/delete')
  async deleteMedia(@Request() req: any, @Param('mediaId') mediaId: string) {
    return this.batchService.deleteMedia(mediaId, req.user.userId);
  }

  @Post(':id/media/reorder')
  async reorderMedia(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { orderedMediaIds: string[] }
  ) {
    if (!body.orderedMediaIds || !Array.isArray(body.orderedMediaIds)) {
      throw new HttpException('Invalid media IDs', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.reorderMedia(id, body.orderedMediaIds, req.user.userId);
  }

  @Post('media/:mediaId/mask')
  async maskMedia(
    @Request() req: any,
    @Param('mediaId') mediaId: string,
    @Body() body: { boxes: { left: number; top: number; width: number; height: number }[] },
  ) {
    const result = await this.batchService.maskMediaLogo(mediaId, body.boxes, req.user.userId);
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('media/:mediaId/revert')
  async revertMedia(@Request() req: any, @Param('mediaId') mediaId: string) {
    const result = await this.batchService.revertMediaLogo(mediaId, req.user.userId);
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
  @Post('media/:mediaId/stop-blur')
  async stopMediaBlur(@Request() req: any, @Param('mediaId') mediaId: string) {
    const result = await this.batchService.stopMediaBlur(mediaId, req.user.userId);
    if (!result.success) {
      throw new HttpException(result.message || 'Failed to stop blur', HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('media/:mediaId/move')
  async moveMedia(
    @Request() req: any,
    @Param('mediaId') mediaId: string,
    @Body() body: { targetBatchId: string; retainAI?: boolean }
  ) {
    if (!body.targetBatchId) {
      throw new HttpException('targetBatchId is required', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.moveMedia(mediaId, body.targetBatchId, req.user.userId, body.retainAI);
  }

  @Post('send-bulk')
  async sendBatchesBulk(@Request() req: any, @Body() body: { batchIds: string[], targetEmails: string[] }) {
    if (!body.batchIds || !body.targetEmails || body.targetEmails.length === 0 || body.batchIds.length === 0) {
      throw new HttpException('batchIds and targetEmails are required', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.sendBatchesBulk(body.batchIds, req.user.userId, body.targetEmails);
  }

  @Post(':id/send')
  async sendBatchToUser(@Request() req: any, @Param('id') id: string, @Body() body: { targetEmails: string[] }) {
    if (!body.targetEmails || body.targetEmails.length === 0) {
      throw new HttpException('targetEmails is required', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.sendBatchToUsers(id, req.user.userId, body.targetEmails);
  }

  @Patch(':id/rename')
  async renameBatch(@Request() req: any, @Param('id') id: string, @Body() body: { name: string }) {
    if (!body.name) {
      throw new HttpException('name is required', HttpStatus.BAD_REQUEST);
    }
    return this.batchService.renameBatch(id, req.user.userId, body.name);
  }

  @Post('media/:id/force-image')
  async forceImage(@Request() req: any, @Param('id') id: string) {
    return this.batchService.forceImage(id, req.user.userId);
  }
}
