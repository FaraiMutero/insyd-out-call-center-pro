import { useMemo } from "react";

const COLORS = ["#7C6CFF", "#5B8DEF", "#37D399", "#F4B740", "#FF6B6B", "#C084FC"];
function avatarColor(name) {
  if (!name) return "#5E667C";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % COLORS.length;
  return COLORS[h];
}
function avatarInit(first, last) {
  return ((first?.[0] || "") + (last?.[0] || "")).toUpperCase() || "?";
}

function roleBadge(role) {
  const map = {
    admin:   { bg: "rgba(139,124,255,.15)", color: "var(--brand)" },
    manager: { bg: "rgba(91,141,239,.15)",  color: "var(--brand-2)" },
    qa:      { bg: "rgba(244,183,64,.15)",  color: "var(--risk)" },
    agent:   { bg: "rgba(55,211,153,.15)",  color: "var(--pos)" },
  };
  const s = map[role] || { bg: "rgba(255,255,255,.06)", color: "var(--muted)" };
  return <span className="lb-badge" style={{ background: s.bg, color: s.color, textTransform: "capitalize" }}>{role}</span>;
}

function statusBadge(status) {
  const map = {
    active:      { bg: "rgba(55,211,153,.15)",  color: "var(--pos)" },
    pending:     { bg: "rgba(244,183,64,.15)",  color: "var(--risk)" },
    rejected:    { bg: "rgba(255,107,107,.15)", color: "var(--crit)" },
    deactivated: { bg: "rgba(255,107,107,.15)", color: "var(--crit)" },
  };
  const s = map[status] || { bg: "rgba(255,255,255,.06)", color: "var(--muted)" };
  return <span className="lb-badge" style={{ background: s.bg, color: s.color, textTransform: "capitalize" }}>{status}</span>;
}

export default function UsersPage({ users = [], onRefresh, onAction }) {
  const counts = useMemo(() => ({
    total: users.length,
    pending: users.filter(u => u.status === "pending").length,
    active: users.filter(u => u.status === "active").length,
    admins: users.filter(u => u.role === "admin").length,
  }), [users]);

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="eyebrow">Administration</div>
        <h1>User <span className="accent">Management</span></h1>
        <p>Approve new sign-ups, manage roles, and control platform access.</p>

        <div className="pipeline">
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(139,124,255,.16)", color: "var(--brand)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div><div className="pipe-num">{counts.total}</div><div className="pipe-lbl">Total users</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(244,183,64,.16)", color: "var(--risk)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </div>
            <div><div className="pipe-num">{counts.pending}</div><div className="pipe-lbl">Pending approval</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(55,211,153,.16)", color: "var(--pos)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <div><div className="pipe-num">{counts.active}</div><div className="pipe-lbl">Active</div></div>
          </div>
          <div className="pipe">
            <div className="pipe-ic" style={{ background: "rgba(91,141,239,.16)", color: "var(--brand-2)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/></svg>
            </div>
            <div><div className="pipe-num">{counts.admins}</div><div className="pipe-lbl">Admins</div></div>
          </div>
        </div>
      </section>

      {/* ── Users table ── */}
      <section className="sec">
        <div className="sec-head">
          <div>
            <h2>All users</h2>
            <div className="sec-sub">Approve, reject, or manage access for every account.</div>
          </div>
          <button className="btn btn-primary" onClick={onRefresh}>Refresh</button>
        </div>

        {!users.length ? (
          <div className="empty"><strong>No users found.</strong></div>
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="mini-av" style={{ width: 30, height: 30, fontSize: 11, background: avatarColor(entry.firstName + entry.lastName) }}>
                          {avatarInit(entry.firstName, entry.lastName)}
                        </span>
                        <span>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.firstName} {entry.lastName}</div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{entry.email}</div>
                        </span>
                      </span>
                    </td>
                    <td>{roleBadge(entry.role)}</td>
                    <td>{statusBadge(entry.status)}</td>
                    <td className="actions">
                      <button className="btn btn-xs btn-success" onClick={() => onAction("approve", entry.id)}>Approve</button>
                      <button className="btn btn-xs btn-danger" onClick={() => onAction("reject", entry.id)}>Reject</button>
                      <button className="btn btn-xs btn-danger" onClick={() => onAction("deactivate", entry.id)}>Deactivate</button>
                      <button className="btn btn-xs btn-success" onClick={() => onAction("reactivate", entry.id)}>Reactivate</button>
                      <button className="btn btn-xs" onClick={() => onAction("reset", entry.id)}>Reset Link</button>
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
