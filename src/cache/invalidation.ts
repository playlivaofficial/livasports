export interface CacheInvalidator { invalidateTags(tags: readonly string[]): Promise<void>; }

export class NoopCacheInvalidator implements CacheInvalidator {
  async invalidateTags(tags: readonly string[]): Promise<void> { void tags; }
}

export class RecordingCacheInvalidator implements CacheInvalidator {
  readonly tags: string[] = [];
  async invalidateTags(tags: readonly string[]): Promise<void> { this.tags.push(...tags); }
}
