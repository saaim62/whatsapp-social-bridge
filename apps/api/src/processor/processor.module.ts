import { Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchProcessor } from './batch.processor';
import { AiModule } from '../ai/ai.module';
import { SocialModule } from '../social/social.module';
import { ImageBlurProcessor } from './image-blur.processor';

@Module({})
export class ProcessorModule {
  static register(): DynamicModule {
    const providers: any[] = [BatchProcessor];
    
    if (process.env.ENABLE_IMAGE_BLUR_WORKER === 'true') {
      providers.push(ImageBlurProcessor);
    }

    return {
      module: ProcessorModule,
      imports: [
        BullModule.registerQueue({
          name: 'batch-processing',
        }),
        AiModule,
        SocialModule,
      ],
      providers,
    };
  }
}
