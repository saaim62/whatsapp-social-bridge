import type { Server } from 'http';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'https://droproute.duckdns.org',
];

/**
 * CORS allowlist comes from ALLOWED_ORIGINS (comma-separated) so new
 * deployments/domains don't need a code change. Falls back to the
 * historical pair when the variable is unset or empty.
 */
function resolveCorsOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_CORS_ORIGINS;
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers (HSTS, X-Content-Type-Options, frameguard, ...).
  app.use(helmet());
  // gzip responses — dashboard JSON payloads shrink substantially.
  app.use(compression());

  // Every DTO-typed body is validated and stripped to its declared
  // shape; unknown properties are rejected instead of reaching services.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  const server = app.getHttpServer() as Server;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
