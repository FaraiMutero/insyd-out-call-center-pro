import { useEffect, useMemo, useRef, useState } from "react";
import { api, getAccessToken } from "../api/client.js";
import AudioTranscriptPlayer from "../components/AudioTranscriptPlayer.jsx";

const PIPELINE_STEPS = ["uploaded", "converting", "ready_for_transcription", "transcribing", "analyzing"];
const STEP_LABEL = {
  uploaded: "Uploaded",
  converting: "Converting",
  ready_for_transcription: "Ready",
  transcribing: "Transcribing",
  analyzing: "Analysing",
};
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 80; // ~2 minutes

const COLORS = ["#7C6CFF", "#5B8DEF", "#37D399", "#F4B740", "#FF6B6B", "#C084FC"];
function agentColor(name) {
  if (!name) return "#5E667C";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}
function agentInit(name) {
  if (!name) return "?";
  const p = name.trim().split(" ");
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function statusPill(status) {
  const map = {
    uploaded:               { bg: "rgba(244,183,64,.15)",  color: "var(--risk)", dot: "#F4B740", label: "Uploaded" },
    converting:             { bg: "rgba(111,168,255,.15)", color: "var(--neu)",  dot: "#6FA8FF", label: "Converting" },
    ready_for_transcription:{ bg: "rgba(55,211,153,.15)",  color: "var(--pos)",  dot: "#37D399", label: "Ready" },
    transcribing:           { bg: "rgba(139,124,255,.15)", color: "var(--brand)",dot: "#8B7CFF", label: "Transcribing" },
    analyzing:              { bg: "rgba(139,124,255,.15)", color: "var(--brand)",dot: "#8B7CFF", label: "Analysing" },
    complete:               { bg: "rgba(55,211,153,.15)",  color: "var(--pos)",  dot: "#37D399", label: "Complete" },
    failed:                 { bg: "rgba(255,107,107,.15)", color: "var(--crit)", dot: "#FF6B6B", label: "Failed" },
  };
  const s = map[status] || { bg: "rgba(255,255,255,.06)", color: "var(--muted)", dot: "#5E667C", label: status || "Unknown" };
  return (
    <span className="detail-status-pill" style={{ background: s.bg, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

export default function RecordingsPage({ recordings = [], onRefresh, onStatus }) {
  const [form, setForm] = useState({
    originalFilename: "",
    agentName: "",
    direction: "inbound",
    callDatetime: "",
    audioFile: null
  });

  // Drives the "Upload Progress" card: null = no upload in flight (card hidden).
  // { phase: 'uploading'|'processing'|'ready'|'failed', uploadPct, recording, segments, error }
  const [activeUpload, setActiveUpload] = useState(null);
  const uploadTokenRef = useRef(0);
  const pollTimerRef = useRef(null);

  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  const counts = useMemo(() => ({
    total: recordings.length,
    uploaded: recordings.filter(r => r.status === "uploaded").length,
    processing: recordings.filter(r => ["converting", "ready_for_transcription", "transcribing", "analyzing"].includes(r.status)).length,
    complete: recordings.filter(r => r.status === "complete").length,
    failed: recordings.filter(r => r.status === "failed").length,
  }), [recordings]);

  function pollReport(id, myToken, attempt) {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (attempt > POLL_MAX_ATTEMPTS) {
      setActiveUpload(u => u && { ...u, phase: "failed", error: "Processing is taking longer than expected." });
      return;
    }
    pollTimerRef.current = setTimeout(async () => {
      if (uploadTokenRef.current !== myToken) return;
      try {
        const data = await api.getCallReport(id);
        if (uploadTokenRef.current !== myToken) return;
        const segments = data.transcript?.segments || [];
        const status = data.recording.status;
        if (segments.length > 0 || status === "complete") {
          setActiveUpload({ phase: "ready", recording: data.recording, segments, error: null });
          onRefresh?.();
          return;
        }
        if (status === "failed") {
          setActiveUpload({ phase: "failed", recording: data.recording, segments: [], error: data.recording.error || "Processing failed." });
          onRefresh?.();
          return;
        }
        setActiveUpload(u => u && { ...u, recording: data.recording });
        pollReport(id, myToken, attempt + 1);
      } catch {
        pollReport(id, myToken, attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.audioFile) {
      setActiveUpload({ phase: "failed", recording: null, segments: [], error: "Please choose an audio file" });
      return;
    }

    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const myToken = ++uploadTokenRef.current;
    setActiveUpload({ phase: "uploading", uploadPct: 0, recording: null, segments: [], error: null });

    const formData = new FormData();
    formData.append("audio", form.audioFile);
    formData.append("originalFilename", form.originalFilename || form.audioFile.name);
    formData.append("agentName", form.agentName || "");
    formData.append("direction", form.direction || "");
    formData.append("callDatetime", form.callDatetime || "");

    try {
      const data = await api.uploadRecordingWithProgress(formData, pct => {
        if (uploadTokenRef.current !== myToken) return;
        setActiveUpload(u => u && { ...u, uploadPct: pct });
      });
      if (uploadTokenRef.current !== myToken) return;

      setForm({ originalFilename: "", agentName: "", direction: "inbound", callDatetime: "", audioFile: null });
      setActiveUpload({ phase: "processing", uploadPct: 100, recording: data.recording, segments: [], error: null });
      onRefresh?.();
      pollReport(data.recording.id, myToken, 0);
    } catch (err) {
      if (uploadTokenRef.current !== myToken) return;
      setActiveUpload({ phase: "failed", recording: null, segments: [], error: err.message });
    }
  }

  async function handleDelete(id, filename) {
    if (!window.confirm(`Delete "${filename}"? This removes it from listings and reports.`)) return;
    try {
      await api.deleteRecording(id);
      onRefresh?.();
    } catch (err) {
      window.alert(err.message || "Failed to delete recording");
    }
  }

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="eyebrow">Call Intake</div>
        <h1>Recording <span className="accent">Pipeline</span></h1>
        <p>Import call audio and track it through conversion, transcription, and AI analysis.</p>

        <div className="pipeline">
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(139,124,255,.16)", color: "var(--brand)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div><div className="pipe-num">{counts.total}</div><div className="pipe-lbl">Total recordings</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(244,183,64,.16)", color: "var(--risk)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>
            </div>
            <div><div className="pipe-num">{counts.uploaded}</div><div className="pipe-lbl">Awaiting pipeline</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(91,141,239,.16)", color: "var(--brand-2)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div><div className="pipe-num">{counts.processing}</div><div className="pipe-lbl">In progress</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(55,211,153,.16)", color: "var(--pos)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div><div className="pipe-num">{counts.complete}</div><div className="pipe-lbl">Complete</div></div>
          </div>
        </div>
      </section>

      {/* ── Import form ── */}
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>Import a recording</h2>
            <div className="sec-sub">Upload a call file to start the transcription &amp; scoring pipeline.</div>
          </div>
        </div>
        <div className={activeUpload ? "sops-split" : ""}>
          <div className="content-card" style={activeUpload ? undefined : { maxWidth: "50%" }}>
            <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <label>
                Audio file
                <input
                  type="file"
                  accept=".wav,.mp3,.m4a,.ogg,.opus,.wma,.amr"
                  onChange={(e) => setForm({ ...form, audioFile: e.target.files?.[0] || null })}
                  required
                />
              </label>
              <label>
                Display filename
                <input
                  value={form.originalFilename}
                  onChange={(e) => setForm({ ...form, originalFilename: e.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label>
                Agent name
                <input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                />
              </label>
              <label>
                Direction
                <select
                  value={form.direction}
                  onChange={(e) => setForm({ ...form, direction: e.target.value })}
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </label>
              <label>
                Call date/time
                <input
                  type="datetime-local"
                  value={form.callDatetime}
                  onChange={(e) => setForm({ ...form, callDatetime: e.target.value })}
                />
              </label>
              <button className="btn btn-primary" style={{ justifySelf: "start" }}>Import recording</button>
            </form>
          </div>

          {activeUpload && (
            <div className="content-card upload-progress-card">
              <div className="card-head">
                <h3>Upload Progress</h3>
                {activeUpload.recording && statusPill(activeUpload.recording.status)}
              </div>

              {activeUpload.phase === "uploading" && (
                <div className="upload-stage">
                  <div className="upload-stage-label">Uploading file…</div>
                  <div className="cr-crit-bar">
                    <div className="cr-crit-fill" style={{ width: `${activeUpload.uploadPct}%`, background: "var(--brand)" }} />
                  </div>
                  <div className="upload-stage-pct">{activeUpload.uploadPct}%</div>
                </div>
              )}

              {activeUpload.phase === "processing" && (
                <div className="upload-stage">
                  <div className="upload-stage-label" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="cr-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    {STEP_LABEL[activeUpload.recording?.status] || "Processing…"}
                  </div>
                  <div className="upload-steps">
                    {PIPELINE_STEPS.map(step => {
                      const curIdx = PIPELINE_STEPS.indexOf(activeUpload.recording?.status);
                      const stepIdx = PIPELINE_STEPS.indexOf(step);
                      const state = stepIdx < curIdx ? "done" : stepIdx === curIdx ? "active" : "";
                      return (
                        <div key={step} className={`upload-step${state ? ` ${state}` : ""}`}>
                          {STEP_LABEL[step]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeUpload.phase === "failed" && (
                <div className="empty">
                  <strong>Something went wrong.</strong>
                  {activeUpload.error}
                </div>
              )}

              {activeUpload.phase === "ready" && (
                <AudioTranscriptPlayer
                  streamUrl={`/api/recordings/${activeUpload.recording.id}/stream?token=${encodeURIComponent(getAccessToken())}`}
                  segments={activeUpload.segments}
                  durationSec={activeUpload.recording.durationSec || 0}
                  transportPosition="bottom"
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Pipeline status table ── */}
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>Pipeline status</h2>
            <div className="sec-sub">Every imported call and where it sits in processing.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={api.exportRecordingsCSVUrl()} download className="btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>
              Export CSV
            </a>
            <button className="btn btn-primary" onClick={onRefresh}>Refresh</button>
          </div>
        </div>

        {!recordings.length ? (
          <div className="empty"><strong>No recordings imported yet.</strong>Import a call above to get started.</div>
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Recording</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Stored</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recordings.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontWeight: 500 }}>{entry.originalFilename}</td>
                    <td>
                      {entry.agentName ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="mini-av" style={{ width: 24, height: 24, fontSize: 9, background: agentColor(entry.agentName) }}>{agentInit(entry.agentName)}</span>
                          {entry.agentName}
                        </span>
                      ) : <span style={{ color: "var(--faint)" }}>—</span>}
                    </td>
                    <td>{statusPill(entry.status)}</td>
                    <td>{entry.storedPath
                      ? <span className="lb-badge" style={{ color: "var(--pos)", background: "rgba(55,211,153,.1)" }}>Yes</span>
                      : <span className="lb-badge" style={{ color: "var(--muted)", background: "rgba(255,255,255,.06)" }}>No</span>}
                    </td>
                    <td className="actions">
                      <button className="btn btn-xs" onClick={() => onStatus(entry.id, "uploaded")}>Set Uploaded</button>
                      <button className="btn btn-xs" onClick={() => onStatus(entry.id, "ready_for_transcription")}>Set Ready</button>
                      <button className="btn btn-xs btn-danger" onClick={() => onStatus(entry.id, "failed")}>Set Failed</button>
                      <button className="btn btn-xs btn-danger" onClick={() => handleDelete(entry.id, entry.originalFilename)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pad-bottom" />
      </section>
    </>
  );
}
