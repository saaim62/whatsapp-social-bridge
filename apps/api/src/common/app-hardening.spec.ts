import { Test } from '@nestjs/testing';
import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import type { Server } from 'http';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../auth/email.service';

/**
 * Batch 4 hardening: the global ValidationPipe (whitelist +
 * forbidNonWhitelisted) and the global ThrottlerGuard are wired in
 * main.ts / app.module.ts. These tests exercise the real AuthController
 * and the real throttler with the same configuration, so a regression
 * in either contract fails here instead of in production.
 */
describe('global ValidationPipe (main.ts configuration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({ access_token: 'tok' }),
            register: jest.fn().mockResolvedValue({
              id: 'user-1',
              email: 'a@b.com',
              verificationToken: 'v'.repeat(64),
            }),
            resetPassword: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a well-formed login body', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/account/login')
      .send({ email: 'a@b.com', password: 'secret' })
      .expect(201);
  });

  it('rejects a login body with an unknown property', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/account/login')
      .send({ email: 'a@b.com', password: 'secret', isAdmin: true })
      .expect(400);
  });

  it('rejects a malformed email', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/account/login')
      .send({ email: 'not-an-email', password: 'secret' })
      .expect(400);
  });

  it('rejects a register body with an unknown property', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/account/register')
      .send({ email: 'a@b.com', password: 'secret', role: 'OWNER' })
      .expect(400);
  });

  it('rejects a reset-password body missing the token', async () => {
    await request(app.getHttpServer() as Server)
      .post('/api/account/reset-password')
      .send({ password: 'new-secret' })
      .expect(400);
  });
});

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('global ThrottlerGuard (app.module.ts configuration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'global', ttl: 60000, limit: 3 }]),
      ],
      controllers: [PingController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows up to the limit, then returns 429', async () => {
    const server = app.getHttpServer() as Server;
    for (let i = 0; i < 3; i++) {
      await request(server).get('/ping').expect(200);
    }
    await request(server).get('/ping').expect(429);
  });
});
