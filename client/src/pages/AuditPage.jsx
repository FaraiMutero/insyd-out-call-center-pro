import { useMemo } from "react";

function actionStyle(action) {
  const a = (action || "").toLowerCase();
  if (/(delete|reject|deactivate|fail)/.test(a)) return { bg: "rgba(255,107,107,.13)", color: "var(--crit)" };
  if (/(create|approve|upload|complete|reactivate)/.test(a)) return { bg: "rgba(55,211,153,.13)", color: "var(--pos)" };
  if (/(update|reset|edit)/.test(a)) return { bg: "rgba(244,183,64,.13)", color: "var(--risk)" };
  return { bg: "rgba(139,124,255,.13)", color: "var(--brand)" };
}

export default function AuditPage({ logs = [], onRefresh }) {
  const stats = useMemo(() => {
    const actors = new Set(logs.map(l => l.userEmail || l.userName || l.userId || "—"));
    const today = new Date().toDateString();
    const todayCount = logs.filter(l => l.createdAt && new Date(l.createdAt).toDateString() === today).length;
    return { total: logs.length, actors: actors.size, today: todayCount };
  }, [logs]);

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="eyebrow">Compliance</div>
        <h1>Audit <span className="accent">Trail</span></h1>
        <p>Every registration, approval, upload, and deletion — logged for accountability.</p>

        <div className="pipeline">
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(139,124,255,.16)", color: "var(--brand)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>
            </div>
            <div><div className="pipe-num">{stats.total}</div><div className="pipe-lbl">Logged events</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(91,141,239,.16)", color: "var(--brand-2)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div><div className="pipe-num">{stats.actors}</div><div className="pipe-lbl">Distinct actors</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(55,211,153,.16)", color: "var(--pos)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div><div className="pipe-num">{stats.today}</div><div className="pipe-lbl">Events today</div></div>
          </div>
        </div>
      </section>

      {/* ── Log table ── */}
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>Recent activity</h2>
            <div className="sec-sub">Most recent actions, newest first.</div>
          </div>
          <button className="btn btn-primary" onClick={onRefresh}>Refresh</button>
        </div>

        {!logs.length ? (
          <div className="empty"><strong>No audit logs available.</strong></div>
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => {
                  const s = actionStyle(entry.action);
                  return (
                    <tr key={entry.id}>
                      <td style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{entry.userEmail || entry.userName || `User ${entry.userId || "-"}`}</td>
                      <td><span className="lb-badge" style={{ background: s.bg, color: s.color }}>{entry.action}</span></td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{entry.entity} {entry.entityId ? `#${entry.entityId}` : ""}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace" }}>
                        {entry.detail ? JSON.stringify(entry.detail) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pad-bottom" />
      </section>
    </>
  );
}
