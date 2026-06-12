export default function AuditPage({ logs = [], onRefresh }) {
  return (
    <section className="page-stack">
      <section className="content-card">
        <div className="card-head">
          <h2>Audit Trail</h2>
          <button className="primary-btn" onClick={onRefresh}>Refresh</button>
        </div>
        <div className="table-wrap">
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
              {logs.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.createdAt}</td>
                  <td>{entry.userEmail || entry.userName || `User ${entry.userId || "-"}`}</td>
                  <td>{entry.action}</td>
                  <td>{entry.entity} {entry.entityId ? `#${entry.entityId}` : ""}</td>
                  <td>{entry.detail ? JSON.stringify(entry.detail) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.length && <p className="empty">No audit logs available.</p>}
        </div>
      </section>
    </section>
  );
}
