import { Link } from "react-router-dom";

const roles = ["agent", "qa", "manager", "admin"];

export default function RegisterPage({ form, setForm, onSubmit, loading }) {
  return (
    <section className="auth-card">
      <h1>Create Enterprise Account</h1>
      <p>Register to request platform access.</p>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>First name<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
        <label>Last name<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <label>Requested role
          <select value={form.requestedRole} onChange={(e) => setForm({ ...form, requestedRole: e.target.value })}>
            {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </label>
        <button className="primary-btn" disabled={loading}>{loading ? "Creating..." : "Create account"}</button>
      </form>
      <p className="auth-foot">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  );
}
