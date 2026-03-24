import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Button, Card, StatusDot } from './ui';

const SENTIMENT_KEYS = [
  'loneliness',
  'creativity',
  'fearOfFailure',
  'ambition',
  'hopefulness',
  'resilience',
  'socialEnergy',
  'selfAwareness',
] as const;

function metricLabel(key: (typeof SENTIMENT_KEYS)[number]): string {
  switch (key) {
    case 'fearOfFailure':
      return 'fear';
    case 'socialEnergy':
      return 'social';
    case 'selfAwareness':
      return 'awareness';
    default:
      return key;
  }
}

const ZODIAC_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

function BirthChartWheel({
  chart,
}: {
  chart: NonNullable<ReturnType<typeof useStore.getState>['oracle']['birthChart']>;
}) {
  const size = 320;
  const center = size / 2;
  const rOuter = 140;
  const rMid = 118;
  const rInner = 100;
  const rPlanet = 76;

  const signLines = Array.from({ length: 12 }, (_, i) => {
    const angle = ((i * 30 - 90) * Math.PI) / 180;
    return {
      x1: center + Math.cos(angle) * rInner,
      y1: center + Math.sin(angle) * rInner,
      x2: center + Math.cos(angle) * rOuter,
      y2: center + Math.sin(angle) * rOuter,
      gx: center + Math.cos(angle + (15 * Math.PI) / 180) * ((rMid + rOuter) / 2),
      gy: center + Math.sin(angle + (15 * Math.PI) / 180) * ((rMid + rOuter) / 2),
      glyph: ZODIAC_GLYPHS[i],
    };
  });

  return (
    <div className="oracle-chart-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="chartBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(88, 28, 135, 0.15)" />
            <stop offset="100%" stopColor="rgba(15, 13, 35, 0.4)" />
          </radialGradient>
          <filter id="planetGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="chartGlow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={center} cy={center} r={rOuter + 6} fill="url(#chartBg)" />

        <g className="oracle-chart-ring">
          <circle cx={center} cy={center} r={rOuter} fill="none" stroke="rgba(167,139,250,0.25)" strokeWidth={1} />
          <circle
            cx={center}
            cy={center}
            r={rMid}
            fill="none"
            stroke="rgba(167,139,250,0.12)"
            strokeWidth={0.5}
            strokeDasharray="2 4"
          />
          <circle cx={center} cy={center} r={rInner} fill="none" stroke="rgba(167,139,250,0.2)" strokeWidth={1} />
        </g>

        {signLines.map((ln, idx) => (
          <g key={idx}>
            <line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke="rgba(167,139,250,0.15)" strokeWidth={0.8} />
            <text
              x={ln.gx}
              y={ln.gy}
              fill="rgba(167,139,250,0.5)"
              fontSize="11"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {ln.glyph}
            </text>
          </g>
        ))}

        {[0.33, 0.66, 1].map((s) => (
          <circle
            key={s}
            cx={center}
            cy={center}
            r={rPlanet * s}
            fill="none"
            stroke="rgba(167,139,250,0.06)"
            strokeWidth={0.5}
          />
        ))}

        {chart.planets.map((planet) => {
          const angle = ((planet.longitude - 90) * Math.PI) / 180;
          const rx = center + Math.cos(angle) * rPlanet;
          const ry = center + Math.sin(angle) * rPlanet;
          return (
            <g key={planet.planet} filter="url(#planetGlow)" className="oracle-planet-glow">
              <circle cx={rx} cy={ry} r={5} fill="rgba(167,139,250,0.9)" />
              <circle cx={rx} cy={ry} r={2} fill="#e2d6ff" />
              <text x={rx + 8} y={ry + 3} fill="#c4b5fd" fontSize="9" fontFamily="var(--font-mono)">
                {planet.planet.slice(0, 3)}
              </text>
            </g>
          );
        })}

        <g filter="url(#chartGlow)">
          <text x={14} y={24} fill="rgba(34,211,238,0.7)" fontSize="10" fontFamily="var(--font-mono)">
            ASC {chart.houses[0]?.sign}
          </text>
          <text x={14} y={40} fill="rgba(34,211,238,0.55)" fontSize="10" fontFamily="var(--font-mono)">
            MC {chart.houses[9]?.sign}
          </text>
        </g>
      </svg>
    </div>
  );
}

function SentimentRadar({ profile }: { profile: ReturnType<typeof useStore.getState>['oracle']['sentimentProfile'] }) {
  const size = 280;
  const center = size / 2;
  const r = 100;

  const axisPoints = SENTIMENT_KEYS.map((key, idx) => {
    const angle = (Math.PI * 2 * idx) / SENTIMENT_KEYS.length - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
      lx: center + Math.cos(angle) * (r + 16),
      ly: center + Math.sin(angle) * (r + 16),
      key,
    };
  });

  const dataPoints = SENTIMENT_KEYS.map((key, idx) => {
    const v = profile[key];
    const angle = (Math.PI * 2 * idx) / SENTIMENT_KEYS.length - Math.PI / 2;
    return [center + Math.cos(angle) * r * v, center + Math.sin(angle) * r * v] as const;
  });
  const poly = dataPoints.map((p) => `${p[0]},${p[1]}`).join(' ');

  return (
    <div className="oracle-chart-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(88, 28, 135, 0.12)" />
            <stop offset="100%" stopColor="rgba(15, 13, 35, 0.35)" />
          </radialGradient>
          <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(124, 58, 237, 0.25)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.2)" />
          </linearGradient>
          <filter id="radarGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={center} cy={center} r={r + 20} fill="url(#radarBg)" />

        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle
            key={scale}
            cx={center}
            cy={center}
            r={r * scale}
            fill="none"
            stroke={scale === 1 ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.08)'}
            strokeWidth={scale === 1 ? 1 : 0.5}
            strokeDasharray={scale < 1 ? '2 4' : undefined}
          />
        ))}

        {axisPoints.map((pt) => (
          <g key={pt.key}>
            <line x1={center} y1={center} x2={pt.x} y2={pt.y} stroke="rgba(167,139,250,0.1)" strokeWidth={0.5} />
            <text
              x={pt.lx}
              y={pt.ly}
              fill="rgba(167,139,250,0.55)"
              fontSize="9"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {metricLabel(pt.key)}
            </text>
          </g>
        ))}

        <polygon
          points={poly}
          fill="url(#radarFill)"
          stroke="rgba(167,139,250,0.6)"
          strokeWidth={1.5}
          filter="url(#radarGlow)"
          className="oracle-radar-polygon"
        />

        {dataPoints.map((pt, i) => (
          <circle key={i} cx={pt[0]} cy={pt[1]} r={3} fill="#c4b5fd" stroke="#7c3aed" strokeWidth={1} />
        ))}
      </svg>
    </div>
  );
}

const DOMAIN_ICONS: Record<string, string> = {
  career: '⬡',
  relationships: '◇',
  health: '◎',
  creativity: '✦',
  growth: '△',
  social: '◈',
  financial: '⬢',
};

export default function OraclePanel() {
  const oracle = useStore((s) => s.oracle);
  const oracleSetSubject = useStore((s) => s.oracleSetSubject);
  const oracleSetFullName = useStore((s) => s.oracleSetFullName);
  const oracleIngestText = useStore((s) => s.oracleIngestText);
  const oracleRunForecast = useStore((s) => s.oracleRunForecast);
  const oracleToggleOverlay = useStore((s) => s.oracleToggleOverlay);
  const oracleToggleAstroVoice = useStore((s) => s.oracleToggleAstroVoice);

  const [name, setName] = useState(oracle.subject.name);
  const [fullName, setFullName] = useState(oracle.subject.fullName || oracle.subject.name);
  const [birthDate, setBirthDate] = useState(oracle.subject.birthDate);
  const [birthTime, setBirthTime] = useState(oracle.subject.birthTime || '12:00');
  const [locationLabel, setLocationLabel] = useState(oracle.subject.birthLocationLabel || 'Unknown');
  const [latitude, setLatitude] = useState(String(oracle.subject.birthLocation.latitude));
  const [longitude, setLongitude] = useState(String(oracle.subject.birthLocation.longitude));
  const [ingestText, setIngestText] = useState('');

  const groupedBranches = useMemo(() => {
    if (!oracle.activeForecast) return {};
    const grouped: Record<string, typeof oracle.activeForecast.branches> = {};
    for (const b of oracle.activeForecast.branches) {
      if (!grouped[b.domain]) grouped[b.domain] = [];
      grouped[b.domain].push(b);
    }
    for (const arr of Object.values(grouped)) {
      arr.sort((a, b) => b.probability - a.probability);
    }
    return grouped;
  }, [oracle.activeForecast]);

  const handleSetSubject = () => {
    if (!name.trim() || !birthDate.trim()) return;
    const lat = Number(latitude);
    const lon = Number(longitude);
    oracleSetSubject(name.trim(), birthDate.trim(), birthTime.trim(), {
      label: locationLabel.trim() || 'Unknown',
      latitude: Number.isFinite(lat) ? lat : 42.3601,
      longitude: Number.isFinite(lon) ? lon : -71.0589,
    });
    if (fullName.trim()) oracleSetFullName(fullName.trim());
  };

  return (
    <div className="oracle-panel">
      <div className="oracle-header">
        <div className="oracle-header-title">
          <div className="oracle-sigil">☿</div>
          <div>
            <h2>ORACLE</h2>
            <div className="oracle-header-sub">
              Life trajectory forecasting via simulation, astrology, numerology &amp; archetype synthesis
            </div>
          </div>
        </div>
      </div>

      <div className="oracle-body">
        {/* Subject Setup */}
        <Card title="Subject Configuration" glow="purple" className="oracle-card">
          <div className="oracle-input-grid">
            <input
              className="oracle-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
            />
            <input
              className="oracle-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full legal name"
            />
            <input
              className="oracle-input"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
            <input
              className="oracle-input"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              placeholder="HH:mm"
            />
            <input
              className="oracle-input"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="Location label"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                className="oracle-input"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="lat"
              />
              <input
                className="oracle-input"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="lon"
              />
            </div>
          </div>
          <div className="oracle-controls">
            <Button className="oracle-btn" onClick={handleSetSubject}>
              Set Subject
            </Button>
            <Button variant="primary" className="oracle-btn primary" onClick={() => oracleRunForecast()}>
              Run Forecast
            </Button>
            <label className="oracle-toggle">
              <input
                type="checkbox"
                checked={oracle.activeOverlays.astrology}
                onChange={(e) => oracleToggleOverlay('astrology', e.target.checked)}
              />
              astrology
            </label>
            <label className="oracle-toggle">
              <input
                type="checkbox"
                checked={oracle.activeOverlays.numerology}
                onChange={(e) => oracleToggleOverlay('numerology', e.target.checked)}
              />
              numerology
            </label>
            <label className="oracle-toggle">
              <input
                type="checkbox"
                checked={oracle.activeOverlays.archetypes}
                onChange={(e) => oracleToggleOverlay('archetypes', e.target.checked)}
              />
              archetypes
            </label>
            <label className="oracle-toggle oracle-toggle-voice">
              <input
                type="checkbox"
                checked={oracle.astroVoiceEnabled}
                onChange={(e) => oracleToggleAstroVoice(e.target.checked)}
              />
              astro voice
            </label>
            <span className="oracle-status">
              <StatusDot status="online" size={6} />
              {oracle.phase} · calibration {(oracle.calibrationScore * 100).toFixed(0)}%
            </span>
          </div>
        </Card>

        {/* Signal Ingestion */}
        <Card title="Signal Ingestion" glow="purple" className="oracle-card">
          <textarea
            className="oracle-textarea"
            value={ingestText}
            onChange={(e) => setIngestText(e.target.value)}
            placeholder="Paste reading text, personal narrative, LinkedIn traces, journal entries..."
            rows={4}
          />
          <div className="oracle-ingest-footer">
            <Button
              className="oracle-btn"
              onClick={() => {
                oracleIngestText(ingestText);
                setIngestText('');
              }}
            >
              Ingest Signal
            </Button>
            <span className="oracle-ingest-stats">
              {oracle.lifeEvents.length} events · {oracle.socialGraph.length} social nodes
            </span>
          </div>
        </Card>

        {/* Birth Chart + Sentiment Radar */}
        <div className="oracle-grid-2">
          <Card title="Birth Chart" glow="purple" className="oracle-card">
            {oracle.birthChart ? (
              <BirthChartWheel chart={oracle.birthChart} />
            ) : (
              <div className="oracle-empty">
                No chart generated yet.
                <br />
                Set a subject and run forecast.
              </div>
            )}
          </Card>
          <Card title="Sentiment Radar" glow="purple" className="oracle-card">
            <SentimentRadar profile={oracle.sentimentProfile} />
          </Card>
        </div>

        {/* Numerology */}
        <Card title="Numerology Profile" glow="purple" className="oracle-card">
          {oracle.numerology ? (
            <div className="oracle-num-grid">
              {[
                oracle.numerology.lifePath,
                oracle.numerology.expression,
                oracle.numerology.soulUrge,
                oracle.numerology.personality,
                oracle.numerology.birthday,
                oracle.numerology.maturity,
                oracle.numerology.personalYear,
              ].map((n) => (
                <div key={n.label} className="oracle-num-card">
                  <div className="oracle-num-label">{n.label}</div>
                  <div className="oracle-num-value">{n.compound ? `${n.compound}/${n.core}` : n.core}</div>
                  <div className="oracle-num-desc">{n.interpretation.life}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="oracle-empty">No numerology output yet.</div>
          )}
        </Card>

        {/* Destiny Matrix Report */}
        <Card title="Destiny Matrix Report" glow="purple" className="oracle-card">
          {!oracle.destinyMatrixReport ? (
            <div className="oracle-empty">
              No long-form report yet.
              <br />
              Run forecast to generate destiny matrix narrative output.
            </div>
          ) : (
            <div className="oracle-report">
              <div className="oracle-report-meta">
                Generated {new Date(oracle.destinyMatrixReport.generatedAt).toLocaleString()} · horizon{' '}
                {oracle.destinyMatrixReport.horizonMonths} months
              </div>
              {oracle.destinyMatrixReport.sections.map((section) => (
                <div key={section.id} className="oracle-report-section">
                  <div className="oracle-report-title">{section.title}</div>
                  {section.body.split('\n\n').map((paragraph, idx) => (
                    <p key={`${section.id}_${idx}`} className="oracle-report-body">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Astro Voice Profile */}
        {oracle.astroVoiceEnabled && oracle.communicationProfile && (
          <Card title="Astro Voice Profile" glow="cyan" className="oracle-card oracle-voice-card">
            <div className="oracle-voice-badge">
              {[
                oracle.communicationProfile.sunSign ? `☉ ${oracle.communicationProfile.sunSign}` : null,
                oracle.communicationProfile.moonSign ? `☽ ${oracle.communicationProfile.moonSign}` : null,
                oracle.communicationProfile.mercurySign ? `☿ ${oracle.communicationProfile.mercurySign}` : null,
                oracle.communicationProfile.ascendantSign ? `ASC ${oracle.communicationProfile.ascendantSign}` : null,
              ]
                .filter(Boolean)
                .map((sig) => (
                  <span key={sig} className="oracle-voice-sig">
                    {sig}
                  </span>
                ))}
              <span className="oracle-voice-pace">pace: {oracle.communicationProfile.pace}</span>
            </div>
            {oracle.communicationProfile.toneDirectives.length > 0 && (
              <div className="oracle-voice-section">
                <div className="oracle-voice-label">Tone Directives</div>
                {oracle.communicationProfile.toneDirectives.map((d, i) => (
                  <div key={i} className="oracle-voice-directive">
                    {d}
                  </div>
                ))}
              </div>
            )}
            {oracle.communicationProfile.avoidPatterns.length > 0 && (
              <div className="oracle-voice-section">
                <div className="oracle-voice-label">Avoid</div>
                {oracle.communicationProfile.avoidPatterns.map((a, i) => (
                  <div key={i} className="oracle-voice-directive oracle-voice-avoid">
                    {a}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Trajectory Forecast */}
        <Card title="Trajectory Forecast" glow="purple" className="oracle-card">
          {!oracle.activeForecast ? (
            <div className="oracle-empty">Run forecast to generate probabilistic branch trajectories.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {Object.entries(groupedBranches).map(([domain, branches]) => (
                <div key={domain} className="oracle-domain-card">
                  <div className="oracle-domain-label">
                    {DOMAIN_ICONS[domain] || '◆'} {domain}
                  </div>
                  {branches.slice(0, 3).map((b) => (
                    <div key={b.id} className="oracle-branch-row">
                      <div className="oracle-branch-header">
                        <span className="oracle-branch-label">{b.label}</span>
                        <span className="oracle-branch-pct">{Math.round(b.probability * 100)}%</span>
                      </div>
                      <div className="oracle-bar-track">
                        <div
                          className="oracle-bar-fill"
                          style={{ width: `${Math.max(2, Math.round(b.probability * 100))}%` }}
                        />
                      </div>
                      <div className="oracle-branch-desc">{b.description}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Archetypes + Transits */}
        <div className="oracle-grid-2">
          <Card title="Active Archetypes" glow="purple" className="oracle-card">
            {oracle.activeArchetypes.length === 0 ? (
              <div className="oracle-empty">No archetype mapping yet.</div>
            ) : (
              oracle.activeArchetypes.map((a) => (
                <div key={a.id} className="oracle-arch-row">
                  <div className="oracle-arch-header">
                    <span className="oracle-arch-name">{a.label}</span>
                    <span className="oracle-arch-score">{Math.round(a.score * 100)}%</span>
                  </div>
                  <div className="oracle-arch-rationale">{a.rationale}</div>
                </div>
              ))
            )}
          </Card>
          <Card title="Transit Calendar" glow="purple" className="oracle-card">
            {!oracle.transits ? (
              <div className="oracle-empty">No transit forecast yet.</div>
            ) : (
              oracle.transits.months.slice(0, 6).map((m) => (
                <div key={m.monthIso} className="oracle-transit-row">
                  <div className="oracle-transit-month">{m.monthIso}</div>
                  <div className="oracle-transit-summary">{m.summary}</div>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* Life Events Timeline */}
        <Card title="Life Events Timeline" glow="purple" className="oracle-card">
          {oracle.lifeEvents.length === 0 ? (
            <div className="oracle-empty">No life events ingested yet.</div>
          ) : (
            oracle.lifeEvents
              .slice(-15)
              .reverse()
              .map((ev) => (
                <div key={ev.id} className="oracle-event-row">
                  <div className="oracle-event-header">
                    <span className="oracle-event-label">{ev.label}</span>
                    <span className="oracle-event-domain">{ev.domain}</span>
                  </div>
                  <div className="oracle-event-meta">
                    sentiment {(ev.sentiment * 100).toFixed(0)} · significance {(ev.significance * 100).toFixed(0)}%
                  </div>
                </div>
              ))
          )}
        </Card>
      </div>
    </div>
  );
}
