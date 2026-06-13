import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
function scoreColor(s) {
  if (s == null) return "var(--faint)";
  if (s >= 80) return "var(--pos)";
  if (s >= 60) return "var(--risk)";
  return "var(--crit)";
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [tip, setTip]         = useState(null);
  const [orgStats, setOrg]    = useState(null);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    Promise.all([
      api.getLeaderboard(),
      api.getTipOfDay(),
      api.getOrgStats(),
    ]).then(([lb, tipRes, orgRes]) => {
      setAgents(lb.agents);
      setTip(tipRes.tip);
      setOrg(orgRes.stats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const visible = agents.filter(a =>
    !search || a.agentName?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="cr-loading"><div className="cr-spinner" />Loading agents…</div>;

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="eyebrow">Performance & Coaching</div>
        <h1>Agent <span className="accent">Leaderboard</span></h1>
        <p>QA scores, outcomes, and coaching insights — ranked by average call score.</p>

        {orgStats && (
          <div className="pipeline">
            <div className="pipe">
              <div className="pipe-ic" style={{ background: "rgba(139,124,255,.16)", color: "var(--brand)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div><div className="pipe-num">{agents.length}</div><div className="pipe-lbl">Agents tracked</div></div>
            </div>
            <div className="pipe">
              <div className="pipe-ic" style={{ background: "rgba(55,211,153,.16)", color: "var(--pos)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <div><div className="pipe-num">{orgStats.analysed_count || 0}</div><div className="pipe-lbl">Calls analysed</div></div>
            </div>
            <div className="pipe">
              <div className="pipe-ic" style={{ background: "rgba(91,141,239,.16)", color: "var(--brand-2)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              </div>
              <div>
                <div className="pipe-num">{orgStats.avg_score != null ? Number(orgStats.avg_score).toFixed(1) : "–"}</div>
                <div className="pipe-lbl">Org avg score</div>
              </div>
            </div>
            <div className="pipe">
              <div className="pipe-ic" style={{ background: "rgba(55,211,153,.16)", color: "var(--pos)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9 9z"/></svg>
              </div>
              <div><div className="pipe-num">{orgStats.positive || 0}</div><div className="pipe-lbl">Positive calls</div></div>
            </div>
          </div>
        )}
      </section>

      {/* ── Tip of the Day ── */}
      {tip && (
        <section className="sec">
          <div className="lb-tip">
            <div className="lb-tip-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ color: "var(--risk)" }}>
                <path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6-5 7v2H10v-2c-2.5-1-5-3.5-5-7a7 7 0 0 1 7-7z"/>
                <path d="M10 21h4"/>
              </svg>
              Team Tip · Weakest area: <strong>{tip.criterion}</strong> ({tip.avgPct}% avg)
            </div>
            <p className="lb-tip-body">{tip.tip}</p>
          </div>
        </section>
      )}

      {/* ── Leaderboard table ── */}
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>Agent rankings</h2>
            <div className="sec-sub">Click a row to see full agent detail and coaching feed.</div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ position: "absolute", left: 10, width: 15, height: 15, color: "var(--faint)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter agents…"
              style={{ paddingLeft: 32, width: 180, borderRadius: 999, fontSize: 13, height: 36 }} />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty"><strong>No agents yet.</strong>Run npm run seed:data or import recordings with agent names.</div>
        ) : (
          <div className="lb-table">
            <div className="lb-head">
              <div>#</div>
              <div>Agent</div>
              <div className="lb-col-calls">Calls</div>
              <div>Avg score</div>
              <div className="lb-col-range">Range</div>
              <div className="lb-col-pos">Positive</div>
              <div className="lb-col-sales">Sales</div>
            </div>
            {visible.map((agent, i) => {
              const color = agentColor(agent.agentName);
              const sc = scoreColor(agent.avgScore);
              const posRate = agent.callCount ? Math.round((agent.positiveCount / agent.callCount) * 100) : 0;
              return (
                <div key={agent.agentName} className="lb-row"
                  onClick={() => navigate(`/agents/${encodeURIComponent(agent.agentName)}`)}>
                  <div className="lb-rank">{i + 1}</div>
                  <div className="lb-agent">
                    <span className="mini-av" style={{ width: 34, height: 34, fontSize: 12, background: color, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {agentInit(agent.agentName)}
                    </span>
                    <div>
                      <div className="lb-agent-name">{agent.agentName}</div>
                      <div className="lb-agent-sub">Last call {agent.lastCallAt ? new Date(agent.lastCallAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–"}</div>
                    </div>
                  </div>
                  <div className="lb-col-calls" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>{agent.callCount}</div>
                  <div className="lb-score-cell">
                    <span className="lb-score-num" style={{ color: sc }}>{agent.avgScore ?? "–"}</span>
                    <div className="lb-score-bar">
                      <div className="lb-score-fill" style={{ width: `${agent.avgScore || 0}%`, background: sc }} />
                    </div>
                  </div>
                  <div className="lb-col-range" style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace" }}>
                    {agent.worstScore != null ? `${Math.round(agent.worstScore)}–${Math.round(agent.bestScore)}` : "–"}
                  </div>
                  <div className="lb-col-pos">
                    <span className="lb-badge" style={{ color: "var(--pos)", background: "rgba(55,211,153,.1)" }}>{posRate}%</span>
                  </div>
                  <div className="lb-col-sales">
                    <span className="lb-badge" style={{ color: "var(--brand)", background: "rgba(139,124,255,.1)" }}>{agent.salesMade || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="pad-bottom" />
    </>
  );
}
