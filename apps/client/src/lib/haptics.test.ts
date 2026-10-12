import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDevicePrefs, vibrateOnTap } from './devicePrefs';
import { canVibrate, haptics } from './haptics';

const nav = navigator as { vibrate?: unknown };
const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');

function setVibrate(value: unknown) {
  Object.defineProperty(navigator, 'vibrate', { value, configurable: true, writable: true });
}

beforeEach(() => clearDevicePrefs());

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'vibrate', original);
  else delete nav.vibrate;
});

describe('haptics (SPEC-FINAL 8.6)', () => {
  it('buzzes 10 ms on a tap where the phone can vibrate', () => {
    const vibrate = vi.fn(() => true);
    setVibrate(vibrate);
    expect(canVibrate()).toBe(true);
    haptics.tap();
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('is a silent no-op where there is no navigator.vibrate (iOS)', () => {
    delete nav.vibrate;
    expect('vibrate' in navigator).toBe(false);
    expect(canVibrate()).toBe(false);
    expect(() => haptics.tap()).not.toThrow();
  });

  it('never throws when the browser refuses', () => {
    setVibrate(() => {
      throw new Error('NotAllowedError');
    });
    expect(() => haptics.tap()).not.toThrow();
  });

  it('does not buzz when Vibrate on taps is off on this device', () => {
    const vibrate = vi.fn(() => true);
    setVibrate(vibrate);
    vibrateOnTap.set(false);
    haptics.tap();
    expect(vibrate).not.toHaveBeenCalled();
    vibrateOnTap.set(true);
    haptics.tap();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('is on by default', () => {
    expect(vibrateOnTap.get()).toBe(true);
  });
});
