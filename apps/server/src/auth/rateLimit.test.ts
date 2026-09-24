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
});
