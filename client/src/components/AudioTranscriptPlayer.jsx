import { useEffect, useRef, useState } from "react";

const COLORS = { AGENT: "var(--brand)", CUSTOMER: "var(--pos)" };

function fmt(s) {
  if (!s && s !== 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function AudioTranscriptPlayer({ streamUrl, segments = [], durationSec = 0 }) {
  const audioRef  = useRef(null);
  const barRef    = useRef(null);
  const segRefs   = useRef({});
  const [playing, setPlaying]     = useState(false);
  const [pos, setPos]             = useState(0);
  const [dur, setDur]             = useState(durationSec || 0);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [volume, setVolume]       = useState(0.8);

  // Sync duration from audio element when available
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDur(audio.duration || durationSec);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => audio.removeEventListener("loadedmetadata", onMeta);
  }, [streamUrl]);

  // Update position + active segment on timeupdate
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const t = audio.currentTime;
      setPos(t);
      const idx = segments.findLastIndex(s => t >= s.start);
      if (idx !== activeIdx) {
        setActiveIdx(idx);
        segRefs.current[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };
    const onEnd = () => { setPlaying(false); setActiveIdx(-1); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [segments, activeIdx]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else         { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  }

  function seekToSegment(seg) {
    const audio = audioRef.current;
    if (!audio || !streamUrl) return;
    audio.currentTime = seg.start;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  }

  function seekBar(e) {
    const audio = audioRef.current;
    if (!audio || !dur) return;
    const r = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    audio.currentTime = pct * dur;
    setPos(pct * dur);
  }

  function onVolumeChange(e) {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  const pct = dur ? (pos / dur) * 100 : 0;

  return (
    <div className="atp">
      {streamUrl && (
        <audio ref={audioRef} src={streamUrl} preload="metadata" style={{ display: "none" }} />
      )}

      {/* Transport bar */}
      <div className="atp-transport">
        <button className="atp-play-btn" onClick={togglePlay} disabled={!streamUrl}>
          {playing
            ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
          }
        </button>

        <span className="atp-time">{fmt(pos)}</span>

        <div className="atp-bar" ref={barRef} onClick={seekBar}>
          <div className="atp-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <span className="atp-time atp-time-end">{fmt(dur)}</span>

        <div className="atp-vol">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ color: "var(--muted)", flexShrink: 0 }}>
            <path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>
          </svg>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={onVolumeChange}
            style={{ width: 72, accentColor: "var(--brand)" }} />
        </div>

        {!streamUrl && (
          <span style={{ fontSize: 12, color: "var(--faint)", marginLeft: 8 }}>No audio file</span>
        )}
      </div>

      {/* Transcript */}
      {segments.length > 0 && (
        <div className="atp-transcript">
          {segments.map((seg, i) => (
            <div
              key={seg.id ?? i}
              ref={el => { segRefs.current[i] = el; }}
              className={`atp-seg${i === activeIdx ? " atp-seg-active" : ""} atp-seg-${seg.speaker?.toLowerCase()}`}
              onClick={() => seekToSegment(seg)}
              title={`${seg.speaker} · ${fmt(seg.start)}–${fmt(seg.end)}`}
            >
              <span className="atp-speaker"
                style={{ color: COLORS[seg.speaker] || "var(--muted)" }}>
                {seg.speaker}
              </span>
              <span className="atp-seg-time">{fmt(seg.start)}</span>
              <p className="atp-seg-text">{seg.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
