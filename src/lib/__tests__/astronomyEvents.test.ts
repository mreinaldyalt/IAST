import { describe, expect, it } from 'vitest';
import { buildEventMap } from '../astronomyEvents';

describe('astronomy calendar eclipse integration', () => {
  it('keeps parade and eclipse independently selectable on 2026-08-12', () => {
    const events = buildEventMap().get('2026-08-12') ?? [];
    expect(events.map((event) => event.type)).toContain('parade');
    expect(events.map((event) => event.type)).toContain('eclipse');
    expect(events.find((event) => event.type === 'parade')?.label).toContain('Parade 6 Planet');
    expect(events.find((event) => event.type === 'eclipse')?.href)
      .toBe('/gerhana?type=solar&start=2026-08-12');
  });
});
