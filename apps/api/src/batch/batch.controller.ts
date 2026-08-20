import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { BatchService } from './batch.service';

@Controller('api/batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Get()
  async getAllBatches() {
    return this.batchService.getBatches();
  }

  @Get(':id')
  async getBatch(@Param('id') id: string) {
    return this.batchService.getBatch(id);
  }

  @Post(':id/approve')
  async approveBatch(@Param('id') id: string, @Body() body: any) {
    return this.batchService.approveBatch(id, body);
  }

  @Post(':id/publish')
  async publishBatch(@Param('id') id: string) {
    return this.batchService.publishBatch(id);
  }

  @Post(':id/reject')
  async rejectBatch(@Param('id') id: string) {
    return this.batchService.rejectBatch(id);
  }

  @Post('media/:mediaId/delete')
  async deleteMedia(@Param('mediaId') mediaId: string) {
    return this.batchService.deleteMedia(mediaId);
  }
}
