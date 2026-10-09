import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { FieldInput } from './FieldInput';

/*
 * UF.18: every entry control lays out by its own width, so the builder's 410 px canvas and Try it
 * draw the form as the phone does. Nothing a FieldInput draws may switch on the window's width.
 */

const base: FormFieldDefinition = {
  id: 'f',
  key: 'end_climb',
  label: 'Climb level',
  help_text: 'How high it got',
  type: 'single_select',
  section: null,
  display_order: 1,
  required: false,
  default_value: null,
  config: {
    options: [
      { value: 'none', label: 'No climb' },
      { value: 'park', label: 'Parked' },
      { value: 'low', label: 'Low rung' },
      { value: 'high', label: 'High rung' },
    ],
  },
  visibility_condition: null,
  deprecated: false,
  description: 'How high',
  unit: 'enum',
  phase: 'endgame',
  direction: 'higher_is_better',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
};

/** `sm:` … `2xl:` and `max-*:` read the window; `@sm:` … read the container. */
const WINDOW_VARIANT = /(^|\s)(max-)?(sm|md|lg|xl|2xl):/;

describe('FieldInput lays out by its own width (UF.18)', () => {
  const cases: [string, Partial<FormFieldDefinition>, unknown][] = [
    ['counter', { type: 'counter', config: { min: 0, step: 1 } }, 3],
    ['toggle', { type: 'toggle', config: {} }, true],
    ['single select, four options', {}, 'park'],
    [
      'single select, two options',
      {
        config: {
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      },
      'a',
    ],
    ['long text', { type: 'long_text', config: {} }, 'Fast'],
  ];
  it.each(cases)('%s: no window-width class anywhere', (_name, over, value) => {
    const { container } = render(
      <FieldInput field={{ ...base, ...over }} value={value} onChange={vi.fn()} />,
    );
    const all = [container.firstElementChild!, ...container.querySelectorAll('*')];
    expect(all.length).toBeGreaterThan(1);
    for (const el of all) {
      expect(el.getAttribute('class') ?? '', el.tagName).not.toMatch(WINDOW_VARIANT);
    }
  });
});
