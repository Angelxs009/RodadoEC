import { Injectable } from '@nestjs/common';

interface Entry {
  value: unknown;
  expiresAt: number;
}

/** Caché en memoria con expiración (search_token, hold_id, order_preview_id). */
@Injectable()
export class TtlCache {
  private readonly store = new Map<string, Entry>();

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}
