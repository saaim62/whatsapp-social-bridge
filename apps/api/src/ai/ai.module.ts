import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { OcrService } from './ocr.service';

@Module({
  providers: [AiService, OcrService],
  exports: [AiService, OcrService],
})
export class AiModule {}
