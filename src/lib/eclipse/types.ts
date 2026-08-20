export type EclipseKind = 'solar' | 'lunar';
export type HorizonsSource = 'live' | 'cache';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HorizonsVector {
  epochUTC: Date;
  jd: number;
  positionKm: Vec3;
  velocityKmS: Vec3;
  source: HorizonsSource;
}

export interface EclipseContact {
  code: string;
  label: string;
  timeUTC: string;
  altitudeDeg?: number;
  azimuthDeg?: number;
}

export interface EclipseResult {
  kind: EclipseKind;
  eclipseType: string;
  eclipseTypeLabel: string;
  greatestEclipseUTC: string;
  searchWindow: { startUTC: string; endUTC: string };
  contacts: EclipseContact[];
  magnitude: number;
  obscurationPercent: number | null;
  durationMinutes: number | null;
  geometry: {
    axisDistanceKm: number;
    gamma: number;
    sunDistanceKm: number;
    moonDistanceKm: number;
    sunAngularRadiusDeg: number;
    moonAngularRadiusDeg: number;
    umbraRadiusKm: number;
    penumbraRadiusKm: number;
  };
  observer: {
    latitude: number;
    longitude: number;
    altitudeKm: number;
    visible: boolean;
    localType: string;
    localTypeLabel: string;
    maximumAltitudeDeg: number;
    maximumAzimuthDeg: number;
    localMagnitude: number | null;
    localObscurationPercent: number | null;
    contacts: EclipseContact[];
  };
  centralPoint: { latitude: number; longitude: number } | null;
  provenance: {
    provider: 'NASA/JPL Horizons';
    endpoint: string;
    ephemerisType: 'VECTORS';
    referenceFrame: 'ICRF';
    correction: 'geometric';
    source: HorizonsSource;
    sunCommand: '10';
    moonCommand: '301';
  };
  method: {
    candidateCount: number;
    coarseStepMinutes: number;
    detailStepMinutes: number;
    contactInterpolation: string;
    shadowModel: string;
    constants: Record<string, number>;
  };
}
