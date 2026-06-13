import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import AudioTranscriptPlayer from "../components/AudioTranscriptPlayer.jsx";

const SENT_COLOR = { positive: "var(--pos)", neutral: "var(--neu)", negative: "var(--crit)", mixed: "var(--risk)" };
const SENT_LABEL = { positive: "Positive", neutral: "Neutral", negative: "Negative", mixed: "Mixed" };

function fmt(s) {
  if (!s && s !== 0) return "–";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function ScoreRing({ score, max = 100, color = "var(--pos)", size = 64 }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="cr-score-ring" style={{ "--p": pct, "--c": color, width: size, height: size }}>
      <span className="cr-score-val">{Math.round(score)}</span>
    </div>
  );
}

export default function CallReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.getCallReport(Number(id))
      .then(data => { setReport(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="cr-loading">
      <div className="cr-spinner" />
      Loading call report…
    </div>
  );

  if (error) return (
    <div className="empty" style={{ paddingTop: 80 }}>
      <strong>Could not load report</strong>{error}
    </div>
  );

  const { recording, transcript, analysis, coaching } = report;
  const sentColor = analysis ? SENT_COLOR[analysis.sentiment] || "var(--muted)" : "var(--muted)";
  const accessToken = localStorage.getItem("accessToken") || "";
  const streamUrl = recording.storedPath
    ? `/api/recordings/${recording.id}/stream?token=${encodeURIComponent(accessToken)}`
    : null;

  return (
    <div className="cr-shell">
      {/* ── Header ── */}
      <div className="cr-header">
        <button className="cr-back" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <div className="cr-header-info">
          <h1 className="cr-title">{recording.originalFilename?.replace(/\.(wav|mp3|m4a)$/i, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</h1>
          <div className="cr-meta-row">
            {recording.agentName && <span className="cr-meta-chip">{recording.agentName}</span>}
            {recording.direction && <span className="cr-meta-chip">{recording.direction}</span>}
            {recording.callDatetime && (
              <span className="cr-meta-chip">
                {new Date(recording.callDatetime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {recording.durationSec && <span className="cr-meta-chip">{fmt(recording.durationSec)}</span>}
            {recording.isSeed && <span className="cr-meta-chip cr-meta-demo">Demo</span>}
          </div>
        </div>
        {analysis && (
          <ScoreRing
            score={analysis.overallScore}
            color={analysis.overallScore >= 75 ? "var(--pos)" : analysis.overallScore >= 55 ? "var(--risk)" : "var(--crit)"}
            size={72}
          />
        )}
      </div>

      <div className="cr-body">
        {/* ── Left: audio + transcript ── */}
        <div className="cr-main">
          <div className="cr-section">
            <h2 className="cr-section-title">Recording</h2>
            <AudioTranscriptPlayer
              streamUrl={streamUrl}
              segments={transcript?.segments || []}
              durationSec={recording.durationSec || 0}
            />
          </div>
        </div>

        {/* ── Right: scorecard + coaching ── */}
        <aside className="cr-aside">
          {/* Sentiment + outcome */}
          {analysis && (
            <div className="cr-section cr-section-sm">
              <div className="cr-kv-row">
                <span className="cr-kv-label">Sentiment</span>
                <span className="cr-kv-val" style={{ color: sentColor }}>
                  <span className="s-dot" style={{ background: sentColor }} />
                  {SENT_LABEL[analysis.sentiment] || analysis.sentiment}
                </span>
              </div>
              <div className="cr-kv-row">
                <span className="cr-kv-label">Outcome</span>
                <span className="cr-kv-val cr-outcome">{(analysis.outcome || "–").replace(/_/g, " ")}</span>
              </div>
            </div>
          )}

          {/* Rubric criteria scores */}
          {analysis?.criteriaScores?.length > 0 && (
            <div className="cr-section">
              <h2 className="cr-section-title">QA Scorecard</h2>
              <div className="cr-criteria">
                {analysis.criteriaScores.map(c => (
                  <div key={c.criterionId} className="cr-criterion">
                    <div className="cr-crit-head">
                      <span className="cr-crit-name">{c.name}</span>
                      <span className="cr-crit-score">{c.score}<span style={{ color: "var(--faint)" }}>/{c.maxScore}</span></span>
                    </div>
                    <div className="cr-crit-bar">
                      <div className="cr-crit-fill" style={{
                        width: `${c.pct}%`,
                        background: c.pct >= 75 ? "var(--pos)" : c.pct >= 50 ? "var(--risk)" : "var(--crit)"
                      }} />
                    </div>
                    {c.notes && <p className="cr-crit-notes">{c.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis summary */}
          {analysis?.summary && (
            <div className="cr-section">
              <h2 className="cr-section-title">Summary</h2>
              <p className="cr-summary">{analysis.summary}</p>
            </div>
          )}

          {/* Strengths / improvements / errors */}
          {analysis && (
            <div className="cr-section">
              <h2 className="cr-section-title">Findings</h2>
              {analysis.strengths?.length > 0 && (
                <div className="cr-findings-group">
                  <div className="cr-findings-label cr-findings-pos">Strengths</div>
                  {analysis.strengths.map((s, i) => (
                    <div key={i} className="cr-finding cr-finding-pos">{s}</div>
                  ))}
                </div>
              )}
              {analysis.improvements?.length > 0 && (
                <div className="cr-findings-group">
                  <div className="cr-findings-label cr-findings-risk">Improvements</div>
                  {analysis.improvements.map((s, i) => (
                    <div key={i} className="cr-finding cr-finding-risk">{s}</div>
                  ))}
                </div>
              )}
              {analysis.errors?.length > 0 && (
                <div className="cr-findings-group">
                  <div className="cr-findings-label cr-findings-crit">Errors</div>
                  {analysis.errors.map((s, i) => (
                    <div key={i} className="cr-finding cr-finding-crit">{s}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent coaching feed */}
          {coaching?.length > 0 && (
            <div className="cr-section">
              <h2 className="cr-section-title">Agent coaching</h2>
              {coaching.map((item, i) => (
                <div key={i} className={`cr-coaching-item cr-coaching-${item.type}`}>
                  <span className="cr-coaching-badge">{item.type}</span>
                  {item.content}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <div className="pad-bottom" />
    </div>
  );
}
