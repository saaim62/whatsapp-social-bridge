import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaSigningService } from './media-signing.service';

@Module({
  controllers: [MediaController],
  providers: [MediaSigningService],
  exports: [MediaSigningService],
})
export class MediaModule {}
