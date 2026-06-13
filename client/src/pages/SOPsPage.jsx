import { useEffect, useState } from "react";
import { api } from "../api/client.js";

function weightColor(w) {
  if (w >= 15) return "var(--brand)";
  if (w >= 10) return "var(--brand-2)";
  return "var(--muted)";
}

export default function SOPsPage() {
  const [rubrics, setRubrics]   = useState([]);
  const [active, setActive]     = useState(null);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState([]);
  const [saving, setSaving]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [rubricList, rubricData] = await Promise.all([
        api.listRubrics(),
        api.getActiveRubric("outbound_sales").catch(() => null),
      ]);
      setRubrics(rubricList.rubrics || []);
      setActive(rubricData?.rubric || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    if (!active) return;
    setDraft(active.criteria.map(c => ({ ...c })));
    setEditing(true);
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditing(false);
    setDraft([]);
  }

  function setWeight(i, val) {
    const num = Math.max(0, Math.min(100, Number(val) || 0));
    setDraft(d => d.map((c, idx) => idx === i ? { ...c, weight: num } : c));
  }

  const totalWeight = draft.reduce((s, c) => s + (c.weight || 0), 0);

  async function handleSave() {
    if (Math.round(totalWeight) !== 100) {
      setError(`Weights must sum to 100 (currently ${totalWeight})`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.updateRubric(active.id, draft);
      setActive(res.rubric);
      setEditing(false);
      setMessage("Rubric saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const res = await api.generateRubric("outbound_sales");
      setActive(res.rubric);
      setMessage("Default rubric (re)generated.");
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="cr-loading"><div className="cr-spinner" />Loading SOPs…</div>;

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Quality Standards</div>
        <h1>Scoring <span className="accent">Rubrics</span></h1>
        <p>View and edit the active QA rubric. Criteria weights must sum to 100.</p>
      </section>

      {message && <div style={{ margin: "0 30px 4px", padding: "12px 16px", background: "rgba(55,211,153,.1)", color: "var(--pos)", borderRadius: 8, fontSize: 13 }}>{message}</div>}
      {error   && <div style={{ margin: "0 30px 4px", padding: "12px 16px", background: "rgba(255,107,107,.1)", color: "var(--crit)", borderRadius: 8, fontSize: 13 }}>{error}</div>}

      {/* Active rubric */}
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>Active rubric</h2>
            {active && <div className="sec-sub">{active.title} · {active.callType} · {active.criteria?.length} criteria</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!editing && active && (
              <button className="btn" onClick={startEdit}>Edit weights</button>
            )}
            {editing && (
              <>
                <button className="btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || Math.round(totalWeight) !== 100}>
                  {saving ? "Saving…" : "Save rubric"}
                </button>
              </>
            )}
            <button className="btn" onClick={handleGenerate} disabled={generating} title="Regenerate default rubric">
              {generating ? "Generating…" : "Reset to default"}
            </button>
          </div>
        </div>

        {!active ? (
          <div className="empty">
            <strong>No active rubric.</strong><br />
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating…" : "Generate default rubric"}
            </button>
          </div>
        ) : (
          <>
            {editing && (
              <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(255,255,255,.04)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total weight: <strong style={{ color: Math.round(totalWeight) === 100 ? "var(--pos)" : "var(--crit)" }}>{totalWeight}</strong> / 100</span>
                {Math.round(totalWeight) !== 100 && <span style={{ color: "var(--crit)", fontSize: 12 }}>Must equal exactly 100 to save.</span>}
              </div>
            )}
            <div className="cr-criteria">
              {(editing ? draft : active.criteria).map((c, i) => {
                const pct = c.weight || 0;
                const col = weightColor(pct);
                return (
                  <div key={c.id || i} className="cr-criterion" style={{ gap: editing ? 12 : 10 }}>
                    <div className="cr-crit-label" style={{ minWidth: editing ? 180 : 200 }}>{c.name}</div>
                    {!editing && (
                      <div className="cr-crit-bar" style={{ flex: 1 }}>
                        <div className="cr-crit-fill" style={{ width: `${pct}%`, background: col }} />
                      </div>
                    )}
                    {editing ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="range" min="0" max="50" value={pct} onChange={e => setWeight(i, e.target.value)}
                          style={{ width: 100, accentColor: "var(--brand)" }} />
                        <input type="number" min="0" max="100" value={pct} onChange={e => setWeight(i, e.target.value)}
                          style={{ width: 52, textAlign: "center", borderRadius: 6, border: "1px solid var(--line-strong)", padding: "4px 6px", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                        <span style={{ fontSize: 12, color: "var(--muted)", width: 14 }}>%</span>
                      </div>
                    ) : (
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: col, width: 36, textAlign: "right" }}>{pct}%</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Rubric history */}
      {rubrics.length > 1 && (
        <section className="sec">
          <h2 style={{ marginBottom: 14 }}>Version history</h2>
          <div className="lb-table">
            <div className="lb-head" style={{ gridTemplateColumns: "1fr 120px 100px 80px" }}>
              <div>Title</div>
              <div>Call type</div>
              <div>Created</div>
              <div>Status</div>
            </div>
            {rubrics.map(r => (
              <div key={r.id} className="lb-row" style={{ gridTemplateColumns: "1fr 120px 100px 80px" }}>
                <div style={{ fontSize: 13 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.callType}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "–"}
                </div>
                <div>
                  {r.isActive
                    ? <span className="lb-badge" style={{ color: "var(--pos)", background: "rgba(55,211,153,.1)" }}>Active</span>
                    : <span className="lb-badge" style={{ color: "var(--muted)", background: "rgba(255,255,255,.06)" }}>Archived</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pad-bottom" />
    </>
  );
}
