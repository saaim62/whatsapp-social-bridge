import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as qrcode from 'qrcode';
import { BatchService } from '../batch/batch.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private client: any;
  private readonly logger = new Logger(WhatsappService.name);
  private currentQrUrl: string | null = null;
  private clientReady: boolean = false;
  private baileysModule: any;

  constructor(private readonly batchService: BatchService) {}

  onModuleInit() {
    this.initializeWhatsApp();
  }

  getQrCodeUrl() {
    return this.currentQrUrl;
  }

  isReady() {
    return this.clientReady;
  }

  private async loadBaileys() {
    if (!this.baileysModule) {
      this.baileysModule = await eval('import("@whiskeysockets/baileys")');
    }
    return this.baileysModule;
  }

  private async initializeWhatsApp() {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await this.loadBaileys();
    const { state, saveCreds } = await useMultiFileAuthState('./.baileys_auth');

    this.client = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    this.client.ev.on('creds.update', saveCreds);

    this.client.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        this.logger.log('New QR code generated! View it at http://localhost:3001/api/whatsapp/qr');
        try {
          this.currentQrUrl = await qrcode.toDataURL(qr);
        } catch (err) {
          this.logger.error('Failed to generate QR data URL', err);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.logger.warn('WhatsApp disconnected. Reconnecting: ' + shouldReconnect);
        this.clientReady = false;
        if (shouldReconnect) {
          this.initializeWhatsApp();
        }
      } else if (connection === 'open') {
        this.logger.log('✅ WhatsApp Linked Device connected and active!');
        this.clientReady = true;
        this.currentQrUrl = null;
      }
    });

    this.client.ev.on('messages.upsert', async (m: any) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          // Allow messages from ourselves for testing
          // if (msg.key.fromMe) continue;
          await this.handleIncomingMessage(msg);
        }
      }
    });

    this.logger.log('Initializing WhatsApp Web Bridge (Baileys)...');
  }

  private async handleIncomingMessage(msg: any) {
    const { downloadMediaMessage } = await this.loadBaileys();
    const messageContent = msg.message;
    if (!messageContent) return;

    this.logger.log(`Received WhatsApp message from: ${msg.key.remoteJid}`);

    const imageMessage = messageContent.imageMessage;
    const documentMessage = messageContent.documentMessage;
    const isImageDocument = documentMessage && documentMessage.mimetype?.startsWith('image/');
    const isMedia = !!imageMessage || isImageDocument;
    
    let caption = '';
    if (imageMessage) caption = imageMessage.caption || '';
    else if (documentMessage) caption = documentMessage.caption || '';
    else if (messageContent.conversation) caption = messageContent.conversation;
    else if (messageContent.extendedTextMessage) caption = messageContent.extendedTextMessage.text || '';

    if (!isMedia && !caption) return;

    let localPath: string | null = null;
    let mimeType = '';
    const messageId = msg.key.id;

    if (isMedia) {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          { 
            logger: this.logger as any,
            reuploadRequest: this.client.updateMediaMessage 
          }
        );
        
        mimeType = imageMessage?.mimetype || documentMessage?.mimetype || 'image/jpeg';
        const ext = mimeType.split('/')[1] || 'jpeg';
        const fileName = `${messageId}.${ext}`.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const relPath = `uploads/${fileName}`;
        const absolutePath = path.join(process.cwd(), relPath);
        
        fs.writeFileSync(absolutePath, buffer);
        localPath = relPath;
        this.logger.log(`Downloaded image to ${localPath}`);
      } catch (err) {
        this.logger.error('Failed to download media from Baileys', err);
      }
    }

    const payload: any = {
      id: messageId,
      from: msg.key.remoteJid,
      timestamp: msg.messageTimestamp?.toString() || Date.now().toString(),
      type: isMedia ? 'image' : 'text',
    };

    if (payload.type === 'image') {
      payload.image = {
        id: messageId,
        mime_type: mimeType,
        caption: caption,
      };
      payload._localPath = localPath; // Tells BatchService the media is already downloaded
    } else {
      payload.text = { body: caption };
    }

    // Hand off to existing BatchService pipeline
    await this.batchService.handleMessage(payload);
  }
}
