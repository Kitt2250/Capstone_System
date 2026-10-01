import React, { useState, useEffect } from "react";
import Header from "../../../components/Header/Header";
import { User, ShieldCheck, Save, Key, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { auth } from "../../../firebase/config";
import { onAuthStateChanged } from "firebase/auth";
import {
    getUserProfileController,
    updateUserProfileController,
    changePasswordController
} from "../../../controller/userController";
import "./StaffMyAccount.css";

export default function StaffMyAccount() {
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Password update state
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [passwordFeedback, setPasswordFeedback] = useState(null);

    // Profile form state
    const [profile, setProfile] = useState({
        fullName: "",
        email: "",
        phone: "",
        address: ""
    });

    // Security / Password form state
    const [passwords, setPasswords] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    // Password visibility toggles
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // ── Load currently logged-in staff profile from Firestore ──
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUserId(user.uid);
                try {
                    setLoading(true);
                    const userData = await getUserProfileController(user.uid);

                    setProfile({
                        fullName: userData?.name || user.displayName || "",
                        email: userData?.email || user.email || "",
                        phone: userData?.contactNo || userData?.phone || "",
                        address: userData?.address || ""
                    });
                } catch (err) {
                    console.error("Failed to load staff profile:", err);
                    // Fallback to auth details if firestore read fails
                    setProfile({
                        fullName: user.displayName || "",
                        email: user.email || "",
                        phone: "",
                        address: ""
                    });
                } finally {
                    setLoading(false);
                }
            } else {
                setCurrentUserId(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const handleProfileChange = (e) => {
        const { name, value } = e.target;
        setProfile((prev) => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswords((prev) => ({ ...prev, [name]: value }));
    };

    // ── Save Profile using controller & service ──
    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        if (!currentUserId) return;

        try {
            setSaving(true);
            setFeedback(null);

            await updateUserProfileController(currentUserId, profile);

            setFeedback({
                type: "success",
                message: "Profile updated successfully!"
            });

            setTimeout(() => setFeedback(null), 4000);
        } catch (err) {
            console.error("Failed to update profile:", err);
            setFeedback({
                type: "error",
                message: err.message || "Failed to update profile."
            });
            setTimeout(() => setFeedback(null), 5000);
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        try {
            setUpdatingPassword(true);
            setPasswordFeedback(null);

            await changePasswordController(passwords);

            setPasswordFeedback({
                type: "success",
                message: "Password updated successfully!"
            });

            // Clear password inputs on successful update
            setPasswords({
                currentPassword: "",
                newPassword: "",
                confirmPassword: ""
            });

            setTimeout(() => setPasswordFeedback(null), 4000);
        } catch (err) {
            console.error("Failed to update password:", err);
            setPasswordFeedback({
                type: "error",
                message: err.message || "Failed to update password."
            });
            setTimeout(() => setPasswordFeedback(null), 5000);
        } finally {
            setUpdatingPassword(false);
        }
    };

    return (
        <div className="staff-account-page">
            <Header page="my-accounts" />

            {/* ── Card 1: Edit Profile ── */}
            <div className="staff-account-card">
                <div className="staff-account-card-header">
                    <div className="staff-account-icon-wrap">
                        <User size={20} />
                    </div>
                    <div className="staff-account-header-text">
                        <h2>Edit Profile</h2>
                        <p>Update your personal details and contact information.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="staff-account-loading">
                        <Loader2 size={20} className="staff-spin" />
                        <span>Loading staff profile...</span>
                    </div>
                ) : (
                    <form onSubmit={handleProfileSubmit}>
                        <div className="staff-account-form-grid">
                            <div className="staff-account-form-group span-1">
                                <label className="staff-account-label" htmlFor="fullName">
                                    Full Name
                                </label>
                                <input
                                    id="fullName"
                                    name="fullName"
                                    type="text"
                                    className="staff-account-input"
                                    placeholder="Enter full name"
                                    value={profile.fullName}
                                    onChange={handleProfileChange}
                                    required
                                />
                            </div>

                            <div className="staff-account-form-group span-1">
                                <label className="staff-account-label" htmlFor="email">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    className="staff-account-input"
                                    placeholder="Enter email address"
                                    value={profile.email}
                                    onChange={handleProfileChange}
                                    required
                                />
                            </div>

                            <div className="staff-account-form-group span-1">
                                <label className="staff-account-label" htmlFor="phone">
                                    Phone Number
                                </label>
                                <input
                                    id="phone"
                                    name="phone"
                                    type="text"
                                    className="staff-account-input"
                                    placeholder="Enter phone number"
                                    value={profile.phone}
                                    onChange={handleProfileChange}
                                    required
                                />
                            </div>

                            <div className="staff-account-form-group span-1">
                                <label className="staff-account-label" htmlFor="address">
                                    Home Address
                                </label>
                                <input
                                    id="address"
                                    name="address"
                                    type="text"
                                    className="staff-account-input"
                                    placeholder="Enter home address"
                                    value={profile.address}
                                    onChange={handleProfileChange}
                                />
                            </div>
                        </div>

                        {/* Profile Feedback Notification */}
                        {feedback && (
                            <div className={`staff-account-feedback ${feedback.type}`}>
                                {feedback.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                <span>{feedback.message}</span>
                            </div>
                        )}

                        <div className="staff-account-actions-right">
                            <button
                                type="submit"
                                className="staff-btn-primary"
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={16} className="staff-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* ── Card 2: Security Settings ── */}
            <div className="staff-account-card">
                <div className="staff-account-card-header">
                    <div className="staff-account-icon-wrap security">
                        <ShieldCheck size={20} />
                    </div>
                    <div className="staff-account-header-text">
                        <h2>Security Settings</h2>
                        <p>Change your password to keep your account secure.</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordSubmit}>
                    <div className="staff-account-security-stack">
                        <div className="staff-account-form-group">
                            <label className="staff-account-label" htmlFor="currentPassword">
                                Current Password
                            </label>
                            <div className="staff-account-input-wrapper">
                                <input
                                    id="currentPassword"
                                    name="currentPassword"
                                    type={showCurrent ? "text" : "password"}
                                    className="staff-account-input"
                                    placeholder="Enter current password"
                                    value={passwords.currentPassword}
                                    onChange={handlePasswordChange}
                                />
                                <button
                                    type="button"
                                    className="staff-account-pw-toggle"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                    title={showCurrent ? "Hide password" : "Show password"}
                                >
                                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="staff-account-form-group">
                            <label className="staff-account-label" htmlFor="newPassword">
                                New Password
                            </label>
                            <div className="staff-account-input-wrapper">
                                <input
                                    id="newPassword"
                                    name="newPassword"
                                    type={showNew ? "text" : "password"}
                                    className="staff-account-input"
                                    placeholder="Enter new password"
                                    value={passwords.newPassword}
                                    onChange={handlePasswordChange}
                                />
                                <button
                                    type="button"
                                    className="staff-account-pw-toggle"
                                    onClick={() => setShowNew(!showNew)}
                                    title={showNew ? "Hide password" : "Show password"}
                                >
                                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="staff-account-form-group">
                            <label className="staff-account-label" htmlFor="confirmPassword">
                                Confirm New Password
                            </label>
                            <div className="staff-account-input-wrapper">
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirm ? "text" : "password"}
                                    className="staff-account-input"
                                    placeholder="Confirm new password"
                                    value={passwords.confirmPassword}
                                    onChange={handlePasswordChange}
                                />
                                <button
                                    type="button"
                                    className="staff-account-pw-toggle"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    title={showConfirm ? "Hide password" : "Show password"}
                                >
                                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Password Feedback Notification (Positioned at bottom above button) */}
                        {passwordFeedback && (
                            <div className={`staff-account-feedback ${passwordFeedback.type}`}>
                                {passwordFeedback.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                <span>{passwordFeedback.message}</span>
                            </div>
                        )}
                    </div>

                    <div className="staff-account-actions-left">
                        <button
                            type="submit"
                            className="staff-btn-secondary"
                            disabled={updatingPassword}
                        >
                            {updatingPassword ? (
                                <>
                                    <Loader2 size={16} className="staff-spin" />
                                    Updating...
                                </>
                            ) : (
                                <>
                                    <Key size={16} />
                                    Update Password
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
