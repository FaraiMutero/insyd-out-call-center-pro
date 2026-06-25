import { useEffect, useRef, useState } from "react";

const COLORS = { AGENT: "var(--brand)", CUSTOMER: "var(--pos)" };
const EQ_BAR_COUNT = 20;
const EQ_BAR_COLORS = ["#8B7CFF", "#5B8DEF"];

function fmt(s) {
  if (!s && s !== 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function AudioTranscriptPlayer({ streamUrl, segments = [], durationSec = 0, autoPlay = false, transportPosition = "top" }) {
  const audioRef  = useRef(null);
  const barRef    = useRef(null);
  const segRefs   = useRef({});
  const autoplayedRef = useRef(false);
  const eqCanvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef  = useRef(null);
  const sourceRef    = useRef(null);
  const eqFrameRef   = useRef(null);
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

  // Autoplay once when arriving with explicit intent (e.g. selected from the library).
  // Deliberately does NOT call startPlayback()/ensureEqualizerGraph() here: browsers
  // block AudioContext.resume() outside a direct user gesture, and since
  // createMediaElementSource() permanently reroutes the element's output through the
  // Web Audio graph, a suspended context would make autoplay silent even though the
  // <audio> element itself reports "playing". The equalizer instead activates lazily
  // on the first real click (play/pause button or a transcript segment).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !streamUrl || !autoPlay || autoplayedRef.current) return;
    autoplayedRef.current = true;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  }, [streamUrl, autoPlay]);

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

  // The Web Audio analyser graph (for the live equalizer) can only be built once per
  // <audio> element — a MediaElementSourceNode may never be created twice for the same
  // element, and AudioContext must be resumed from a user gesture (hence built lazily
  // on first playback rather than on mount).
  function ensureEqualizerGraph() {
    const audio = audioRef.current;
    if (!audio || sourceRef.current) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch {
      // Web Audio unsupported / blocked — playback still works, equalizer just stays flat.
    }
  }

  function startPlayback() {
    const audio = audioRef.current;
    if (!audio) return Promise.resolve();
    ensureEqualizerGraph();
    audioCtxRef.current?.resume();
    return audio.play().then(() => setPlaying(true)).catch(() => {});
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else         { startPlayback(); }
  }

  function seekToSegment(seg) {
    const audio = audioRef.current;
    if (!audio || !streamUrl) return;
    audio.currentTime = seg.start;
    startPlayback();
  }

  // Draw the live equalizer while playing; stops and clears the canvas otherwise.
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");

    function clear() {
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (!playing || !analyserRef.current) {
      clear();
      return;
    }

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const barCount = Math.min(EQ_BAR_COUNT, data.length);
    const gap = 2;
    const barWidth = (canvas.width - gap * (barCount - 1)) / barCount;

    function tick() {
      analyser.getByteFrequencyData(data);
      clear();
      for (let i = 0; i < barCount; i++) {
        const level = data[i] / 255;
        const barHeight = Math.max(2, level * canvas.height);
        ctx2d.fillStyle = EQ_BAR_COLORS[i % EQ_BAR_COLORS.length];
        ctx2d.fillRect(i * (barWidth + gap), canvas.height - barHeight, barWidth, barHeight);
      }
      eqFrameRef.current = requestAnimationFrame(tick);
    }
    eqFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (eqFrameRef.current) cancelAnimationFrame(eqFrameRef.current);
      clear();
    };
  }, [playing]);

  // Tear down the audio graph only when the player itself unmounts. The <audio> element
  // persists across streamUrl changes (same node, src just gets swapped), and a media
  // element can never be bound to a second MediaElementSourceNode — so the graph built
  // by ensureEqualizerGraph() must survive track changes and is reused for every track.
  useEffect(() => {
    return () => {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

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

  const transport = (
    <div className="atp-transport">
      <button className="atp-play-btn" onClick={togglePlay} disabled={!streamUrl}>
        {playing
          ? <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          : <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5v14l11-7z"/></svg>
        }
      </button>

      <canvas ref={eqCanvasRef} className="atp-eq" width={64} height={32} title="Live equalizer" />

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
  );

  const transcript = segments.length > 0 && (
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
  );

  return (
    <div className="atp">
      {streamUrl && (
        <audio ref={audioRef} src={streamUrl} preload="metadata" style={{ display: "none" }} />
      )}
      {transportPosition === "bottom" ? <>{transcript}{transport}</> : <>{transport}{transcript}</>}
    </div>
  );
}
