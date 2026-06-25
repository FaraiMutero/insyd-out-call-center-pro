import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../components/AppLayout";
import { api } from "../api/client.js";

const SPEAKER_COLOR = { AGENT: "var(--brand)", CUSTOMER: "var(--pos)" };

/* Sentiment vocabulary from the analysis provider (call_analyses.sentiment) — distinct
   from the SENT map below, which colors the track list using a derived risk bucket. */
const ANALYSIS_SENT = {
  positive: { label: "Positive", hex: "var(--pos)" },
  neutral:  { label: "Neutral",  hex: "var(--neu)" },
  negative: { label: "Negative", hex: "var(--crit)" },
  mixed:    { label: "Mixed",    hex: "var(--risk)" },
};

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
const IcPlaySm  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>;
const IcHeart   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>;
const IcClock   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
const IcClose   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>;
const IcDetails = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>;

/* ==============================
   MAIN COMPONENT
   ============================== */
export default function DashboardPage({ recordings = [], user }) {
  const { onPlay, currentTrack, playing, pos } = usePlayer() || {};
  const navigate = useNavigate();

  const [filter,      setFilter]      = useState('all');
  const [search,      setSearch]      = useState('');
  const [selectedRec, setSelectedRec] = useState(null);
  const [manualTab,    setManualTab]    = useState(null);
  const [reportCache,  setReportCache]  = useState({});
  const segRefs = useRef({});
  const transcriptBoxRef = useRef(null);
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

  /* ---- detail-sidebar tabs: default to Transcription only while the selected
     recording is actually playing in the player; otherwise default to Details.
     A manual tab click overrides the default until a different recording is selected. */
  const isSelPlaying = !!sel && currentTrack?.id === sel.id && playing;
  const activeTab = manualTab || (isSelPlaying ? 'transcription' : 'details');
  const reportEntry = sel ? reportCache[sel.id] : null;

  useEffect(() => {
    setManualTab(null);
  }, [sel?.id]);

  // The transcript and analysis (scorecard/summary) tabs all need the same composite
  // call report — fetched once per recording and cached, regardless of which of the
  // three tabs triggered it.
  useEffect(() => {
    if (activeTab === 'details' || !sel || reportCache[sel.id]) return;
    const id = sel.id;
    setReportCache(prev => ({ ...prev, [id]: { status: 'loading', segments: [], analysis: null } }));
    api.getCallReport(id)
      .then(data => {
        setReportCache(prev => ({
          ...prev,
          [id]: { status: 'ready', segments: data?.transcript?.segments || [], analysis: data?.analysis || null }
        }));
      })
      .catch(() => {
        setReportCache(prev => ({ ...prev, [id]: { status: 'error', segments: [], analysis: null } }));
      });
  }, [activeTab, sel?.id]);

  const activeSegIdx = useMemo(() => {
    if (!isSelPlaying || !reportEntry?.segments?.length) return -1;
    return reportEntry.segments.findLastIndex(s => pos >= s.start);
  }, [isSelPlaying, reportEntry, pos]);

  // Scroll only the transcript box itself (never the page) — Element.scrollIntoView()
  // walks every scrollable ancestor, including the page's main scroll container, which
  // visibly shifted the whole dashboard. Setting this element's own scrollTop keeps the
  // animation confined to the transcript box.
  useEffect(() => {
    if (activeSegIdx < 0) return;
    const container = transcriptBoxRef.current;
    const el = segRefs.current[activeSegIdx];
    if (!container || !el) return;
    const target = el.offsetTop - (container.clientHeight - el.clientHeight) / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeSegIdx]);

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
              <div className="detail-tabs">
                <button
                  className={`detail-tab${activeTab === 'transcription' ? ' active' : ''}`}
                  onClick={() => setManualTab('transcription')}>
                  Transcription
                </button>
                <button
                  className={`detail-tab${activeTab === 'scorecard' ? ' active' : ''}`}
                  onClick={() => setManualTab('scorecard')}>
                  QA Scorecard
                </button>
                <button
                  className={`detail-tab${activeTab === 'summary' ? ' active' : ''}`}
                  onClick={() => setManualTab('summary')}>
                  Summary
                </button>
                <button
                  className={`detail-tab${activeTab === 'details' ? ' active' : ''}`}
                  onClick={() => setManualTab('details')}>
                  Recording Details
                </button>
              </div>
              <button className="detail-close" aria-label="Close details" onClick={() => setSelectedRec(null)}>
                <IcClose />
              </button>
            </div>

            {activeTab === 'transcription' ? (
              <div className="atp-transcript detail-transcript-box" ref={transcriptBoxRef}>
                {(!reportEntry || reportEntry.status === 'loading') && (
                  <div className="detail-transcript-empty">Loading transcript…</div>
                )}
                {reportEntry?.status === 'error' && (
                  <div className="detail-transcript-empty">Couldn't load transcript.</div>
                )}
                {reportEntry?.status === 'ready' && reportEntry.segments.length === 0 && (
                  <div className="detail-transcript-empty">No transcript available yet.</div>
                )}
                {reportEntry?.status === 'ready' && reportEntry.segments.map((seg, i) => (
                  <div
                    key={seg.id ?? i}
                    ref={el => { segRefs.current[i] = el; }}
                    className={`atp-seg${i === activeSegIdx ? ' atp-seg-active' : ''}`}
                  >
                    <span className="atp-speaker" style={{ color: SPEAKER_COLOR[seg.speaker] || 'var(--muted)' }}>
                      {seg.speaker}
                    </span>
                    <span className="atp-seg-time">{fmt(seg.start)}</span>
                    <p className="atp-seg-text">{seg.text}</p>
                  </div>
                ))}
                {reportEntry?.status === 'ready' && reportEntry.segments.length > 0 && !isSelPlaying && (
                  <div className="detail-transcript-hint">Press play to follow along in real time.</div>
                )}
              </div>
            ) : activeTab === 'scorecard' ? (
              <div className="detail-tab-body">
                {(!reportEntry || reportEntry.status === 'loading') && (
                  <div className="detail-transcript-empty">Loading scorecard…</div>
                )}
                {reportEntry?.status === 'error' && (
                  <div className="detail-transcript-empty">Couldn't load the scorecard.</div>
                )}
                {reportEntry?.status === 'ready' && !reportEntry.analysis && (
                  <div className="detail-transcript-empty">No analysis available yet.</div>
                )}
                {reportEntry?.status === 'ready' && reportEntry.analysis && (
                  <>
                    <div className="cr-section cr-section-sm">
                      <div className="cr-kv-row">
                        <span className="cr-kv-label">Sentiment</span>
                        <span className="cr-kv-val" style={{ color: ANALYSIS_SENT[reportEntry.analysis.sentiment]?.hex || 'var(--muted)' }}>
                          <span className="s-dot" style={{ background: ANALYSIS_SENT[reportEntry.analysis.sentiment]?.hex || 'var(--muted)' }} />
                          {ANALYSIS_SENT[reportEntry.analysis.sentiment]?.label || reportEntry.analysis.sentiment}
                        </span>
                      </div>
                      <div className="cr-kv-row">
                        <span className="cr-kv-label">Outcome</span>
                        <span className="cr-kv-val cr-outcome">{(reportEntry.analysis.outcome || '–').replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    {reportEntry.analysis.criteriaScores?.length > 0 && (
                      <div className="cr-section">
                        <h2 className="cr-section-title">QA Scorecard</h2>
                        <div className="cr-criteria">
                          {reportEntry.analysis.criteriaScores.map(c => (
                            <div key={c.criterionId} className="cr-criterion">
                              <div className="cr-crit-head">
                                <span className="cr-crit-name">{c.name}</span>
                                <span className="cr-crit-score">{c.score}<span style={{ color: 'var(--faint)' }}>/{c.maxScore}</span></span>
                              </div>
                              <div className="cr-crit-bar">
                                <div className="cr-crit-fill" style={{
                                  width: `${c.pct}%`,
                                  background: c.pct >= 75 ? 'var(--pos)' : c.pct >= 50 ? 'var(--risk)' : 'var(--crit)'
                                }} />
                              </div>
                              {c.notes && <p className="cr-crit-notes">{c.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : activeTab === 'summary' ? (
              <div className="detail-tab-body">
                {(!reportEntry || reportEntry.status === 'loading') && (
                  <div className="detail-transcript-empty">Loading summary…</div>
                )}
                {reportEntry?.status === 'error' && (
                  <div className="detail-transcript-empty">Couldn't load the summary.</div>
                )}
                {reportEntry?.status === 'ready' && !reportEntry.analysis && (
                  <div className="detail-transcript-empty">No analysis available yet.</div>
                )}
                {reportEntry?.status === 'ready' && reportEntry.analysis && (
                  <>
                    {reportEntry.analysis.summary && (
                      <div className="cr-section">
                        <h2 className="cr-section-title">Summary</h2>
                        <p className="cr-summary">{reportEntry.analysis.summary}</p>
                      </div>
                    )}
                    <div className="cr-section">
                      <h2 className="cr-section-title">Findings</h2>
                      {reportEntry.analysis.strengths?.length > 0 && (
                        <div className="cr-findings-group">
                          <div className="cr-findings-label cr-findings-pos">Strengths</div>
                          {reportEntry.analysis.strengths.map((s, i) => (
                            <div key={i} className="cr-finding cr-finding-pos">{s}</div>
                          ))}
                        </div>
                      )}
                      {reportEntry.analysis.improvements?.length > 0 && (
                        <div className="cr-findings-group">
                          <div className="cr-findings-label cr-findings-risk">Improvements</div>
                          {reportEntry.analysis.improvements.map((s, i) => (
                            <div key={i} className="cr-finding cr-finding-risk">{s}</div>
                          ))}
                        </div>
                      )}
                      {reportEntry.analysis.errors?.length > 0 && (
                        <div className="cr-findings-group">
                          <div className="cr-findings-label cr-findings-crit">Errors</div>
                          {reportEntry.analysis.errors.map((s, i) => (
                            <div key={i} className="cr-finding cr-finding-crit">{s}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
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
                    onClick={() => navigate(`/calls/${sel.id}/report`)}>
                    <IcDetails />
                    View Full Report
                  </button>
                  <button className="detail-btn detail-btn-ghost"
                    onClick={() => onPlay?.(sel)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M8 5v14l11-7z"/></svg>
                    {currentTrack?.id === sel.id && playing ? 'Pause' : 'Play'}
                  </button>
                  <button className="detail-btn detail-btn-ghost" onClick={() => setSelectedRec(null)}>
                    Close panel
                  </button>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
