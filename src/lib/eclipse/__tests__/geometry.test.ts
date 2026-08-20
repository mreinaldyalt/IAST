import { describe, expect, it } from 'vitest';
import { circleOverlapFraction, lunarShadowState, solarShadowState } from '../geometry';

describe('eclipse shadow geometry', () => {
  it('detects a central solar-shadow alignment', () => {
    const state = solarShadowState(
      { x: 149_597_870.7, y: 0, z: 0 },
      { x: 384_400, y: 0, z: 0 },
    );
    expect(state.valid).toBe(true);
    expect(state.axisDistanceKm).toBeCloseTo(0, 6);
    expect(state.partialMetricKm).toBeLessThan(0);
    expect(state.centralMetricKm).toBeLessThan(0);
  });

  it('detects a central lunar-shadow alignment', () => {
    const state = lunarShadowState(
      { x: 149_597_870.7, y: 0, z: 0 },
      { x: -384_400, y: 0, z: 0 },
    );
    expect(state.valid).toBe(true);
    expect(state.axisDistanceKm).toBeCloseTo(0, 6);
    expect(state.penumbralMetricKm).toBeLessThan(0);
    expect(state.umbralMetricKm).toBeLessThan(0);
    expect(state.totalMetricKm).toBeLessThan(0);
  });

  it('computes circle overlap limits without numerical instability', () => {
    expect(circleOverlapFraction(1, 1, 3)).toBe(0);
    expect(circleOverlapFraction(1, 2, 0)).toBe(1);
    expect(circleOverlapFraction(1, 1, 0)).toBe(1);
    expect(circleOverlapFraction(1, 1, 1)).toBeGreaterThan(0);
    expect(circleOverlapFraction(1, 1, 1)).toBeLessThan(1);
  });
});
