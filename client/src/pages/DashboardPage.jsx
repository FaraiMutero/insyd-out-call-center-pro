import { useMemo, useState } from "react";
import { usePlayer } from "../components/AppLayout";

/* ==============================
   HELPERS
   ============================== */
function seedRand(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SENT = {
  crit: { label: 'Churn risk', hex: '#FF6B6B', cssVar: 'var(--crit)' },
  risk: { label: 'At risk',    hex: '#F4B740', cssVar: 'var(--risk)' },
  neu:  { label: 'Neutral',    hex: '#6FA8FF', cssVar: 'var(--neu)'  },
  pos:  { label: 'Positive',   hex: '#37D399', cssVar: 'var(--pos)'  },
};

const MOMENTS = [
  '"I\'m thinking of switching providers" at 2:14',
  'Price objection left unresolved at close',
  'Status request handled cleanly',
  'Renewal confirmed, customer reassured',
  'Home cover cross-sell accepted',
  'Technical escalation requested by customer',
  'Customer expressed satisfaction at 3:45',
  'Follow-up commitment missed at close',
];

/* Demo recordings shown when no real recordings exist yet — one per sentiment type */
const DEMO_TRACKS = [
  {
    id: 'demo-5', originalFilename: 'customer_cancellation_risk.wav',
    agentName: 'Mina Manager', status: 'complete', duration: 522,
    callDatetime: '2026-06-11T09:00:00Z', direction: 'inbound',
    sent: 'crit', score: 62, type: 'Retention',
    moment: '"I\'m thinking of switching providers" at 2:14',
  },
  {
    id: 'demo-1', originalFilename: 'insurance_quote_objection.wav',
    agentName: 'Ayo Agent', status: 'complete', duration: 441,
    callDatetime: '2026-06-11T10:15:00Z', direction: 'outbound',
    sent: 'risk', score: 70, type: 'Sales',
    moment: 'Price objection left unresolved at close',
  },
  {
    id: 'demo-3', originalFilename: 'claims_status_inbound.wav',
    agentName: 'Qana Analyst', status: 'complete', duration: 245,
    callDatetime: '2026-06-11T11:30:00Z', direction: 'inbound',
    sent: 'neu', score: 84, type: 'Service',
    moment: 'Status request handled cleanly',
  },
  {
    id: 'demo-4', originalFilename: 'policy_renewal_followup.wav',
    agentName: 'Mina Manager', status: 'complete', duration: 333,
    callDatetime: '2026-06-11T12:00:00Z', direction: 'outbound',
    sent: 'pos', score: 88, type: 'Renewal',
    moment: 'Renewal confirmed, customer reassured',
  },
  {
    id: 'demo-2', originalFilename: 'upsell_home_cover.wav',
    agentName: 'Ayo Agent', status: 'complete', duration: 378,
    callDatetime: '2026-06-11T13:45:00Z', direction: 'outbound',
    sent: 'pos', score: 91, type: 'Upsell',
    moment: 'Home cover cross-sell accepted',
  },
];

function toSent(rec) {
  if (rec.status === 'failed') return 'crit';
  if (rec.status === 'uploaded') return 'risk';
  const v = seedRand((rec.originalFilename || 'x') + 'sent')();
  if (v < 0.22) return 'crit';
  if (v < 0.42) return 'risk';
  if (v < 0.68) return 'neu';
  return 'pos';
}

function toScore(rec) {
  const r = seedRand((rec.originalFilename || 'x') + 'sc');
  if (rec.status === 'failed') return 38 + Math.floor(r() * 22);
  return 56 + Math.floor(r() * 38);
}

function toType(rec) {
  if (rec.direction === 'inbound') return 'Service';
  if (rec.direction === 'outbound') return 'Sales';
  return 'General';
}

function toMoment(rec) {
  const idx = Math.floor(seedRand((rec.originalFilename || 'x') + 'm')() * MOMENTS.length);
  return MOMENTS[idx];
}

function toTitle(filename) {
  return (filename || 'Recording')
    .replace(/\.(wav|mp3|m4a|ogg|opus|wma|amr)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function fmt(s) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function agentColor(name) {
  const COLORS = ['#7C6CFF', '#5B8DEF', '#37D399', '#F4B740', '#FF6B6B', '#C084FC'];
  if (!name) return '#5E667C';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}

function agentInit(name) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function coverStyle(seed, hex) {
  const r = seedRand(seed);
  const a = Math.floor(r() * 360);
  const b = (a + 40 + r() * 60) % 360;
  return {
    background: `
      radial-gradient(120% 120% at ${(20 + r() * 30).toFixed(0)}% ${(10 + r() * 20).toFixed(0)}%, ${hex} 0%, transparent 55%),
      radial-gradient(120% 120% at ${(70 + r() * 20).toFixed(0)}% ${(70 + r() * 20).toFixed(0)}%, hsl(${b} 55% 22%) 0%, transparent 60%),
      linear-gradient(135deg, hsl(${a} 45% 16%), hsl(${b} 50% 9%))`
  };
}

/* ==============================
   WAVE SVG
   ============================== */
function WaveSVG({ seed, hex, w = 120, h = 40, className = 'wave' }) {
  const r = seedRand(seed + 'w');
  const n = 34;
  const bars = Array.from({ length: n }, (_, i) => {
    const bh = (0.18 + r() * 0.82) * h;
    const x  = (i / n) * w + 1;
    return (
      <rect key={i}
        x={x.toFixed(1)} y={(h - bh).toFixed(1)}
        width={((w / n) - 1.2).toFixed(1)} height={bh.toFixed(1)}
        rx="1" fill={hex} opacity={(0.4 + r() * 0.6).toFixed(2)} />
    );
  });
  return <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">{bars}</svg>;
}

/* ==============================
   STATUS PILL HELPER
   ============================== */
function statusPill(status) {
  const map = {
    uploaded:               { bg: 'rgba(244,183,64,.15)',  color: 'var(--risk)', dot: '#F4B740', label: 'Uploaded' },
    converting:             { bg: 'rgba(111,168,255,.15)', color: 'var(--neu)',  dot: '#6FA8FF', label: 'Converting' },
    ready_for_transcription:{ bg: 'rgba(55,211,153,.15)',  color: 'var(--pos)',  dot: '#37D399', label: 'Ready' },
    transcribing:           { bg: 'rgba(139,124,255,.15)', color: 'var(--brand)',dot: '#8B7CFF', label: 'Transcribing' },
    analyzing:              { bg: 'rgba(139,124,255,.15)', color: 'var(--brand)',dot: '#8B7CFF', label: 'Analysing' },
    complete:               { bg: 'rgba(55,211,153,.15)',  color: 'var(--pos)',  dot: '#37D399', label: 'Complete' },
    failed:                 { bg: 'rgba(255,107,107,.15)', color: 'var(--crit)', dot: '#FF6B6B', label: 'Failed' },
  };
  const s = map[status] || { bg: 'rgba(255,255,255,.06)', color: 'var(--muted)', dot: '#5E667C', label: status || 'Unknown' };
  return (
    <span className="detail-status-pill" style={{ background: s.bg, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  );
}

/* ==============================
   ICONS (inline SVG)
   ============================== */
const IcPlay    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" style={{marginLeft:2}}><path d="M8 5v14l11-7z"/></svg>;
const IcPlaySm  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>;
const IcPause   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>;
const IcHeart   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>;
const IcClock   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
const IcClose   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>;
const IcDetails = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>;

/* ==============================
   MAIN COMPONENT
   ============================== */
export default function DashboardPage({ recordings = [], user }) {
  const { onPlay, currentTrack, playing } = usePlayer() || {};
  const accessToken = localStorage.getItem('accessToken') || '';

  const [filter,      setFilter]      = useState('all');
  const [search,      setSearch]      = useState('');
  const [selectedRec, setSelectedRec] = useState(null);
  const [flagged,     setFlagged]     = useState(new Set());

  const isDemo = recordings.length === 0;

  /* augment recordings with mock QA data; fall back to demo tracks when empty */
  const tracks = useMemo(() => {
    const source = isDemo ? DEMO_TRACKS : recordings;
    return source.map(rec => ({
      ...rec,
      sent:   rec.sent   ?? toSent(rec),
      score:  rec.score  ?? toScore(rec),
      type:   rec.type   ?? toType(rec),
      moment: rec.moment ?? toMoment(rec),
      title:  toTitle(rec.originalFilename),
    }));
  }, [recordings, isDemo]);

  /* pipeline counts — zeroed out in demo mode */
  const counts = useMemo(() => ({
    total:     isDemo ? 0 : recordings.length,
    uploading: isDemo ? 0 : recordings.filter(r => r.status === 'uploaded').length,
    converting:isDemo ? 0 : recordings.filter(r => r.status === 'converting').length,
    ready:     isDemo ? 0 : recordings.filter(r => r.status === 'ready_for_transcription').length,
  }), [recordings, isDemo]);

  /* featured = crit + risk, max 4 */
  const featured = useMemo(() =>
    tracks.filter(t => t.sent === 'crit' || t.sent === 'risk').slice(0, 4),
  [tracks]);

  /* filtered track list */
  const visible = useMemo(() => tracks.filter(t => {
    const okFilter =
      filter === 'all' ||
      (filter === 'crit' && (t.sent === 'crit' || t.sent === 'risk')) ||
      (filter === 'pos'  && t.sent === 'pos') ||
      (filter === 'neu'  && t.sent === 'neu');
    const q = search.toLowerCase();
    const okSearch = !q ||
      (t.originalFilename || '').toLowerCase().includes(q) ||
      (t.agentName || '').toLowerCase().includes(q) ||
      (t.type || '').toLowerCase().includes(q);
    return okFilter && okSearch;
  }), [tracks, filter, search]);

  function handleTrackClick(t, e) {
    if (e.target.closest('.flag-btn')) {
      setFlagged(prev => {
        const next = new Set(prev);
        next.has(t.id) ? next.delete(t.id) : next.add(t.id);
        return next;
      });
      return;
    }
    setSelectedRec(t);
    onPlay?.(t);
  }

  /* ---- selected record display data ---- */
  const sel = selectedRec;
  const selSent  = sel ? SENT[sel.sent] : null;
  const selCover = sel ? coverStyle(sel.originalFilename || 'x', selSent?.hex || '#6FA8FF') : null;
  const selColor = sel ? agentColor(sel.agentName) : '#5E667C';

  const showDetail = !!selectedRec;

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="eyebrow">Operational Command Center</div>
        <h1>Quality <span className="accent">Intelligence</span></h1>
        <p>Every agent call, scored and surfaced. Listen to what needs a human, watch the pipeline move, and keep your QA posture tight — all from one place.</p>
        <div className="pipeline">
          <div className="pipe">
            <div className="pipe-ic" style={{ background: 'rgba(139,124,255,.16)', color: 'var(--brand)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div><div className="pipe-num">{counts.total}</div><div className="pipe-lbl">Total recordings</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: 'rgba(111,168,255,.16)', color: 'var(--neu)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>
            </div>
            <div><div className="pipe-num">{counts.uploading}</div><div className="pipe-lbl">Uploading</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: 'rgba(244,183,64,.16)', color: 'var(--risk)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.2-8.5"/><path d="M21 4v5h-5"/></svg>
            </div>
            <div><div className="pipe-num">{counts.converting}</div><div className="pipe-lbl">Converting</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: 'rgba(55,211,153,.16)', color: 'var(--pos)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div><div className="pipe-num">{counts.ready}</div><div className="pipe-lbl">Ready to transcribe</div></div>
          </div>
        </div>
      </section>

      {/* ===== NEEDS YOUR EAR ===== */}
      {featured.length > 0 && (
        <section className="sec">
          <div className="sec-head">
            <div>
              <h2>Needs your ear</h2>
              <div className="sec-sub">Calls our scoring flagged for a human listen — highest risk first.</div>
            </div>
            <button className="see-all" onClick={() => setFilter('crit')}>Show all</button>
          </div>
          <div className="feat-grid">
            {featured.map(t => {
              const s   = SENT[t.sent];
              const ac  = agentColor(t.agentName);
              const seed = t.originalFilename || 'x';
              const isPlaying = currentTrack?.id === t.id && playing;
              return (
                <article key={t.id} className="feat" onClick={() => { setSelectedRec(t); onPlay?.(t); }}>
                  <div className="feat-cover" style={coverStyle(seed, s.hex)}>
                    <span className="feat-badge">
                      <span className="badge-dot" style={{ background: s.hex }} />
                      {s.label}
                    </span>
                    <WaveSVG seed={seed} hex={s.hex} w={200} h={90} />
                    <button className="feat-play" aria-label={`Play ${t.title}`}
                      onClick={e => { e.stopPropagation(); onPlay?.(t); }}>
                      {isPlaying ? <IcPause /> : <IcPlay />}
                    </button>
                  </div>
                  <div className="feat-name">{t.title}</div>
                  <div className="feat-desc">{t.moment}</div>
                  <div className="feat-foot">
                    <span className="agent-tag">
                      <span className="mini-av" style={{ width: 18, height: 18, fontSize: 8, background: ac }}>{agentInit(t.agentName)}</span>
                      {t.agentName || 'Unknown'}
                    </span>
                    <span>·</span>
                    <span>QA {t.score}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                      {t.duration ? fmt(t.duration) : '–:––'}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== AGENT RECORDINGS + DETAIL PANEL ===== */}
      <div className={showDetail ? 'qi-row' : ''}>
        <section className="sec">
          <div className="sec-head">
            <div>
              <h2>Agent recordings</h2>
              <div className="sec-sub">The full library. Click a row to open details or play.</div>
            </div>
          </div>

          {/* filter chips */}
          <div className="list-tools">
            <div className="seg">
              {[
                { key: 'all',  label: 'All calls' },
                { key: 'crit', label: 'At risk' },
                { key: 'pos',  label: 'Wins' },
                { key: 'neu',  label: 'Service' },
              ].map(({ key, label }) => (
                <button key={key} className={`chip${filter === key ? ' on' : ''}`}
                  onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
            {/* search */}
            <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ position: 'absolute', left: 10, width: 15, height: 15, color: 'var(--faint)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                type="search" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter recordings…"
                style={{ paddingLeft: 32, width: 200, borderRadius: 999, fontSize: 13, height: 36 }}
              />
            </div>
          </div>

          {/* table */}
          <div className="track-table">
            <div className="thead">
              <div style={{ textAlign: 'center' }}>#</div>
              <div>Title</div>
              <div className="col-agent">Agent</div>
              <div className="col-sentiment">Sentiment</div>
              <div className="col-score">QA score</div>
              <div className="col-date right">Date</div>
              <div className="right"><IcClock /></div>
            </div>

            {visible.length === 0 && (
              <div className="empty">
                <strong>No calls match.</strong>
                Try a different filter or clear your search.
              </div>
            )}

            {visible.map((t, i) => {
              const s        = SENT[t.sent];
              const ac       = agentColor(t.agentName);
              const seed     = t.originalFilename || 'x';
              const isPlay   = currentTrack?.id === t.id && playing;
              const isCurrent= currentTrack?.id === t.id;
              const isFlagged= flagged.has(t.id);
              const dateStr  = t.callDatetime ? new Date(t.callDatetime).toLocaleDateString() : '–';

              return (
                <div key={t.id}
                  className={`track${isCurrent ? ' playing' : ''}`}
                  onClick={e => handleTrackClick(t, e)}
                >
                  {/* index */}
                  <div className="t-index">
                    <span className="num">{i + 1}</span>
                    <span className="play-ic"><IcPlaySm /></span>
                    <span className="eq">
                      <span className="eq-bars"><span/><span/><span/></span>
                    </span>
                  </div>

                  {/* title + cover */}
                  <div className="t-title">
                    <div className="t-cover" style={coverStyle(seed, s.hex)}>
                      <WaveSVG seed={seed} hex={s.hex} w={84} h={42} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="t-name">{t.title}</div>
                      <div className="t-tag">{t.type} · {t.moment.slice(0, 38)}…</div>
                    </div>
                  </div>

                  {/* agent */}
                  <div className="t-agent col-agent">
                    <span className="mini-av" style={{ width: 24, height: 24, fontSize: 9, background: ac }}>{agentInit(t.agentName)}</span>
                    <span>{t.agentName || '—'}</span>
                  </div>

                  {/* sentiment */}
                  <div className="col-sentiment">
                    <span className="sentiment">
                      <span className="s-dot" style={{ background: s.hex }} />
                      {s.label}
                    </span>
                  </div>

                  {/* QA score ring */}
                  <div className="col-score">
                    <div className="score">
                      <div className="score-ring" style={{ '--p': t.score, '--c': s.hex }}>
                        <span className="score-val">{t.score}</span>
                      </div>
                    </div>
                  </div>

                  {/* date */}
                  <div className="t-date col-date">{dateStr}</div>

                  {/* flag + duration */}
                  <div className="t-dur">
                    <button className={`flag-btn${isFlagged ? ' on' : ''}`} aria-label="Flag">
                      <IcHeart />
                    </button>
                    {t.duration ? fmt(t.duration) : '–:––'}
                  </div>
                </div>
              );
            })}
          </div>

          {isDemo && (
            <div style={{ padding: '14px 14px 0', fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>
              Showing demo recordings — import a real call to replace these.
            </div>
          )}
          <div className="pad-bottom" />
        </section>

        {/* ===== RECORDING DETAILS PANEL ===== */}
        {showDetail && (
          <aside className="detail-sidebar">
            <div className="detail-head">
              <h3>Recording Details</h3>
              <button className="detail-close" aria-label="Close details" onClick={() => setSelectedRec(null)}>
                <IcClose />
              </button>
            </div>

            {/* cover art */}
            <div className="detail-cover" style={selCover}>
              <WaveSVG seed={sel.originalFilename || 'x'} hex={selSent.hex} w={280} h={80} />
            </div>

            {/* QA score block */}
            <div className="detail-score-block">
              <div className="detail-score-num">{sel.score}</div>
              <div className="detail-score-label">QA Score</div>
            </div>

            {/* metadata */}
            <div className="detail-meta">
              <div className="detail-row">
                <span className="detail-label">Agent</span>
                <span className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="mini-av" style={{ width: 22, height: 22, fontSize: 9, background: selColor }}>
                    {agentInit(sel.agentName)}
                  </span>
                  {sel.agentName || 'Unknown'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Date</span>
                <span className="detail-value">
                  {sel.callDatetime ? new Date(sel.callDatetime).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Direction</span>
                <span className="detail-value">{sel.direction ? sel.direction.charAt(0).toUpperCase() + sel.direction.slice(1) : '—'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Type</span>
                <span className="detail-value">{sel.type}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Sentiment</span>
                <span className="sentiment" style={{ fontSize: 13 }}>
                  <span className="s-dot" style={{ background: selSent.hex }} />
                  {selSent.label}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                {statusPill(sel.status)}
              </div>
            </div>

            {/* key moment */}
            <div className="detail-moment">"{sel.moment}"</div>

            {/* actions */}
            <div className="detail-actions">
              <button className="detail-btn detail-btn-primary"
                onClick={() => onPlay?.(sel)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M8 5v14l11-7z"/></svg>
                {currentTrack?.id === sel.id && playing ? 'Pause Recording' : 'Play Recording'}
              </button>
              {sel.storagePath && (
                <a className="detail-btn detail-btn-ghost"
                  href={`/api/recordings/${sel.id}/stream?token=${encodeURIComponent(accessToken)}`}
                  download={sel.originalFilename}
                  onClick={e => e.stopPropagation()}
                  style={{ textDecoration: 'none' }}>
                  <IcDetails />
                  Download
                </a>
              )}
              <button className="detail-btn detail-btn-ghost" onClick={() => setSelectedRec(null)}>
                Close panel
              </button>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
