import { useState } from "react";

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

export default function ProfilePage({ user, onSaveProfile, onChangePassword }) {
  const [profileForm, setProfileForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: ""
  });

  const initials = ((user.firstName?.[0] || "") + (user.lastName?.[0] || "")).toUpperCase() || "U";

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="eyebrow">Account</div>
        <h1>Your <span className="accent">Profile</span></h1>
        <p>Manage your personal details and keep your password secure.</p>
      </section>

      <section className="sec">
        <div className="profile-grid">
          {/* Identity card */}
          <div className="content-card profile-card-id">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-name">{user.firstName} {user.lastName}</div>
            <div className="profile-email">{user.email}</div>
            <div style={{ marginTop: 10 }}>{roleBadge(user.role)}</div>
          </div>

          {/* Forms */}
          <div style={{ display: "grid", gap: 16 }}>
            <div className="content-card">
              <div className="card-head"><h3>Profile details</h3></div>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveProfile(profileForm);
                }}
              >
                <label>First name<input value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} required /></label>
                <label>Last name<input value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} required /></label>
                <button className="btn btn-primary" style={{ alignSelf: "end" }}>Save profile</button>
              </form>
            </div>

            <div className="content-card">
              <div className="card-head"><h3>Password</h3></div>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  onChangePassword(passwordForm, () =>
                    setPasswordForm({ currentPassword: "", newPassword: "" })
                  );
                }}
              >
                <label>Current password<input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required /></label>
                <label>New password<input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required /></label>
                <button className="btn btn-primary" style={{ alignSelf: "end" }}>Change password</button>
              </form>
            </div>
          </div>
        </div>
        <div className="pad-bottom" />
      </section>
    </>
  );
}
