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

function ItemTypeIcon({ type }) {
  if (type === "strength")
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M20 6 9 17l-5-5"/></svg>;
  if (type === "improvement")
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 3v12M7 8l5-5 5 5"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 8v4M12 16h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>;
}

function typeColor(t) {
  return { strength: "var(--pos)", improvement: "var(--risk)", error: "var(--crit)" }[t] || "var(--muted)";
}
function typeBg(t) {
  return { strength: "rgba(55,211,153,.08)", improvement: "rgba(244,183,64,.08)", error: "rgba(255,107,107,.08)" }[t] || "rgba(255,255,255,.04)";
}

export default function CoachingPage() {
  const navigate = useNavigate();
  const [agents, setAgents]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems]       = useState([]);
  const [tip, setTip]           = useState(null);
  const [loading, setLoading]   = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [typeFilter, setTypeFilter]   = useState("all");

  useEffect(() => {
    Promise.all([
      api.listCoachingAgents().catch(() => ({ agents: [] })),
      api.getTipOfDay().catch(() => ({ tip: null })),
    ]).then(([list, tipRes]) => {
      const agentList = list.agents || [];
      setAgents(agentList);
      setTip(tipRes.tip);
      setLoading(false);
      if (agentList.length) {
        loadFeed(agentList[0].agentName);
        setSelected(agentList[0].agentName);
      }
    });
  }, []);

  function loadFeed(agentName) {
    setLoadingFeed(true);
    api.getCoachingFeed(agentName).then(res => {
      setItems(res.items || []);
      setLoadingFeed(false);
    }).catch(() => setLoadingFeed(false));
  }

  function selectAgent(name) {
    setSelected(name);
    setTypeFilter("all");
    loadFeed(name);
  }

  const visible = typeFilter === "all" ? items : items.filter(i => i.type === typeFilter);
  const counts = { strength: 0, improvement: 0, error: 0 };
  items.forEach(i => { if (counts[i.type] != null) counts[i.type]++; });

  if (loading) return <div className="cr-loading"><div className="cr-spinner" />Loading coaching…</div>;

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Quality Intelligence</div>
        <h1>Coaching <span className="accent">Feed</span></h1>
        <p>Aggregated strengths, improvement areas, and errors distilled from recent call analyses.</p>
      </section>

      {/* Tip of Day */}
      {tip && (
        <section className="sec">
          <div className="lb-tip">
            <div className="lb-tip-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" style={{ color: "var(--risk)" }}>
                <path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6-5 7v2H10v-2c-2.5-1-5-3.5-5-7a7 7 0 0 1 7-7z"/>
                <path d="M10 21h4"/>
              </svg>
              Team Tip · <strong>{tip.criterion}</strong> needs focus ({tip.avgPct}% avg)
            </div>
            <p className="lb-tip-body">{tip.tip}</p>
          </div>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 0, margin: "0 30px", borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden" }}>
        {/* Agent list */}
        <div style={{ borderRight: "1px solid var(--line)", background: "rgba(255,255,255,.02)" }}>
          <div style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>Agents</div>
          {agents.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>No coaching data yet.</div>
          ) : agents.map(a => (
            <button key={a.agentName} onClick={() => selectAgent(a.agentName)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px",
              background: selected === a.agentName ? "rgba(139,124,255,.1)" : "none",
              border: "none", borderLeft: selected === a.agentName ? "2px solid var(--brand)" : "2px solid transparent",
              cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 30, height: 30, background: agentColor(a.agentName), borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {agentInit(a.agentName)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: selected === a.agentName ? "var(--brand)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.agentName}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{a.itemCount} item{a.itemCount !== 1 ? "s" : ""}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Feed */}
        <div style={{ padding: "16px 20px" }}>
          {selected && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15 }}>{selected}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["all", "strength", "improvement", "error"].map(f => (
                    <button key={f} onClick={() => setTypeFilter(f)} className={`chip${typeFilter === f ? " on" : ""}`} style={{ fontSize: 12 }}>
                      {f === "all" ? `All (${items.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)}s (${counts[f]})`}
                    </button>
                  ))}
                </div>
                <button style={{ fontSize: 12, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                  onClick={() => navigate(`/agents/${encodeURIComponent(selected)}`)}>
                  View agent detail →
                </button>
              </div>

              {loadingFeed ? (
                <div className="cr-loading" style={{ height: 120 }}><div className="cr-spinner" /></div>
              ) : visible.length === 0 ? (
                <div className="empty">No items match this filter.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {visible.map((item, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 12, alignItems: "flex-start",
                      background: typeBg(item.type), borderRadius: 8, padding: "12px 14px",
                      borderLeft: `3px solid ${typeColor(item.type)}`,
                    }}>
                      <span style={{ color: typeColor(item.type), marginTop: 1, flexShrink: 0 }}>
                        <ItemTypeIcon type={item.type} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: typeColor(item.type), marginBottom: 3 }}>{item.type}</div>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>{item.content}</p>
                        {item.recordingId && (
                          <button style={{ marginTop: 6, fontSize: 11, color: "var(--brand)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            onClick={() => navigate(`/calls/${item.recordingId}/report`)}>
                            View call report →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {!selected && agents.length === 0 && (
            <div className="empty">No coaching data yet — run npm run seed:data or process some calls.</div>
          )}
        </div>
      </div>

      <div className="pad-bottom" />
    </>
  );
}
