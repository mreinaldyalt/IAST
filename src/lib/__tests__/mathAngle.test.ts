import { describe, it, expect } from 'vitest';
import { wrapTo180, wrapTo360, degToRad, radToDeg } from '@/lib/mathAngle';

describe('mathAngle', () => {
  describe('wrapTo180', () => {
    it('should wrap 0 to 0', () => {
      expect(wrapTo180(0)).toBe(0);
    });

    it('should wrap 180 to -180', () => {
      expect(wrapTo180(180)).toBe(-180);
    });

    it('should wrap -180 to -180', () => {
      expect(wrapTo180(-180)).toBe(-180);
    });

    it('should wrap 270 to -90', () => {
      expect(wrapTo180(270)).toBe(-90);
    });

    it('should wrap 360 to 0', () => {
      expect(wrapTo180(360)).toBe(0);
    });

    it('should wrap -270 to 90', () => {
      expect(wrapTo180(-270)).toBe(90);
    });

    it('should wrap 540 to -180', () => {
      expect(wrapTo180(540)).toBe(-180);
    });

    it('should handle small positive angle', () => {
      expect(wrapTo180(45)).toBe(45);
    });

    it('should handle small negative angle', () => {
      expect(wrapTo180(-45)).toBe(-45);
    });
  });

  describe('wrapTo360', () => {
    it('should wrap 0 to 0', () => {
      expect(wrapTo360(0)).toBe(0);
    });

    it('should wrap 360 to 0', () => {
      expect(wrapTo360(360)).toBe(0);
    });

    it('should wrap -90 to 270', () => {
      expect(wrapTo360(-90)).toBe(270);
    });

    it('should wrap 450 to 90', () => {
      expect(wrapTo360(450)).toBe(90);
    });
  });

  describe('degToRad / radToDeg', () => {
    it('should convert 180° to π', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI);
    });

    it('should convert π to 180°', () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180);
    });

    it('should round-trip', () => {
      expect(radToDeg(degToRad(42.5))).toBeCloseTo(42.5);
    });
  });
});
