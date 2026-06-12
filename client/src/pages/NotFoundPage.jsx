import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="content-card">
      <h2>Page Not Found</h2>
      <p>The requested route does not exist.</p>
      <Link to="/dashboard">Return to dashboard</Link>
    </section>
  );
}
