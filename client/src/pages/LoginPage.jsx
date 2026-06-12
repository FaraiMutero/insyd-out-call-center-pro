import { Link } from "react-router-dom";

export default function LoginPage({ form, setForm, onSubmit, loading }) {
  return (
    <section className="auth-card">
      <h1>InsydOut Call Center Pro</h1>
      <p>Sign in to continue to the enterprise QA workspace.</p>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <button className="primary-btn" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
      </form>
      <p className="auth-foot">No account yet? <Link to="/register">Register</Link></p>
    </section>
  );
}
