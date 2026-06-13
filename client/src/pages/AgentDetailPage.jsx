import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";

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
function sentColor(s) {
  return { crit: "var(--crit)", risk: "var(--risk)", neu: "var(--brand-2)", pos: "var(--pos)" }[s] || "var(--faint)";
}
function fmtDur(sec) {
  if (!sec) return "–";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function fmt(score) {
  if (score == null) return "–";
  return Math.round(score);
}

/* Inline SVG sparkline for last N scores */
function Sparkline({ scores }) {
  if (!scores?.length) return null;
  const h = 40, w = 140, pad = 4;
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = max - min || 100;
  const pts = scores.map((v, i) => {
    const x = pad + ((i / Math.max(scores.length - 1, 1)) * (w - pad * 2));
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = scores[scores.length - 1];
  const lastX = scores.length > 1 ? (pad + ((scores.length - 1) / (scores.length - 1)) * (w - pad * 2)) : w - pad;
  const lastY = h - pad - ((last - min) / range) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, overflow: "visible" }}>
      <polyline fill="none" stroke="var(--brand)" strokeWidth="2" points={pts} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="4" fill="var(--brand)" />
    </svg>
  );
}

export default function AgentDetailPage() {
  const { name } = useParams();
  const navigate  = useNavigate();
  const agentName = decodeURIComponent(name);
  const color     = agentColor(agentName);

  const [data, setData]     = useState(null);
  const [coaching, setCoaching] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("calls"); // calls | criteria | coaching

  useEffect(() => {
    Promise.all([
      api.getAgentDetail(agentName),
      api.getCoachingFeed(agentName).catch(() => ({ items: [] })),
    ]).then(([detail, feed]) => {
      setData(detail.agent);
      setCoaching(feed.items || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agentName]);

  if (loading) return <div className="cr-loading"><div className="cr-spinner" />Loading agent…</div>;
  if (!data) return (
    <div className="cr-loading">
      <div>Agent not found. <button style={{ color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }} onClick={() => navigate("/agents")}>Back to leaderboard</button></div>
    </div>
  );

  const scores = (data.recentCalls || []).map(c => c.overallScore).filter(s => s != null).reverse();
  const posCount = (data.recentCalls || []).filter(c => c.sentiment === "pos").length;

  return (
    <>
      {/* Header */}
      <section style={{ padding: "28px 30px 20px" }}>
        <button className="cr-back" onClick={() => navigate("/agents")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16"><path d="m15 18-6-6 6-6"/></svg>
          Leaderboard
        </button>

        <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
          <div style={{ width: 60, height: 60, background: color, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 22, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {agentInit(agentName)}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "clamp(18px,2.4vw,28px)", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, marginBottom: 6 }}>{agentName}</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="cr-meta-chip">{data.callCount} calls</span>
              {data.avgScore != null && <span className="cr-meta-chip">Avg score {Math.round(data.avgScore)}</span>}
              {data.lastCallAt && <span className="cr-meta-chip">Last call {new Date(data.lastCallAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
            </div>
          </div>

          {/* Sparkline */}
          {scores.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Score trend</div>
              <Sparkline scores={scores} />
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="pipeline" style={{ marginTop: 22 }}>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(139,124,255,.15)", color: "var(--brand)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div><div className="pipe-num">{fmt(data.avgScore)}</div><div className="pipe-lbl">Avg score</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(55,211,153,.15)", color: "var(--pos)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div><div className="pipe-num">{fmt(data.bestScore)}</div><div className="pipe-lbl">Best score</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(255,107,107,.14)", color: "var(--crit)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4M12 16h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            </div>
            <div><div className="pipe-num">{fmt(data.worstScore)}</div><div className="pipe-lbl">Worst score</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(55,211,153,.15)", color: "var(--pos)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9 9z"/></svg>
            </div>
            <div>
              <div className="pipe-num">{data.callCount ? Math.round((posCount / Math.min(data.recentCalls?.length || 1, 20)) * 100) : 0}%</div>
              <div className="pipe-lbl">Positive (last 20)</div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--line)", padding: "0 30px", display: "flex", gap: 4 }}>
        {["calls", "criteria", "coaching"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "10px 16px",
            fontSize: 13, fontWeight: 600, textTransform: "capitalize",
            color: tab === t ? "var(--brand)" : "var(--muted)",
            borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent",
            marginBottom: -1,
          }}>{t === "criteria" ? "Criterion breakdown" : t === "coaching" ? `Coaching (${coaching.length})` : "Recent calls"}</button>
        ))}
      </div>

      {/* Recent calls */}
      {tab === "calls" && (
        <section className="sec">
          {(!data.recentCalls?.length) ? (
            <div className="empty">No call history yet.</div>
          ) : (
            <div className="lb-table">
              <div className="lb-head" style={{ gridTemplateColumns: "2fr 80px 80px 100px 80px" }}>
                <div>Call</div>
                <div>Score</div>
                <div>Sentiment</div>
                <div>Outcome</div>
                <div>Duration</div>
              </div>
              {data.recentCalls.map((call, i) => (
                <div key={call.id || i} className="lb-row" style={{ gridTemplateColumns: "2fr 80px 80px 100px 80px", cursor: call.id ? "pointer" : "default" }}
                  onClick={() => call.id && navigate(`/calls/${call.id}/report`)}>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 500 }}>{call.filename || `Call ${call.id}`}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                      {call.callDatetime ? new Date(call.callDatetime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–"}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: call.overallScore >= 80 ? "var(--pos)" : call.overallScore >= 60 ? "var(--risk)" : "var(--crit)" }}>
                    {call.overallScore != null ? Math.round(call.overallScore) : "–"}
                  </div>
                  <div>
                    {call.sentiment && (
                      <span className="lb-badge" style={{ color: sentColor(call.sentiment), background: "rgba(255,255,255,.06)", fontSize: 11 }}>
                        {call.sentiment}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{call.outcome || "–"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDur(call.durationSec)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Criterion breakdown */}
      {tab === "criteria" && (
        <section className="sec">
          <div className="sec-head" style={{ marginBottom: 16 }}>
            <div>
              <h2>Criterion averages</h2>
              <div className="sec-sub">Sorted weakest-first — prioritise coaching from the top.</div>
            </div>
          </div>
          {(!data.criteriaStats?.length) ? (
            <div className="empty">No analysis data yet — run the pipeline on some calls first.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {data.criteriaStats.map(c => {
                const pct = c.avgPct ?? 0;
                const col = pct >= 80 ? "var(--pos)" : pct >= 60 ? "var(--risk)" : "var(--crit)";
                return (
                  <div key={c.criterionId} className="cr-criterion">
                    <div className="cr-crit-label">{c.name}</div>
                    <div className="cr-crit-bar" style={{ flex: 1 }}>
                      <div className="cr-crit-fill" style={{ width: `${pct}%`, background: col }} />
                    </div>
                    <div style={{ width: 44, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: col }}>
                      {pct.toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Coaching tab */}
      {tab === "coaching" && (
        <section className="sec">
          {coaching.length === 0 ? (
            <div className="empty">No coaching items generated yet. Run the pipeline to build coaching data.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {coaching.map((item, i) => (
                <div key={i} className={`cr-coaching-item cr-coaching-${item.type}`} style={{ borderRadius: 8, padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", opacity: .7 }}>{item.type}</span>
                  <p style={{ margin: "4px 0 0", fontSize: 14 }}>{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="pad-bottom" />
    </>
  );
}
