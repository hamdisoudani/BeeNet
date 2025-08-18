import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { UpsertSecretsDto } from './dto/upsert-secrets.dto';
import { SecretsService } from './secrets.service';
import { TestModelDto } from './dto/test-model.dto';

@UseGuards(ClerkAuthGuard)
@Controller('secrets')
export class SecretsController {
  constructor(private readonly svc: SecretsService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async get(@Req() req: any) {
    try { return await this.svc.getForUser(req.auth.userId); } catch { return {}; }
  }

  @Get('status')
  @Throttle({ default: { limit: 60, ttl: 60 } })
  async status(@Req() req: any) {
    try {
      const userId = req.auth.userId as string;
      const data: any = await this.svc.getForUser(userId);
      const models = Array.isArray(data?.models) ? data.models : [];
      const hasModel = models.length > 0;
      const hasTavilyKey = Boolean(data?.hasTavilyKey);
      return { ok: true, hasModel, hasTavilyKey, defaultModelId: data?.defaultModelId };
    } catch {
      return { ok: false } as const;
    }
  }

  @Put()
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async upsert(@Req() req: any, @Body() body: UpsertSecretsDto) {
    const userId = req.auth.userId as string;
    try { return await this.svc.upsertForUser(userId, body); } catch { return { ok: false }; }
  }

  @Get('model')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async getModel(@Req() req: any) {
    try {
      const userId = req.auth.userId as string;
      const modelId = (req?.query?.id as string) || undefined;
      const m = await this.svc.resolveModelForUser(userId, modelId);
      if (!m) return {};
      // never return apiKey publicly
      const { apiKey, ...safe } = m as any;
      return safe;
    } catch {
      return {};
    }
  }

  @Post('model/test')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async testModel(@Req() req: any, @Body() body: TestModelDto) {
    // Perform a lightweight validation by calling the provider's models endpoint if available
    // For portability, we perform a minimal chat models list attempt using the provided baseUrl/apiKey
    try {
      const url = new URL(body.baseUrl);
      // Try a HEAD to base, else a GET to /models style path
      const headers: any = { 'Authorization': `Bearer ${body.apiKey}` };
      let ok = false;
      try {
        const r = await fetch(url.origin, { method: 'HEAD', headers } as any);
        ok = r.ok;
      } catch {}
      if (!ok) {
        try {
          const guess = new URL(url.pathname.endsWith('/') ? url.pathname + 'models' : url.pathname + '/models', url.origin).toString();
          const r2 = await fetch(guess, { method: 'GET', headers } as any);
          ok = r2.ok;
        } catch {}
      }
      if (!ok) return { ok: false, message: 'Could not verify model provider with the provided credentials.' };
      // Return a normalized provider:name string for the backend to store as canonical name
      const host = url.hostname.toLowerCase();
      const parts = host.split('.').filter(Boolean);
      const provider = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || 'custom');
      const name = `${provider}:${body.model}`;
      return { ok: true, name };
    } catch {
      return { ok: false, message: 'Invalid model configuration' };
    }
  }

  @Put('default')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async setDefault(@Req() req: any, @Body() body: { id?: string }) {
    try {
      const userId = req.auth.userId as string;
      const id = typeof body?.id === 'string' ? String(body.id) : '';
      if (!id) return { ok: false, message: 'invalid_id' };
      return await this.svc.setDefaultModelForUser(userId, id);
    } catch {
      return { ok: false };
    }
  }

  @Put('tavily')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async upsertTavily(@Req() req: any, @Body() body: { apiKey?: string }) {
    try {
      const userId = req.auth.userId as string;
      const apiKey = typeof body?.apiKey === 'string' ? String(body.apiKey) : '';
      if (!apiKey) return { ok: false, message: 'invalid_api_key' } as const;
      return await this.svc.setTavilyKeyForUser(userId, apiKey);
    } catch {
      return { ok: false } as const;
    }
  }

  @Post('tavily/test')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async testTavily(@Req() req: any, @Body() body: { apiKey?: string }) {
    try {
      const apiKey = typeof body?.apiKey === 'string' ? String(body.apiKey) : '';
      if (!apiKey) return { ok: false, message: 'invalid_api_key' } as const;
      return await this.svc.validateTavilyKey(apiKey);
    } catch {
      return { ok: false } as const;
    }
  }

  @Post('tavily/remove')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async removeTavily(@Req() req: any) {
    try {
      const userId = req.auth.userId as string;
      return await this.svc.removeTavilyKeyForUser(userId);
    } catch {
      return { ok: false } as const;
    }
  }
}


