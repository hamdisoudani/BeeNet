import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserSecrets, UserSecretsDocument } from './schemas/user-secrets.schema';
import { UpsertSecretsDto } from './dto/upsert-secrets.dto';
import * as crypto from 'node:crypto';

@Injectable()
export class SecretsService {
  constructor(
    @InjectModel(UserSecrets.name) private model: Model<UserSecretsDocument>,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async getForUser(userId: string) {
    const cacheKey = `user_secrets:${userId}`;
    let doc: any = await this.cache.get(cacheKey);
    if (!doc) {
      doc = await this.model.findOne({ userId }).lean();
      if (doc) await this.cache.set(cacheKey, doc, 60_000);
    }
    if (!doc) return {};
    const arr = Array.isArray((doc as any).models) ? (doc as any).models : [];
    const safe = arr.map((m: any) => ({
      id: String(m?._id || m?.id || ''),
      name: m?.name,
      provider: m?.provider,
      baseUrl: m?.baseUrl,
      model: m?.model,
    }));
    const hasTav = Boolean((doc as any).tavilyApiKey) || Boolean((doc as any).tavilyApiKeyEnc);
    return { models: safe, defaultModelId: (doc as any).defaultModelId, hasTavilyKey: hasTav };
  }

  async upsertForUser(userId: string, body: UpsertSecretsDto) {
    // Load current doc to merge models intelligently
    const current = await this.model.findOne({ userId }).lean();
    const existingModels: any[] = Array.isArray((current as any)?.models) ? (current as any).models : [];

    // Normalize and validate incoming models (append semantics)
    const incoming: any[] = Array.isArray((body as any)?.models) ? (body as any).models : [];
    const normalized: any[] = [];
    const failures: string[] = [];
    for (const m of incoming) {
      try {
        const baseUrl = String(m?.baseUrl || '').trim();
        const model = String(m?.model || '').trim();
        const apiKey = String(m?.apiKey || '').trim();
        if (!baseUrl || !model || !apiKey) { failures.push('missing_fields'); continue; }
        const check = await this.validateModel(baseUrl, apiKey, model);
        if (!check.ok) { failures.push(check.message || 'validation_failed'); continue; }
        const provider = check.provider || 'custom';
        const name = `${provider}:${model}`;
        // Encrypt apiKey at rest
        let apiKeyEnc: any;
        try {
          apiKeyEnc = this.encryptSecret(apiKey);
        } catch (e) {
          // Capture encryption failures explicitly so the request fails loudly
          console.error('Encryption failed', e);
          failures.push('server_encryption_error');
          continue;
        }
        // Do NOT assign client-generated ids; allow Mongoose to generate subdocument _id
        normalized.push({ name, provider, baseUrl, apiKeyEnc, model });
      } catch {
        failures.push('unknown_error');
      }
    }

    const setDefaultForNew: boolean = !!(body as any)?.setDefaultForNew;

    // Upsert and push new models, then read back updated doc
    const updated = await this.model.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          tavilyApiKey: (body as any)?.tavilyApiKey || (current as any)?.tavilyApiKey,
        },
        ...(normalized.length > 0 ? { $push: { models: { $each: normalized } } } : {}),
      },
      { upsert: true, new: true, returnDocument: 'after' as any }
    ).lean(false);

    // Optionally set default to the most recently added model
    let defaultModelId: string | undefined = (updated as any)?.defaultModelId || (current as any)?.defaultModelId;
    const hadNoModels = !Array.isArray(existingModels) || existingModels.length === 0;
    if ((setDefaultForNew || hadNoModels) && normalized.length > 0) {
      const arrNow: any[] = Array.isArray((updated as any)?.models) ? (updated as any).models : [];
      const last = arrNow[arrNow.length - 1];
      if (last && last._id) {
        defaultModelId = String(last._id);
        await this.model.updateOne({ userId }, { $set: { defaultModelId } });
      }
    }

    // Return safe models (omit apiKey) from updated doc with subdoc _ids
    const arrNow: any[] = Array.isArray((updated as any)?.models) ? (updated as any).models : [];
    // Backfill missing _id on legacy array entries if any
    try {
      const missing = arrNow.filter((m: any) => !m?._id);
      if (missing.length > 0) {
        const withIds = arrNow.map((m: any) => (m?._id ? m : { ...m, _id: new (require('mongoose').Types.ObjectId)() }));
        await this.model.updateOne({ userId }, { $set: { models: withIds } });
        const fresh = await this.model.findOne({ userId }).lean();
        (updated as any).models = Array.isArray((fresh as any)?.models) ? (fresh as any).models : arrNow;
      }
    } catch {}
    const safe = arrNow.map((m: any) => ({ id: String(m._id), name: m.name, provider: m.provider, baseUrl: m.baseUrl, model: m.model }));
    if (normalized.length === 0 && failures.length > 0) {
      // Return the first failure reason to surface a helpful error in the UI
      const code = failures[0] || 'model_validation_failed';
      return { ok: false, message: code } as const;
    }
    await this.cache.del(`user_secrets:${userId}`);
    return { ok: true, models: safe, defaultModelId } as const;
  }

  private deriveProvider(baseUrl: string): string {
    try {
      const u = new URL(baseUrl);
      const host = String(u.hostname || '').toLowerCase();
      const parts = host.split('.').filter(Boolean);
      return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || 'custom');
    } catch { return 'custom'; }
  }

  async validateModel(baseUrl: string, apiKey: string, model: string): Promise<{ ok: boolean; provider?: string; message?: string; }> {
    try {
      const provider = this.deriveProvider(baseUrl);
      const clean = baseUrl.replace(/\/$/, '');
      const url = `${clean}/chat/completions`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } as any,
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, temperature: 0 }),
        signal: controller.signal,
      } as any);
      clearTimeout(t);
      if (!r.ok) {
        return { ok: false, message: `provider_error_${r.status}` };
      }
      const j: any = await r.json().catch(() => ({}));
      if (j && Array.isArray(j.choices)) {
        return { ok: true, provider };
      }
      return { ok: false, message: 'invalid_response' };
    } catch (e: any) {
      return { ok: false, message: 'network_error' };
    }
  }

  async resolveModelForUser(userId: string, explicitModelId?: string) {
    const cacheKey = `user_secrets:${userId}`;
    let doc: any = await this.cache.get(cacheKey);
    if (!doc) {
      doc = await this.model.findOne({ userId }).lean();
      if (doc) await this.cache.set(cacheKey, doc, 60_000);
    }
    if (!doc) return undefined;
    const chosenId = explicitModelId || doc.defaultModelId;
    if (!chosenId) return undefined;
    const arr = Array.isArray((doc as any).models) ? (doc as any).models : [];
    const found = arr.find((m: any) => m && String(m._id || m.id) === String(chosenId));
    if (!found) return undefined;
    // Decrypt apiKey for internal use
    const apiKey = found.apiKey ? String(found.apiKey) : (found.apiKeyEnc ? this.decryptSecret(found.apiKeyEnc) : undefined);
    return { ...found, apiKey };
  }

  async setDefaultModelForUser(userId: string, modelId: string) {
    const doc = await this.model.findOne({ userId }).lean();
    if (!doc) {
      return { ok: false, message: 'not_found' } as const;
    }
    const arr: any[] = Array.isArray((doc as any).models) ? (doc as any).models : [];
    const chosen = arr.find((m: any) => m && String(m._id || m.id) === String(modelId));
    if (!chosen) {
      return { ok: false, message: 'model_not_found' } as const;
    }
    const already = String((doc as any).defaultModelId || '') === String(modelId);
    if (already) {
      return { ok: false, message: 'already_default', defaultModelId: String(modelId) } as const;
    }
    await this.model.updateOne({ userId }, { $set: { defaultModelId: String(modelId) } });
    await this.cache.del(`user_secrets:${userId}`);
    return { ok: true, defaultModelId: String(modelId) } as const;
  }

  async deleteModelForUser(userId: string, modelId: string) {
    const doc: any = await this.model.findOne({ userId }).lean();
    if (!doc) return { ok: false, message: 'not_found' } as const;
    const arr: any[] = Array.isArray(doc.models) ? doc.models : [];
    const idx = arr.findIndex((m: any) => m && String(m._id || m.id) === String(modelId));
    if (idx < 0) return { ok: false, message: 'model_not_found' } as const;
    const isDefault = String(doc.defaultModelId || '') === String(modelId);
    const total = arr.length;
    if (isDefault && total > 1) {
      return { ok: false, message: 'cannot_delete_default' } as const;
    }
    // Remove the model subdocument
    await this.model.updateOne({ userId }, { $pull: { models: { _id: arr[idx]._id } } });
    // If this was the only model, unset default
    if (total === 1) {
      await this.model.updateOne({ userId }, { $unset: { defaultModelId: 1 } });
    } else {
      // Non-default deletions keep current defaultModelId
    }
    await this.cache.del(`user_secrets:${userId}`);
    return { ok: true } as const;
  }

  async validateTavilyKey(apiKey: string): Promise<{ ok: boolean; info?: any; message?: string; }>{
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 6000);
      const r = await fetch('https://api.tavily.com/usage', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` } as any,
        signal: controller.signal,
      } as any);
      clearTimeout(t);
      if (!r.ok) {
        if (r.status === 401) return { ok: false, message: 'unauthorized' };
        return { ok: false, message: `provider_error_${r.status}` };
      }
      const j: any = await r.json().catch(() => ({}));
      const info = {
        keyUsage: j?.key?.usage,
        keyLimit: j?.key?.limit,
        plan: j?.account?.current_plan,
        planUsage: j?.account?.plan_usage,
        planLimit: j?.account?.plan_limit,
      };
      return { ok: true, info };
    } catch (e: any) {
      return { ok: false, message: 'network_error' };
    }
  }

  async setTavilyKeyForUser(userId: string, apiKey: string) {
    const check = await this.validateTavilyKey(apiKey);
    if (!check.ok) return { ok: false, message: check.message } as const;
    const apiKeyEnc = this.encryptSecret(apiKey);
    await this.model.updateOne(
      { userId },
      { $set: { userId, tavilyApiKeyEnc: apiKeyEnc }, $unset: { tavilyApiKey: 1 } as any },
      { upsert: true },
    );
    await this.cache.del(`user_secrets:${userId}`);
    return { ok: true, info: check.info } as const;
  }

  async removeTavilyKeyForUser(userId: string) {
    await this.model.updateOne({ userId }, { $unset: { tavilyApiKey: 1, tavilyApiKeyEnc: 1 } });
    await this.cache.del(`user_secrets:${userId}`);
    return { ok: true } as const;
  }

  async resolveTavilyKeyForUser(userId: string): Promise<string | undefined> {
    try {
      const cacheKey = `user_secrets:${userId}`;
      let doc: any = await this.cache.get(cacheKey);
      if (!doc) {
        doc = await this.model.findOne({ userId }).lean();
        if (doc) await this.cache.set(cacheKey, doc, 60_000);
      }
      if (!doc) return undefined;
      if ((doc as any).tavilyApiKey && typeof (doc as any).tavilyApiKey === 'string') {
        return String((doc as any).tavilyApiKey);
      }
      const enc = (doc as any)?.tavilyApiKeyEnc;
      if (enc) {
        const v = this.decryptSecret(enc);
        return v || undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private getDataKey(): Buffer {
    let b64 = (process.env.DATA_KEY || '').trim();
    if (!b64) throw new Error('Missing DATA_KEY');
    if (b64.startsWith('base64:')) b64 = b64.slice(7);
    const raw = Buffer.from(b64, 'base64');
    if (raw.length !== 32) throw new Error('DATA_KEY must be 32 bytes base64');
    return raw;
  }

  private encryptSecret(plaintext: string): any {
    const key = this.getDataKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') };
  }

  private decryptSecret(enc: any): string | undefined {
    try {
      if (!enc || typeof enc !== 'object') return undefined;
      const key = this.getDataKey();
      const iv = Buffer.from(String(enc.iv), 'base64');
      const ct = Buffer.from(String(enc.ct), 'base64');
      const tag = Buffer.from(String(enc.tag), 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      return pt;
    } catch {
      return undefined;
    }
  }
}


