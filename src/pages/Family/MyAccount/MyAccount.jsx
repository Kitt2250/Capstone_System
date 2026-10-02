import { useState, useEffect } from "react";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import { findClientForUser, activateClientAccount } from "../../../services/clientServices";
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
  const [clientDocId, setClientDocId] = useState(null);

  const [passwords, setPasswords] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });

  const [saved, setSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [saveError, setSaveError] = useState("");

  // Load from clients collection matched to current auth user
  useEffect(() => {
    let unsubClients = () => {};

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch user doc for matching helpers
        let userDoc = null;
        try {
          const uSnap = await getDoc(doc(db, "users", user.uid));
          if (uSnap.exists()) userDoc = uSnap.data();
        } catch (_) {}

        // Subscribe to clients collection in real-time
        unsubClients();
        unsubClients = onSnapshot(collection(db, "clients"), (snap) => {
          const allClients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const matched = findClientForUser(user, userDoc, allClients);

          if (matched) {
            setClientDocId(matched.id);
            const firstName = matched.first_name || matched.firstName || "";
            const lastName = matched.last_name || matched.lastName || "";
            const fullName = matched.name || `${firstName} ${lastName}`.trim();

            setForm({
              fullName,
              email: matched.email || user.email || "",
              phone: matched.contact || matched.contactNumber || matched.phone || "",
              address: matched.address || "",
              relationship: matched.relationship || "",
            });
          } else {
            // Fallback: show auth email at minimum
            setForm((prev) => ({ ...prev, email: user.email || "" }));
          }

          setLoading(false);
        });
      } catch (err) {
        console.error("Failed to load client info:", err);
        setLoading(false);
      }
    });

    return () => {
      unsub();
      unsubClients();
    };
  }, []);

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaved(false);
    setSaveError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!clientDocId) {
      setSaveError("No linked client record found. Contact administration.");
      return;
    }

    try {
      await updateDoc(doc(db, "clients", clientDocId), {
        name: form.fullName,
        contact: form.phone,
        address: form.address,
        relationship: form.relationship,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save client info:", err);
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
      await activateClientAccount({
        currentPassword: passwords.current,
        newPassword: passwords.newPass,
        confirmPassword: passwords.confirm,
      });

      setPwSaved(true);
      setPasswords({ current: "", newPass: "", confirm: "" });
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      console.error("Failed to update password:", err);
      setPwError(err.message || "Could not update password. Please try again.");
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
                  <select
                    name="relationship"
                    className="facct-input"
                    value={form.relationship}
                    onChange={handleFormChange}
                    style={{ cursor: "pointer" }}
                  >
                    <option value="">Select relationship...</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Relative">Relative</option>
                    <option value="Other">Other</option>
                  </select>
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
              Security &amp; Password
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

    </div>
  );
}

export default MyAccount;
