import { describe, expect, it } from 'vitest';
import { makeRateLimiter } from './rateLimit.js';

describe('login rate limiting (SPEC-FINAL 16.5)', () => {
  it('allows the first attempts and then refuses', () => {
    const time = 0;
    const limiter = makeRateLimiter({ limit: 5, windowMs: 60_000, now: () => time });
    for (let i = 0; i < 5; i += 1) expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
  });

  it('limits per username, so one account cannot lock out another', () => {
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
    expect(limiter.take('bob')).toBe(true);
  });

  it('forgets attempts once the window has passed', () => {
    let time = 0;
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => time });
    expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
    time = 61_000;
    expect(limiter.take('alice')).toBe(true);
  });

  it('forgets everything on reset', () => {
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.take('alice')).toBe(true);
    expect(limiter.take('alice')).toBe(false);
    limiter.reset();
    expect(limiter.take('alice')).toBe(true);
  });

  it('deletes a key once its whole window has expired, so the map does not grow forever', () => {
    let time = 0;
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => time });
    limiter.take('alice');
    limiter.take('bob');
    expect(limiter.size()).toBe(2);
    time = 61_000;
    // Touching any key sweeps the expired ones, not only the key being touched.
    limiter.take('carol');
    expect(limiter.size()).toBe(1);
  });

  it('caps the number of keys, evicting the oldest-inserted when full', () => {
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0, maxKeys: 3 });
    for (const key of ['a', 'b', 'c']) expect(limiter.take(key)).toBe(true);
    expect(limiter.take('d')).toBe(true);
    expect(limiter.size()).toBe(3);
    // 'a' was evicted, so it starts afresh; 'b' was kept, so it is still limited.
    expect(limiter.take('b')).toBe(false);
    expect(limiter.take('a')).toBe(true);
  });

  it('defaults to a cap of 10 000 keys', () => {
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    for (let i = 0; i < 10_050; i += 1) limiter.take(`user-${i}`);
    expect(limiter.size()).toBe(10_000);
  });
});
