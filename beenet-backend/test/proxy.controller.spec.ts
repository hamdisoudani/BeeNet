import { Test, TestingModule } from '@nestjs/testing';
import { ProxyController } from '../src/proxy/proxy.controller';
import { AppLogger } from '../src/common/logger.service';
import { ProxyService } from '../src/proxy/proxy.service';
import { SecretsService } from '../src/secrets/secrets.service';
import { ClerkAuthGuard } from '../src/auth/clerk-auth.guard';
import { CanActivate, INestApplication, ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import * as request from 'supertest';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    console.error("UNHANDLED EXCEPTION:", exception);
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}

// Mock the ClerkAuthGuard to inject a user into the request
const mockClerkAuthGuard: CanActivate = {
  canActivate: (context) => {
    const req = context.switchToHttp().getRequest();
    req.auth = { userId: 'test-user-id' };
    return true;
  },
};

describe('ProxyController (e2e)', () => {
  let app: INestApplication;
  let proxyService: ProxyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: AppLogger,
          useValue: {
            setContext: jest.fn(),
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
        {
          provide: ProxyService,
          useValue: {
            findOrCreateConversation: jest.fn().mockResolvedValue('conv-id' as any),
            persistUserMessage: jest.fn().mockResolvedValue(undefined),
            persistAssistantState: jest.fn(),
            persistAssistantText: jest.fn(),
            updateConversationOnCreate: jest.fn(),
            getUserSecrets: jest.fn(),
          },
        },
        {
          provide: SecretsService,
          useValue: {
            resolveSerperKeyForUser: jest.fn(),
            resolveModelForUser: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(mockClerkAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    proxyService = module.get<ProxyService>(ProxyService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/copilotkit/agents/execute', () => {
    it('when agent stream emits an error, it should persist an empty assistant message', (done) => {
      // 1. Setup Mocks
      const nodeStream = require('stream').Readable.from([
        'data: {"event": "on_chain_start"}\n\n',
        'data: {"event": "on_chain_error", "data": {"error": "LLM Error"}}\n\n',
      ]);
      const webStream = new (require('stream/web').ReadableStream)({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => controller.close());
          nodeStream.on('error', (err) => controller.error(err));
        },
      });

      const fetchResponse = {
        status: 200,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
          forEach: (callback: (value: string, key: string) => void) => {
            callback('text/event-stream', 'content-type');
          },
        },
        body: webStream,
      };

      global.fetch = jest.fn().mockResolvedValue(fetchResponse as any);

      // 2. Make the request
      request(app.getHttpServer())
        .post('/copilotkit/agents/execute')
        .send({
          threadId: 'test-thread-id',
          messages: [{ role: 'user', content: 'hello', id: 'user-msg-id' }],
        })
        .expect(200)
        .end((err, res) => {
          if (err) {
            console.error('Supertest error:', err);
            return done(err);
          }

          // 3. Assertions
          // Use a timeout to allow the async stream processing to complete
          setTimeout(() => {
            try {
              expect(proxyService.persistAssistantText).toHaveBeenCalledTimes(1);
              expect(proxyService.persistAssistantText).toHaveBeenCalledWith(
                expect.objectContaining({
                  content: '',
                  userId: 'test-user-id',
                }),
              );
              done();
            } catch (assertionError) {
              done(assertionError);
            }
          }, 100); // 100ms should be enough for the stream to be processed
        });
    });
  });
});
