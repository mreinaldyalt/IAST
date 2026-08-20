import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('annual astronomy event catalog', () => {
  it('keeps every verified 2026 category without a partial-load warning', async () => {
    const response = await GET(new NextRequest('http://localhost/api/astronomy-events?year=2026'));
    const payload = await response.json();
    const types = new Set(payload.events.map((event: { type: string }) => event.type));

    expect(payload.warnings).toEqual([]);
    expect(types).toEqual(new Set(['ramadan', 'syawal', 'eclipse', 'parade']));
    expect(payload.events.some((event: { id: string }) => event.id === 'parade-2026-08-12')).toBe(true);
  });
});
