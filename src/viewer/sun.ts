import * as THREE from 'three';

/** Project location (Eldagsen / Springe, Niedersachsen). */
export const SITE = { lat: 52.15, lng: 9.65 };

/**
 * Sun direction for the 21st of the given month at local clock time (MEZ/MESZ).
 * Returns elevation/azimuth in degrees and a unit vector (three.js: north = -Z, east = +X).
 */
export function sunPosition(month: number, hour: number, northDeg: number) {
  const doy = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355][Math.min(11, Math.max(0, Math.round(month) - 1))];
  const dst = month >= 4 && month <= 10 ? 1 : 0;
  const B = ((2 * Math.PI) / 364) * (doy - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarHour = hour - 1 - dst + SITE.lng / 15 + eot / 60;
  const decl = THREE.MathUtils.degToRad(23.44) * Math.sin(((2 * Math.PI) / 365) * (doy - 81));
  const lat = THREE.MathUtils.degToRad(SITE.lat);
  const H = THREE.MathUtils.degToRad(15 * (solarHour - 12));
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(sinEl);
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  az += THREE.MathUtils.degToRad(northDeg);
  const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
  return { elevation: THREE.MathUtils.radToDeg(el), azimuth: (THREE.MathUtils.radToDeg(az) + 360) % 360, dir };
}

/** Black-body colour (Tanner Helland approximation), returned as sRGB THREE.Color. */
export function kelvinToColor(k: number): THREE.Color {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

export const HDRI = {
  morgen: import.meta.env.BASE_URL + 'hdri/kiara_1_dawn_1k.hdr',
  mittag: import.meta.env.BASE_URL + 'hdri/rooitou_park_1k.hdr',
  abend: import.meta.env.BASE_URL + 'hdri/venice_sunset_1k.hdr',
  nacht: import.meta.env.BASE_URL + 'hdri/dikhololo_night_1k.hdr',
} as const;

export const PRESETS = {
  morgen: { hour: 8, colorTemp: 4300, sunIntensity: 2.2, envIntensity: 0.7, exposure: 1.05 },
  mittag: { hour: 13, colorTemp: 5800, sunIntensity: 3.2, envIntensity: 0.9, exposure: 1.0 },
  abend: { hour: 20, colorTemp: 3000, sunIntensity: 2.0, envIntensity: 0.6, exposure: 1.15 },
  nacht: { hour: 23, colorTemp: 7500, sunIntensity: 0.25, envIntensity: 0.35, exposure: 1.4 },
} as const;

export function envForHour(hour: number, elevation: number): keyof typeof HDRI {
  if (elevation < -3) return 'nacht';
  if (hour < 11) return 'morgen';
  if (hour < 17.5) return 'mittag';
  return 'abend';
}
