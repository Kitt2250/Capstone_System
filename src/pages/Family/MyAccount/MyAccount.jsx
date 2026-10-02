import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import "./MyAccount.css";
import FamilyTopbar from "./FamilyTopbar";

function getInitials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "FA";
}

function MyAccount() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    relationship: "",
  });

  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });

  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [saveError, setSaveError] = useState("");

  // Fetch the logged-in user's real Firestore data
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setForm({
            fullName: data.name || "",
            email: data.email || user.email || "",
            phone: data.phone || "",
            address: data.address || "",
            relationship: data.relationship || "",
          });
        } else {
          setForm((prev) => ({
            ...prev,
            email: user.email || "",
          }));
        }
      } catch (err) {
        console.error("Failed to load account info:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaved(false);
    setSaveError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      await updateDoc(doc(db, "users", uid), {
        name: form.fullName,
        phone: form.phone,
        address: form.address,
        relationship: form.relationship,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save account info:", err);
      setSaveError("Could not save changes. Please try again.");
    }
  };

  const handlePasswordChange = (e) => {
    setPasswords((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setPwError("");
    setPwSaved(false);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!passwords.current || !passwords.newPass || !passwords.confirm) {
      setPwError("Please fill in all password fields.");
      return;
    }
    if (passwords.newPass !== passwords.confirm) {
      setPwError("New passwords do not match.");
      return;
    }
    if (passwords.newPass.length < 6) {
      setPwError("Password must be at least 6 characters.");
      return;
    }

    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, passwords.current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwords.newPass);

      setPwSaved(true);
      setPasswords({ current: "", newPass: "", confirm: "" });
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      console.error("Failed to update password:", err);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setPwError("Current password is incorrect.");
      } else {
        setPwError("Could not update password. Please try again.");
      }
    }
  };

  if (loading) {
    return (
      <div className="fam-page-wrapper">
        <FamilyTopbar title="My Account" greeting="Loading account information..." />
        <p style={{ padding: "20px 0", color: "#6b7280" }}>
          <i className="fas fa-spinner fa-spin"></i> Loading account information...
        </p>
      </div>
    );
  }

  return (
    <div className="fam-page-wrapper">
      {/* Top Bar */}
      <FamilyTopbar title="My Account" greeting="Manage your personal information and security" />

      <div className="facct-grid">
        {/* Account Information Card */}
        <div className="fam-container">
          <div className="facct-header">
            <h2>
              <i className="fas fa-user-circle" style={{ color: "#3670AF", marginRight: "8px" }}></i>{" "}
              Profile Information
            </h2>
          </div>

          <div className="facct-profile-row">
            <div className="facct-profile-avatar">{getInitials(form.fullName)}</div>
            <div>
              <p className="facct-profile-name">{form.fullName || "Family Member"}</p>
              <p className="facct-profile-role">Family Account</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="facct-form">
            <div className="facct-form-row">
              <div className="facct-field">
                <label className="facct-label">Full Name</label>
                <div className="facct-input-wrap">
                  <i className="fas fa-user facct-input-icon"></i>
                  <input
                    type="text"
                    name="fullName"
                    className="facct-input"
                    value={form.fullName}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="facct-field">
                <label className="facct-label">Email Address</label>
                <div className="facct-input-wrap">
                  <i className="fas fa-envelope facct-input-icon"></i>
                  <input
                    type="email"
                    name="email"
                    className="facct-input facct-input--disabled"
                    value={form.email}
                    disabled
                  />
                </div>
                <p className="facct-field-note">
                  <i className="fas fa-info-circle"></i> Contact administration to change your email
                </p>
              </div>
            </div>

            <div className="facct-form-row">
              <div className="facct-field">
                <label className="facct-label">Phone Number</label>
                <div className="facct-input-wrap">
                  <i className="fas fa-phone facct-input-icon"></i>
                  <input
                    type="text"
                    name="phone"
                    className="facct-input"
                    value={form.phone}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="facct-field">
                <label className="facct-label">Relationship to Deceased</label>
                <div className="facct-input-wrap">
                  <i className="fas fa-users facct-input-icon"></i>
                  <input
                    type="text"
                    name="relationship"
                    className="facct-input"
                    value={form.relationship}
                    onChange={handleFormChange}
                  />
                </div>
              </div>
            </div>

            <div className="facct-field">
              <label className="facct-label">Address</label>
              <div className="facct-input-wrap">
                <i className="fas fa-home facct-input-icon"></i>
                <input
                  type="text"
                  name="address"
                  className="facct-input"
                  value={form.address}
                  onChange={handleFormChange}
                />
              </div>
            </div>

            {saveError && (
              <p className="facct-error">
                <i className="fas fa-exclamation-triangle"></i> {saveError}
              </p>
            )}

            <div className="facct-actions">
              <button type="submit" className="fam-btn-primary">
                {saved ? (
                  <>
                    <i className="fas fa-check"></i> Saved!
                  </>
                ) : (
                  <>
                    <i className="fas fa-save"></i> Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security / Change Password Card */}
        <div className="fam-container">
          <div className="facct-header">
            <h2>
              <i className="fas fa-shield-alt" style={{ color: "#d4af37", marginRight: "8px" }}></i>{" "}
              Security & Password
            </h2>
          </div>

          <form onSubmit={handleUpdatePassword} className="facct-form">
            <div className="facct-field">
              <label className="facct-label">Current Password</label>
              <div className="facct-input-wrap">
                <i className="fas fa-lock facct-input-icon"></i>
                <input
                  type="password"
                  name="current"
                  className="facct-input"
                  value={passwords.current}
                  onChange={handlePasswordChange}
                  placeholder="Enter current password"
                />
              </div>
            </div>

            <div className="facct-form-row">
              <div className="facct-field">
                <label className="facct-label">New Password</label>
                <div className="facct-input-wrap">
                  <i className="fas fa-key facct-input-icon"></i>
                  <input
                    type="password"
                    name="newPass"
                    className="facct-input"
                    value={passwords.newPass}
                    onChange={handlePasswordChange}
                    placeholder="Enter new password"
                  />
                </div>
              </div>

              <div className="facct-field">
                <label className="facct-label">Confirm Password</label>
                <div className="facct-input-wrap">
                  <i className="fas fa-key facct-input-icon"></i>
                  <input
                    type="password"
                    name="confirm"
                    className="facct-input"
                    value={passwords.confirm}
                    onChange={handlePasswordChange}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
            </div>

            {pwError && (
              <p className="facct-error">
                <i className="fas fa-exclamation-triangle"></i> {pwError}
              </p>
            )}

            <div className="facct-actions">
              <button type="submit" className="fam-btn-secondary">
                {pwSaved ? (
                  <>
                    <i className="fas fa-check" style={{ color: "#27ae60" }}></i> Password Updated
                  </>
                ) : (
                  <>
                    <i className="fas fa-lock"></i> Update Password
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer Note */}
      <div className="facct-footer-note">
        <i className="fas fa-info-circle" style={{ color: "#3670AF" }}></i>
        <span>
          Your account has view-only access to burial plots. Only administrators and staff can
          modify burial records and process transactions.
        </span>
      </div>
    </div>
  );
}

export default MyAccount;
