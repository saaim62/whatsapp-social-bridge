import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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

  @Post(':id/delete')
  async deleteBatch(@Param('id') id: string) {
    return this.batchService.deleteBatch(id);
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

  @Post('media/:mediaId/mask')
  async maskMedia(
    @Param('mediaId') mediaId: string,
    @Body() body: { left: number; top: number; width: number; height: number },
  ) {
    const result = await this.batchService.maskMediaLogo(mediaId, body);
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
