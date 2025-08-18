import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as helmet from 'helmet';
import * as compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Security & performance middlewares
  const helmetMiddleware = (helmet as any).default ?? (helmet as any);
  const compressionLib = (compression as any).default ?? (compression as any);
  app.use(helmetMiddleware({
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  } as any));
  // Disable compression for SSE to avoid buffering
  app.use(
    compressionLib({
      filter: (req: any, res: any) => {
        const url: string = req?.url || '';
        if (/\/api\/copilotkit\/agents\/(state|execute)/.test(url)) return false;
        const noc = req?.headers?.['x-no-compression'];
        if (noc) return false;
        const type = res.getHeader?.('Content-Type');
        if (typeof type === 'string' && type.includes('text/event-stream')) return false;
        return (compression as any).filter ? (compression as any).filter(req, res) : true;
      },
    }),
  );

  // Global validation pipe with safe defaults
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Prefix and CORS
  app.setGlobalPrefix('api');
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
  app.enableCors({ origin, credentials: true, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS' });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
}

bootstrap();
