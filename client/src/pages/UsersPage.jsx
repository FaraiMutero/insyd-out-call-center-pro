export default function UsersPage({ users = [], onRefresh, onAction }) {
  return (
    <section className="page-stack">
      <section className="content-card">
        <div className="card-head">
          <h2>User Management</h2>
          <button className="primary-btn" onClick={onRefresh}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.id}</td>
                  <td>{entry.firstName} {entry.lastName}</td>
                  <td>{entry.email}</td>
                  <td>{entry.role}</td>
                  <td>{entry.status}</td>
                  <td className="actions">
                    <button onClick={() => onAction("approve", entry.id)}>Approve</button>
                    <button onClick={() => onAction("reject", entry.id)}>Reject</button>
                    <button onClick={() => onAction("deactivate", entry.id)}>Deactivate</button>
                    <button onClick={() => onAction("reactivate", entry.id)}>Reactivate</button>
                    <button onClick={() => onAction("reset", entry.id)}>Reset Link</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && <p className="empty">No users found.</p>}
        </div>
      </section>
    </section>
  );
}
