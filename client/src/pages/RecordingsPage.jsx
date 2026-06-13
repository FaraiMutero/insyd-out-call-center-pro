import { useState } from "react";
import { api } from "../api/client.js";

export default function RecordingsPage({ recordings = [], onRefresh, onUpload, onStatus }) {
  const [form, setForm] = useState({
    originalFilename: "",
    agentName: "",
    direction: "inbound",
    callDatetime: "",
    audioFile: null
  });

  async function submit(event) {
    event.preventDefault();
    await onUpload(form, () => {
      setForm({
        originalFilename: "",
        agentName: "",
        direction: "inbound",
        callDatetime: "",
        audioFile: null
      });
    });
  }

  return (
    <section className="page-stack">
      <section className="content-card">
        <div className="card-head">
          <h2>Recording Import</h2>
        </div>
        <form onSubmit={submit} className="form-grid">
          <label>
            Audio file
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.ogg,.opus,.wma,.amr"
              onChange={(e) => setForm({ ...form, audioFile: e.target.files?.[0] || null })}
              required
            />
          </label>
          <label>
            Display filename
            <input
              value={form.originalFilename}
              onChange={(e) => setForm({ ...form, originalFilename: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label>
            Agent name
            <input
              value={form.agentName}
              onChange={(e) => setForm({ ...form, agentName: e.target.value })}
            />
          </label>
          <label>
            Direction
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value })}
            >
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </label>
          <label>
            Call date/time
            <input
              type="datetime-local"
              value={form.callDatetime}
              onChange={(e) => setForm({ ...form, callDatetime: e.target.value })}
            />
          </label>
          <button className="primary-btn compact-btn">Import Recording</button>
        </form>
      </section>

      <section className="content-card">
        <div className="card-head">
          <h2>Recording Pipeline Status</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={api.exportRecordingsCSVUrl()} download className="btn" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, textDecoration: "none" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>
              Export CSV
            </a>
            <button className="primary-btn compact-btn" onClick={onRefresh}>Refresh</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Filename</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Stored</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.id}</td>
                  <td>{entry.originalFilename}</td>
                  <td>{entry.agentName || "-"}</td>
                  <td>{entry.status}</td>
                  <td>{entry.storedPath ? "Yes" : "No"}</td>
                  <td className="actions">
                    <button className="compact-btn" onClick={() => onStatus(entry.id, "uploaded")}>Set Uploaded</button>
                    <button className="compact-btn" onClick={() => onStatus(entry.id, "ready_for_transcription")}>Set Ready</button>
                    <button className="compact-btn" onClick={() => onStatus(entry.id, "failed")}>Set Failed</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recordings.length && <p className="empty">No recordings imported yet.</p>}
        </div>
      </section>
    </section>
  );
}
