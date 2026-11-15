import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  providers: [SocialService],
  exports: [SocialService],
  controllers: [SocialController],
})
export class SocialModule {}
