import { Controller, Post, Body, UploadedFiles, UseInterceptors, HttpStatus, Res } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { BatchService } from '../batch/batch.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/test')
export class TestController {
  constructor(
    private readonly batchService: BatchService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('product')
  @UseInterceptors(FilesInterceptor('images', 20, {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = randomUUID() + extname(file.originalname);
        cb(null, uniqueSuffix);
      },
    }),
  }))
  async simulateProductMessage(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: { text: string; senderId?: string },
    @Res() res: Response
  ) {
    const senderId = body.senderId || 'test_sender_123';
    
    // 1. Send the text message if any
    if (body.text && body.text.trim().length > 0) {
      const textMessage = {
        id: `msg_${randomUUID()}`,
        from: senderId,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        type: 'text',
        text: { body: body.text }
      };
      await this.batchService.handleMessage(textMessage);
    }

    // 2. Send image messages
    if (files && files.length > 0) {
      for (const file of files) {
        const imageMessage = {
          id: `msg_${randomUUID()}`,
          from: senderId,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'image',
          image: {
            id: file.filename, // Using filename as mediaId for testing
            mime_type: file.mimetype,
            caption: '', 
          },
          _localPath: file.path // custom field for test mode
        };
        await this.batchService.handleMessage(imageMessage);
      }
    }

    return res.status(HttpStatus.OK).json({ success: true, message: 'Simulated messages queued' });
  }
}
