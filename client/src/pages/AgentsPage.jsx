import { useEffect, useMemo, useState } from "react";
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
function profileBadge(status) {
  const map = {
    active:      { bg: "rgba(55,211,153,.15)",  color: "var(--pos)" },
    deactivated: { bg: "rgba(255,107,107,.15)", color: "var(--crit)" },
  };
  if (!status) {
    return <span className="lb-badge" style={{ background: "rgba(255,255,255,.06)", color: "var(--muted)" }}>No login</span>;
  }
  const s = map[status] || { bg: "rgba(255,255,255,.06)", color: "var(--muted)" };
  return <span className="lb-badge" style={{ background: s.bg, color: s.color, textTransform: "capitalize" }}>{status}</span>;
}

const EMPTY_FORM = { firstName: "", lastName: "", email: "", password: "" };

export default function AgentsPage({ user }) {
  const navigate = useNavigate();
  const isAdmin  = user?.role === "admin";

  const [profiles, setProfiles]     = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [tip, setTip]               = useState(null);
  const [orgStats, setOrg]          = useState(null);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [error, setError]           = useState("");
  const [message, setMessage]       = useState("");

  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [view, setView]           = useState("rankings"); // rankings | profiles

  const [renamingAgent, setRenamingAgent] = useState(null);
  const [renameValue, setRenameValue]     = useState("");
  const [renaming, setRenaming]           = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [lb, tipRes, orgRes, agentsRes] = await Promise.all([
        api.getLeaderboard(),
        api.getTipOfDay().catch(() => ({ tip: null })),
        api.getOrgStats(),
        api.listAgents().catch(() => ({ agents: [] })),
      ]);
      setLeaderboard(lb.agents);
      setTip(tipRes.tip);
      setOrg(orgRes.stats);
      setProfiles(agentsRes.agents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  /* merge user profiles (role=agent) with call-performance stats, keyed by display name */
  const mergedAgents = useMemo(() => {
    const lbByName = new Map(leaderboard.map(a => [a.agentName?.toLowerCase().trim(), a]));
    const matched = new Set();

    const fromProfiles = profiles.map(p => {
      const displayName = `${p.firstName} ${p.lastName}`.trim();
      const stats = lbByName.get(displayName.toLowerCase());
      if (stats) matched.add(stats.agentName.toLowerCase().trim());
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        status: p.status,
        agentName: displayName,
        callCount: stats?.callCount || 0,
        avgScore: stats?.avgScore ?? null,
        lastCallAt: stats?.lastCallAt ?? null,
      };
    });

    const unlinked = leaderboard
      .filter(a => !matched.has(a.agentName?.toLowerCase().trim()))
      .map(a => ({
        id: null,
        firstName: null,
        lastName: null,
        email: null,
        status: null,
        agentName: a.agentName,
        callCount: a.callCount,
        avgScore: a.avgScore,
        lastCallAt: a.lastCallAt,
      }));

    return [...fromProfiles, ...unlinked];
  }, [profiles, leaderboard]);

  const visibleLeaderboard = leaderboard.filter(a =>
    !search || a.agentName?.toLowerCase().includes(search.toLowerCase())
  );

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    clearFeedback();
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({ firstName: row.firstName || "", lastName: row.lastName || "", email: row.email || "", password: "" });
    setShowForm(true);
    clearFeedback();
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submitForm(event) {
    event.preventDefault();
    clearFeedback();
    try {
      if (editingId) {
        await api.updateAgent(editingId, { firstName: form.firstName, lastName: form.lastName });
        setMessage("Agent profile updated");
      } else {
        await api.createAgent(form);
        setMessage("Agent profile created");
      }
      closeForm();
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeactivate(id) {
    clearFeedback();
    try {
      await api.deactivateAgent(id);
      setMessage("Agent deactivated");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReactivate(id) {
    clearFeedback();
    try {
      await api.reactivateAgent(id);
      setMessage("Agent reactivated");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function startRename(agentName) {
    clearFeedback();
    setRenamingAgent(agentName);
    setRenameValue(agentName);
  }

  function cancelRename() {
    setRenamingAgent(null);
    setRenameValue("");
  }

  async function saveRename() {
    const newName = renameValue.trim();
    if (!newName || newName === renamingAgent) {
      cancelRename();
      return;
    }
    clearFeedback();
    setRenaming(true);
    try {
      await api.renameAgent(renamingAgent, newName);
      setMessage(`Renamed "${renamingAgent}" to "${newName}"`);
      cancelRename();
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setRenaming(false);
    }
  }

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
              <div><div className="pipe-num">{leaderboard.length}</div><div className="pipe-lbl">Agents tracked</div></div>
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

      {(error || message) && (
        <section className="sec" style={{ paddingBottom: 0 }}>
          {error && <p className="feedback error">{error}</p>}
          {message && <p className="feedback ok">{message}</p>}
        </section>
      )}

      {/* ── Page tabs ── */}
      <div style={{ borderBottom: "1px solid var(--line)", padding: "0 30px", display: "flex", gap: 4 }}>
        {[
          { key: "rankings", label: "Agent Rankings" },
          { key: "profiles", label: `Agent Profiles (${mergedAgents.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "10px 16px",
            fontSize: 13, fontWeight: 600,
            color: view === t.key ? "var(--brand)" : "var(--muted)",
            borderBottom: view === t.key ? "2px solid var(--brand)" : "2px solid transparent",
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {view === "rankings" && (
        <>
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

            {visibleLeaderboard.length === 0 ? (
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
                {visibleLeaderboard.map((agent, i) => {
                  const color = agentColor(agent.agentName);
                  const sc = scoreColor(agent.avgScore);
                  const posRate = agent.callCount ? Math.round((agent.positiveCount / agent.callCount) * 100) : 0;
                  const isRenaming = renamingAgent === agent.agentName;
                  return (
                    <div key={agent.agentName} className="lb-row"
                      onClick={() => !isRenaming && navigate(`/agents/${encodeURIComponent(agent.agentName)}`)}>
                      <div className="lb-rank">{i + 1}</div>
                      <div className="lb-agent">
                        <span className="mini-av" style={{ width: 34, height: 34, fontSize: 12, background: color, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                          {agentInit(agent.agentName)}
                        </span>
                        {isRenaming ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") cancelRename(); }}
                              style={{ width: 160, height: 30, fontSize: 13, borderRadius: 6, padding: "2px 8px" }} />
                            <button className="btn btn-xs btn-success" disabled={renaming} onClick={saveRename}>Save</button>
                            <button className="btn btn-xs" disabled={renaming} onClick={cancelRename}>Cancel</button>
                          </div>
                        ) : (
                          <div>
                            <div className="lb-agent-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {agent.agentName}
                              {isAdmin && (
                                <button className="btn btn-xs" title="Rename agent"
                                  onClick={e => { e.stopPropagation(); startRename(agent.agentName); }}
                                  style={{ padding: 3, lineHeight: 0 }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                                </button>
                              )}
                            </div>
                            <div className="lb-agent-sub">Last call {agent.lastCallAt ? new Date(agent.lastCallAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "–"}</div>
                          </div>
                        )}
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
        </>
      )}

      {/* ── Agent profiles (linked to user management) ── */}
      {view === "profiles" && (
        <section className="sec">
          <div className="sec-head">
            <div>
              <h2>Agent profiles</h2>
              <div className="sec-sub">User accounts with the <code>agent</code> role — these are what agents log in with.</div>
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={openCreate}>+ Add agent</button>
            )}
          </div>

          {isAdmin && showForm && (
            <div className="content-card" style={{ marginBottom: 16 }}>
              <form onSubmit={submitForm} className="form-grid">
                <label>
                  First name
                  <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required />
                </label>
                <label>
                  Last name
                  <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required />
                </label>
                {!editingId && (
                  <>
                    <label>
                      Email
                      <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                    </label>
                    <label>
                      Temporary password
                      <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 10 chars, letters + digits" required />
                    </label>
                  </>
                )}
                <div style={{ display: "flex", gap: 8, alignSelf: "end" }}>
                  <button className="btn btn-primary">{editingId ? "Save changes" : "Create agent"}</button>
                  <button type="button" className="btn" onClick={closeForm}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {mergedAgents.length === 0 ? (
            <div className="empty"><strong>No agent profiles yet.</strong></div>
          ) : (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Email</th>
                    <th>Profile</th>
                    <th>Calls</th>
                    <th>Avg score</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {mergedAgents.map(row => (
                    <tr key={row.id ?? row.agentName}>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="mini-av" style={{ width: 28, height: 28, fontSize: 10, background: agentColor(row.agentName) }}>
                            {agentInit(row.agentName)}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{row.agentName || "—"}</span>
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{row.email || "—"}</td>
                      <td>{profileBadge(row.status)}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>{row.callCount}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: scoreColor(row.avgScore) }}>{row.avgScore ?? "–"}</td>
                      {isAdmin && (
                        <td className="actions">
                          {row.id ? (
                            <>
                              <button className="btn btn-xs" onClick={() => openEdit(row)}>Edit</button>
                              {row.status === "deactivated" ? (
                                <button className="btn btn-xs btn-success" onClick={() => handleReactivate(row.id)}>Reactivate</button>
                              ) : (
                                <button className="btn btn-xs btn-danger" onClick={() => handleDeactivate(row.id)}>Deactivate</button>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>No linked account</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="pad-bottom" />
    </>
  );
}
