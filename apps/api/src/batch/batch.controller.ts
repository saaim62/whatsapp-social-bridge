import {
  Controller,
  Get,
  Param,
  Post,
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

  @Post(':id/approve')
  async approveBatch(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.batchService.approveBatch(id, body, req.user.userId);
  }

  @Post(':id/publish')
  async publishBatch(@Request() req: any, @Param('id') id: string) {
    return this.batchService.publishBatch(id, req.user.userId);
  }

  @Post(':id/reject')
  async rejectBatch(@Request() req: any, @Param('id') id: string) {
    return this.batchService.rejectBatch(id, req.user.userId);
  }

  @Post('media/:mediaId/delete')
  async deleteMedia(@Request() req: any, @Param('mediaId') mediaId: string) {
    return this.batchService.deleteMedia(mediaId, req.user.userId);
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
}
