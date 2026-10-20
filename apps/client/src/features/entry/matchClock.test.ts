import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchClock } from './matchClock';

beforeEach(() => {
  vi.useFakeTimers();
  matchClock.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('matchClock (SPEC-FINAL 5.5, 8.4)', () => {
  it('is not running until the Start match button is pressed', () => {
    expect(matchClock.isRunning()).toBe(false);
    expect(matchClock.elapsed()).toBeNull();
  });

  it('measures seconds from the press', () => {
    matchClock.start();
    vi.advanceTimersByTime(12_500);
    expect(matchClock.elapsed()).toBeCloseTo(12.5, 1);
  });

  it('gives an event-log field t=0 at the first tap when the timer was never started', () => {
    expect(matchClock.tapTime('shots')).toBe(0);
    vi.advanceTimersByTime(8_000);
    expect(matchClock.tapTime('shots')).toBeCloseTo(8, 1);
  });

  it('gives every field the same origin once the timer is running', () => {
    matchClock.start();
    vi.advanceTimersByTime(5_000);
    expect(matchClock.tapTime('shots')).toBeCloseTo(5, 1);
    expect(matchClock.tapTime('pickups')).toBeCloseTo(5, 1);
  });

  it('reports whether the entry was timed, which is what decides the cycle derivation', () => {
    expect(matchClock.wasTimed()).toBe(false);
    matchClock.start();
    expect(matchClock.wasTimed()).toBe(true);
  });
});

describe('matchClock: per entry, undoable, observable (task 1.34)', () => {
  it('un-timed: the first tap of ANY field is t = 0 for every field after it', () => {
    expect(matchClock.tapTime('shots')).toBe(0);
    vi.advanceTimersByTime(3_000);
    expect(matchClock.tapTime('pickups')).toBeCloseTo(3, 1);
    expect(matchClock.isRunning()).toBe(false);
    expect(matchClock.wasTimed()).toBe(false);
  });

  it('a reset forgets the origin, so a new entry never inherits the last one’s t = 0', () => {
    matchClock.start();
    vi.advanceTimersByTime(40_000);
    matchClock.reset();
    expect(matchClock.elapsed()).toBeNull();
    expect(matchClock.tapTime('shots')).toBe(0);
  });

  it('restores a snapshot, which is how the timer reset is undone', () => {
    matchClock.start();
    vi.advanceTimersByTime(20_000);
    const before = matchClock.snapshot();
    matchClock.reset();
    vi.advanceTimersByTime(2_000);
    matchClock.restore(before);
    expect(matchClock.isRunning()).toBe(true);
    expect(matchClock.elapsed()).toBeCloseTo(22, 1);
  });

  it('tells subscribers when the origin changes, and stops when unsubscribed', () => {
    const heard = vi.fn();
    const stop = matchClock.subscribe(heard);
    matchClock.start();
    matchClock.reset();
    matchClock.tapTime('shots'); // sets the un-timed origin
    matchClock.tapTime('shots'); // does not change it
    expect(heard).toHaveBeenCalledTimes(3);
    stop();
    matchClock.start();
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('counts from timestamps, so a sleeping tab still reads the true time', () => {
    matchClock.start();
    // No timers fire while the tab sleeps; only the wall clock moves.
    vi.setSystemTime(Date.now() + 95_000);
    expect(matchClock.elapsed()).toBeCloseTo(95, 1);
  });
});
