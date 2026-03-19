import type {
  OracleAspect,
  OracleAspectType,
  OracleBirthChart,
  OracleHouse,
  OracleLifeDomain,
  OraclePlanetName,
  OraclePlanetPosition,
  OracleTransitForecast,
  OracleTransitForecastMonth,
  OracleTransitSignal,
  OracleZodiacSign,
} from '../types';

const ZODIAC_SIGNS: OracleZodiacSign[] = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

const PLANETS: OraclePlanetName[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

interface OrbitalElements {
  N: number;
  Ndot: number;
  i: number;
  idot: number;
  w: number;
  wdot: number;
  a: number;
  adot: number;
  e: number;
  edot: number;
  M: number;
  Mdot: number;
}

// Low-precision orbital elements (J2000-ish), adapted for deterministic forecasting.
// The objective is stable sign/house/aspect derivation, not observatory-grade astronomy.
const ELEMENTS: Record<
  Exclude<OraclePlanetName, 'Sun' | 'Moon'> | 'Earth',
  OrbitalElements
> = {
  Mercury: { N: 48.3313, Ndot: 3.24587e-5, i: 7.0047, idot: 5e-8, w: 29.1241, wdot: 1.01444e-5, a: 0.387098, adot: 0, e: 0.205635, edot: 5.59e-10, M: 168.6562, Mdot: 4.0923344368 },
  Venus: { N: 76.6799, Ndot: 2.46590e-5, i: 3.3946, idot: 2.75e-8, w: 54.891, wdot: 1.38374e-5, a: 0.72333, adot: 0, e: 0.006773, edot: -1.302e-9, M: 48.0052, Mdot: 1.6021302244 },
  Earth: { N: 0, Ndot: 0, i: 0, idot: 0, w: 282.9404, wdot: 4.70935e-5, a: 1, adot: 0, e: 0.016709, edot: -1.151e-9, M: 356.047, Mdot: 0.9856002585 },
  Mars: { N: 49.5574, Ndot: 2.11081e-5, i: 1.8497, idot: -1.78e-8, w: 286.5016, wdot: 2.92961e-5, a: 1.523688, adot: 0, e: 0.093405, edot: 2.516e-9, M: 18.6021, Mdot: 0.5240207766 },
  Jupiter: { N: 100.4542, Ndot: 2.76854e-5, i: 1.303, idot: -1.557e-7, w: 273.8777, wdot: 1.64505e-5, a: 5.20256, adot: 0, e: 0.048498, edot: 4.469e-9, M: 19.895, Mdot: 0.0830853001 },
  Saturn: { N: 113.6634, Ndot: 2.38980e-5, i: 2.4886, idot: -1.081e-7, w: 339.3939, wdot: 2.97661e-5, a: 9.55475, adot: 0, e: 0.055546, edot: -9.499e-9, M: 316.967, Mdot: 0.0334442282 },
  Uranus: { N: 74.0005, Ndot: 1.3978e-5, i: 0.7733, idot: 1.9e-8, w: 96.6612, wdot: 3.0565e-5, a: 19.18171, adot: -1.55e-8, e: 0.047318, edot: 7.45e-9, M: 142.5905, Mdot: 0.011725806 },
  Neptune: { N: 131.7806, Ndot: 3.0173e-5, i: 1.77, idot: -2.55e-7, w: 272.8461, wdot: -6.027e-6, a: 30.05826, adot: 3.313e-8, e: 0.008606, edot: 2.15e-9, M: 260.2471, Mdot: 0.005995147 },
  Pluto: { N: 110.30347, Ndot: 0, i: 17.14175, idot: 0, w: 113.76329, wdot: 0, a: 39.48168677, adot: 0, e: 0.24880766, edot: 0, M: 14.53, Mdot: 0.00396 },
};

const ASPECT_DEFS: Array<{ type: OracleAspectType; angle: number; orb: number }> = [
  { type: 'conjunction', angle: 0, orb: 8 },
  { type: 'sextile', angle: 60, orb: 5 },
  { type: 'square', angle: 90, orb: 6 },
  { type: 'trine', angle: 120, orb: 6 },
  { type: 'opposition', angle: 180, orb: 8 },
];

const SIGN_INTERPRETATION: Record<OracleZodiacSign, string> = {
  Aries: 'Action-oriented, initiatory, direct.',
  Taurus: 'Grounded, patient, value and stability seeking.',
  Gemini: 'Curious, verbal, adaptive and pattern-hungry.',
  Cancer: 'Protective, emotional, memory-driven.',
  Leo: 'Expressive, proud, creative and radiant.',
  Virgo: 'Analytical, practical, refining and service-oriented.',
  Libra: 'Relational, balancing, aesthetic and diplomatic.',
  Scorpio: 'Intense, transformative, depth-seeking and strategic.',
  Sagittarius: 'Expansive, philosophical, exploratory and truth-driven.',
  Capricorn: 'Disciplined, structural, long-horizon and accountable.',
  Aquarius: 'Independent, systemic, unconventional and future-focused.',
  Pisces: 'Intuitive, symbolic, permeable and imaginative.',
};

const HOUSE_INTERPRETATION: Record<number, string> = {
  1: 'identity, self-image, and personal style',
  2: 'values, resources, money, and self-worth',
  3: 'communication, learning, and local environment',
  4: 'home, roots, and emotional foundation',
  5: 'creativity, pleasure, romance, and expression',
  6: 'work rhythms, health, and daily systems',
  7: 'partnerships, mirrors, and commitments',
  8: 'shared resources, transformation, and psychological depth',
  9: 'beliefs, philosophy, higher learning, and expansion',
  10: 'career, reputation, and public role',
  11: 'community, networks, and future vision',
  12: 'subconscious, retreat, and hidden processing',
};

const ASPECT_INTERPRETATION: Record<OracleAspectType, string> = {
  conjunction: 'fusion and amplification',
  sextile: 'supportive opportunity',
  square: 'friction that drives growth',
  trine: 'natural flow and talent',
  opposition: 'polarization that demands integration',
};

function normalizeDegrees(v: number): number {
  let out = v % 360;
  if (out < 0) out += 360;
  return out;
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}

function angularDifference(a: number, b: number): number {
  const d = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return d > 180 ? 360 - d : d;
}

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function daysSinceJ2000(date: Date): number {
  return toJulianDay(date) - 2451545.0;
}

function solveKepler(Mdeg: number, e: number): number {
  const M = degToRad(Mdeg);
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 6; i += 1) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

function orbitalElementsAtDay(elements: OrbitalElements, d: number): OrbitalElements {
  return {
    N: elements.N + elements.Ndot * d,
    i: elements.i + elements.idot * d,
    w: elements.w + elements.wdot * d,
    a: elements.a + elements.adot * d,
    e: elements.e + elements.edot * d,
    M: elements.M + elements.Mdot * d,
    Ndot: elements.Ndot,
    idot: elements.idot,
    wdot: elements.wdot,
    adot: elements.adot,
    edot: elements.edot,
    Mdot: elements.Mdot,
  };
}

function heliocentricEcliptic(elements: OrbitalElements): { x: number; y: number; z: number } {
  const E = solveKepler(elements.M, elements.e);
  const xv = elements.a * (Math.cos(E) - elements.e);
  const yv = elements.a * (Math.sqrt(1 - elements.e * elements.e) * Math.sin(E));
  const v = radToDeg(Math.atan2(yv, xv));
  const r = Math.sqrt(xv * xv + yv * yv);

  const N = degToRad(elements.N);
  const wv = degToRad(v + elements.w);
  const i = degToRad(elements.i);

  const xh = r * (Math.cos(N) * Math.cos(wv) - Math.sin(N) * Math.sin(wv) * Math.cos(i));
  const yh = r * (Math.sin(N) * Math.cos(wv) + Math.cos(N) * Math.sin(wv) * Math.cos(i));
  const zh = r * (Math.sin(wv) * Math.sin(i));
  return { x: xh, y: yh, z: zh };
}

function sunLongitudeFromEarth(d: number): number {
  // Fast apparent solar longitude approximation (good to ~1 degree for sign work).
  const L = normalizeDegrees(280.460 + 0.9856474 * d);
  const g = normalizeDegrees(357.528 + 0.9856003 * d);
  const lambda = L + 1.915 * Math.sin(degToRad(g)) + 0.02 * Math.sin(2 * degToRad(g));
  return normalizeDegrees(lambda);
}

function moonLongitudeApprox(d: number): number {
  // Fast geocentric lunar approximation.
  const N = normalizeDegrees(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = normalizeDegrees(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = normalizeDegrees(115.3654 + 13.0649929509 * d);

  const E = solveKepler(M, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * (Math.sqrt(1 - e * e) * Math.sin(E));
  const v = radToDeg(Math.atan2(yv, xv));
  const r = Math.sqrt(xv * xv + yv * yv);

  const Nr = degToRad(N);
  const wr = degToRad(v + w);
  const ir = degToRad(i);

  const xh = r * (Math.cos(Nr) * Math.cos(wr) - Math.sin(Nr) * Math.sin(wr) * Math.cos(ir));
  const yh = r * (Math.sin(Nr) * Math.cos(wr) + Math.cos(Nr) * Math.sin(wr) * Math.cos(ir));
  const lon = radToDeg(Math.atan2(yh, xh));
  return normalizeDegrees(lon);
}

function geocentricPlanetLongitude(planet: Exclude<OraclePlanetName, 'Sun' | 'Moon'>, d: number): number {
  const earth = heliocentricEcliptic(orbitalElementsAtDay(ELEMENTS.Earth, d));
  const body = heliocentricEcliptic(orbitalElementsAtDay(ELEMENTS[planet], d));
  const xg = body.x - earth.x;
  const yg = body.y - earth.y;
  const lon = radToDeg(Math.atan2(yg, xg));
  return normalizeDegrees(lon);
}

export function computeZodiacSign(longitude: number): OracleZodiacSign {
  const idx = Math.floor(normalizeDegrees(longitude) / 30) % 12;
  return ZODIAC_SIGNS[idx];
}

export function computePlanetaryPositions(date: Date): Record<OraclePlanetName, number> {
  const d = daysSinceJ2000(date);
  const out = {} as Record<OraclePlanetName, number>;
  out.Sun = sunLongitudeFromEarth(d);
  out.Moon = moonLongitudeApprox(d);
  out.Mercury = geocentricPlanetLongitude('Mercury', d);
  out.Venus = geocentricPlanetLongitude('Venus', d);
  out.Mars = geocentricPlanetLongitude('Mars', d);
  out.Jupiter = geocentricPlanetLongitude('Jupiter', d);
  out.Saturn = geocentricPlanetLongitude('Saturn', d);
  out.Uranus = geocentricPlanetLongitude('Uranus', d);
  out.Neptune = geocentricPlanetLongitude('Neptune', d);
  out.Pluto = geocentricPlanetLongitude('Pluto', d);
  return out;
}

function meanObliquityDeg(T: number): number {
  return 23.439291 - 0.0130042 * T;
}

function localSiderealTimeDegrees(jd: number, longitudeDeg: number): number {
  const T = (jd - 2451545.0) / 36525;
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return normalizeDegrees(gmst + longitudeDeg);
}

function computeAscendantLongitude(date: Date, latitudeDeg: number, longitudeDeg: number): number {
  const jd = toJulianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const eps = degToRad(meanObliquityDeg(T));
  const lst = degToRad(localSiderealTimeDegrees(jd, longitudeDeg));
  const lat = degToRad(latitudeDeg);

  const y = -Math.cos(lst);
  const x = Math.sin(lst) * Math.cos(eps) + Math.tan(lat) * Math.sin(eps);
  return normalizeDegrees(radToDeg(Math.atan2(y, x)));
}

function computeMidheavenLongitude(date: Date, longitudeDeg: number): number {
  const jd = toJulianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const eps = degToRad(meanObliquityDeg(T));
  const lst = degToRad(localSiderealTimeDegrees(jd, longitudeDeg));
  const y = Math.sin(lst) * Math.cos(eps);
  const x = Math.cos(lst);
  return normalizeDegrees(radToDeg(Math.atan2(y, x)));
}

export function computeHouses(date: Date, latitude: number, longitude: number): {
  houses: OracleHouse[];
  ascendantLongitude: number;
  midheavenLongitude: number;
} {
  const asc = computeAscendantLongitude(date, latitude, longitude);
  const mc = computeMidheavenLongitude(date, longitude);
  const houses: OracleHouse[] = [];
  for (let i = 0; i < 12; i += 1) {
    const cusp = normalizeDegrees(asc + i * 30);
    houses.push({
      number: i + 1,
      cuspLongitude: cusp,
      sign: computeZodiacSign(cusp),
    });
  }
  return { houses, ascendantLongitude: asc, midheavenLongitude: mc };
}

function assignHouse(longitude: number, houses: OracleHouse[]): number {
  for (let i = 0; i < houses.length; i += 1) {
    const current = houses[i].cuspLongitude;
    const next = houses[(i + 1) % houses.length].cuspLongitude;
    if (current < next) {
      if (longitude >= current && longitude < next) return houses[i].number;
    } else if (longitude >= current || longitude < next) {
      return houses[i].number;
    }
  }
  return 1;
}

export function computeAspects(positions: OraclePlanetPosition[]): OracleAspect[] {
  const out: OracleAspect[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const p1 = positions[i];
      const p2 = positions[j];
      const diff = angularDifference(p1.longitude, p2.longitude);
      for (const aspect of ASPECT_DEFS) {
        const orb = Math.abs(diff - aspect.angle);
        if (orb <= aspect.orb) {
          out.push({
            type: aspect.type,
            from: p1.planet,
            to: p2.planet,
            angle: diff,
            orb,
          });
          break;
        }
      }
    }
  }
  return out;
}

function parseBirthDateTime(birthDate: string, birthTime = '12:00'): Date {
  const safeTime = /^\d{2}:\d{2}$/.test(birthTime) ? birthTime : '12:00';
  // Use UTC to keep deterministic behavior in tests and runtime.
  return new Date(`${birthDate}T${safeTime}:00.000Z`);
}

function planetSummaryLine(position: OraclePlanetPosition): string {
  const signText = SIGN_INTERPRETATION[position.sign];
  const houseText = HOUSE_INTERPRETATION[position.house] || 'life dynamics';
  return `${position.planet} in ${position.sign} (House ${position.house}): ${signText} Focus: ${houseText}.`;
}

function aspectSummaryLine(aspect: OracleAspect): string {
  return `${aspect.from} ${aspect.type} ${aspect.to}: ${ASPECT_INTERPRETATION[aspect.type]} (orb ${aspect.orb.toFixed(2)}°).`;
}

export function generateBirthChart(params: {
  birthDate: string;
  birthTime?: string;
  birthLocation: { latitude: number; longitude: number };
}): OracleBirthChart {
  const date = parseBirthDateTime(params.birthDate, params.birthTime);
  const raw = computePlanetaryPositions(date);
  const { houses, ascendantLongitude, midheavenLongitude } = computeHouses(
    date,
    params.birthLocation.latitude,
    params.birthLocation.longitude,
  );

  const planets: OraclePlanetPosition[] = PLANETS.map((planet) => {
    const lon = normalizeDegrees(raw[planet]);
    return {
      planet,
      longitude: lon,
      sign: computeZodiacSign(lon),
      degreeInSign: lon % 30,
      house: assignHouse(lon, houses),
    };
  });

  const aspects = computeAspects(planets);
  const sun = planets.find((p) => p.planet === 'Sun');
  const moon = planets.find((p) => p.planet === 'Moon');
  const summary: string[] = [];
  if (sun) summary.push(planetSummaryLine(sun));
  if (moon) summary.push(planetSummaryLine(moon));
  summary.push(
    `Ascendant in ${computeZodiacSign(ascendantLongitude)}; Midheaven in ${computeZodiacSign(midheavenLongitude)}.`,
  );
  summary.push(...aspects.slice(0, 6).map(aspectSummaryLine));

  return {
    generatedAt: Date.now(),
    birthDateIso: date.toISOString(),
    latitude: params.birthLocation.latitude,
    longitude: params.birthLocation.longitude,
    ascendantLongitude,
    midheavenLongitude,
    planets,
    houses,
    aspects,
    summary,
  };
}

const TRANSIT_DOMAIN_HINT: Partial<Record<OraclePlanetName, OracleLifeDomain>> = {
  Sun: 'growth',
  Moon: 'relationships',
  Mercury: 'social',
  Venus: 'relationships',
  Mars: 'career',
  Jupiter: 'growth',
  Saturn: 'financial',
  Uranus: 'creativity',
  Neptune: 'health',
  Pluto: 'career',
};

const TRANSIT_WEIGHT_BY_ASPECT: Record<OracleAspectType, number> = {
  conjunction: 0.18,
  sextile: 0.12,
  square: -0.14,
  trine: 0.16,
  opposition: -0.1,
};

function monthIso(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function computeTransits(params: {
  birthChart: OracleBirthChart;
  targetDate: Date;
  months?: number;
}): OracleTransitForecast {
  const months = Math.max(1, params.months ?? 12);
  const monthEntries: OracleTransitForecastMonth[] = [];

  for (let m = 0; m < months; m += 1) {
    const monthDate = new Date(Date.UTC(
      params.targetDate.getUTCFullYear(),
      params.targetDate.getUTCMonth() + m,
      1,
      12,
      0,
      0,
      0,
    ));
    const transitRaw = computePlanetaryPositions(monthDate);

    const signals: OracleTransitSignal[] = [];
    for (const transitPlanet of PLANETS) {
      const transitLon = transitRaw[transitPlanet];
      for (const natal of params.birthChart.planets) {
        const diff = angularDifference(transitLon, natal.longitude);
        for (const aspect of ASPECT_DEFS) {
          const orb = Math.abs(diff - aspect.angle);
          if (orb > Math.min(2.5, aspect.orb)) continue;
          const weightBase = TRANSIT_WEIGHT_BY_ASPECT[aspect.type];
          const attenuation = Math.max(0.3, 1 - orb / 4);
          const domain = TRANSIT_DOMAIN_HINT[transitPlanet] || 'growth';
          const signal: OracleTransitSignal = {
            id: `tr_${monthIso(monthDate)}_${transitPlanet}_${natal.planet}_${aspect.type}`,
            timestamp: monthDate.getTime(),
            planet: transitPlanet,
            target: natal.planet,
            type: aspect.type,
            orb,
            weight: Number((weightBase * attenuation).toFixed(3)),
            message: `${transitPlanet} ${aspect.type} natal ${natal.planet} (${orb.toFixed(2)}° orb)`,
            domain,
          };
          signals.push(signal);
        }
      }
    }

    signals.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const top = signals.slice(0, 4);
    const summary = top.length
      ? top.map((s) => s.message).join(' | ')
      : 'No dominant transit signatures this month.';
    monthEntries.push({
      monthIso: monthIso(monthDate),
      signals: top,
      summary,
    });
  }

  return {
    generatedAt: Date.now(),
    fromIso: monthIso(params.targetDate),
    months: monthEntries,
  };
}

