import { Link } from "react-router-dom";

export default function PendingPage() {
  return (
    <section className="auth-card">
      <h1>Approval In Progress</h1>
      <p>
        Your registration is pending administrator approval. You will gain access once your account is activated.
      </p>
      <p className="auth-foot"><Link to="/login">Back to sign in</Link></p>
    </section>
  );
}
