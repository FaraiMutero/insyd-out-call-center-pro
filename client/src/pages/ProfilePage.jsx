import { useState } from "react";

export default function ProfilePage({ user, onSaveProfile, onChangePassword }) {
  const [profileForm, setProfileForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: ""
  });

  return (
    <section className="page-stack">
      <section className="content-card">
        <div className="card-head"><h2>Profile</h2></div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveProfile(profileForm);
          }}
        >
          <label>First name<input value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} required /></label>
          <label>Last name<input value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} required /></label>
          <button className="primary-btn compact-btn">Save profile</button>
        </form>
      </section>

      <section className="content-card">
        <div className="card-head"><h2>Password</h2></div>
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
          <button className="primary-btn compact-btn">Change password</button>
        </form>
      </section>
    </section>
  );
}
