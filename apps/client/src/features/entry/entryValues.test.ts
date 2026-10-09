import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { fourTypeFields } from '@/test/builderHarness';
import { previewData, seedValues } from './entryValues';

describe('previewData', () => {
  const fields = fourTypeFields() as FormFieldDefinition[];

  it('seeds each control as it is drawn: a toggle off, a counter at its minimum', () => {
    expect(seedValues(fields)).toEqual({ auto_leave: false, auto_high: 0, tele_high: 0 });
  });

  it('strips a hidden value before the computed field is worked out from it', () => {
    expect(previewData(fields, { auto_leave: false, auto_high: 5, tele_high: 2 })).toEqual({
      auto_leave: false,
      tele_high: 2,
    });
    expect(previewData(fields, { auto_leave: true, auto_high: 5, tele_high: 2 })).toEqual({
      auto_leave: true,
      auto_high: 5,
      tele_high: 2,
      post_total: 7,
    });
  });

  it('leaves a computed field out while an operand is missing', () => {
    expect(previewData(fields, { auto_leave: true, auto_high: 5 })).toEqual({
      auto_leave: true,
      auto_high: 5,
    });
  });
});
