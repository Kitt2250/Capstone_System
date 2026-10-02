import { useState, useEffect } from "react";
import {
    Lock,
    KeyRound,
    Eye,
    EyeOff,
    ShieldAlert,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    LogOut,
    Loader2,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../../firebase/config";
import { activateFamilyAccountController } from "../../../controller/userController";
import "./ActivateAccountModal.css";

/**
 * ActivateAccountModal
 * 
 * Non-closeable modal displayed to family clients when `isActivate === false`.
 * Forces client to set a new password before accessing the family portal.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal should be visible
 * @param {Object} [props.clientDoc] - Client Firestore document data
 * @param {Object} [props.userDoc] - User Firestore document data
 * @param {() => void} [props.onActivated] - Callback fired upon successful activation
 */
export default function ActivateAccountModal({
    isOpen,
    clientDoc = null,
    userDoc = null,
    onActivated,
}) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [loading, setLoading] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Lock page scrolling while modal is active
    useEffect(() => {
        if (!isOpen) return;

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        // Prevent ESC key from closing
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    // Real-time criteria evaluations
    const isMinLength = newPassword.length >= 8;
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>_\-+~=[\]\\/`]/.test(newPassword);
    const isMatch =
        newPassword.length > 0 &&
        confirmPassword.length > 0 &&
        newPassword === confirmPassword;
    const isDifferent =
        newPassword.length > 0 &&
        currentPassword.length > 0 &&
        newPassword !== currentPassword;

    const canSubmit =
        currentPassword.trim().length > 0 &&
        isMinLength &&
        hasSymbol &&
        isMatch &&
        !loading &&
        !successMsg;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!currentPassword.trim()) {
            setError("Please enter your current password.");
            return;
        }

        if (newPassword.length < 8) {
            setError("New password must be at least 8 characters long.");
            return;
        }

        const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-+~=[\]\\/`]/;
        if (!specialCharRegex.test(newPassword)) {
            setError("New password must contain at least one special character / symbol (e.g. !@#$%^&*).");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("New password and confirm password do not match.");
            return;
        }

        if (currentPassword === newPassword) {
            setError("New password cannot be the same as your current password.");
            return;
        }

        setLoading(true);

        try {
            const res = await activateFamilyAccountController({
                currentPassword,
                newPassword,
                confirmPassword,
                targetClientId: clientDoc?.id || null,
            });

            setSuccessMsg(
                res.message || "Password updated! Your account has been activated."
            );

            // Wait briefly for the user to see the success state
            setTimeout(() => {
                if (onActivated) {
                    onActivated();
                }
            }, 1200);
        } catch (err) {
            console.error("Activation failed:", err);
            setError(err.message || "Failed to update password. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        try {
            setSigningOut(true);
            await signOut(auth);
            // App.jsx routing handles redirection to /login
        } catch (err) {
            console.error("Sign out error:", err);
            setSigningOut(false);
        }
    };

    const clientName =
        (clientDoc?.first_name || clientDoc?.last_name)
            ? `${clientDoc.first_name || ""} ${clientDoc.last_name || ""}`.trim()
            : userDoc?.name || auth.currentUser?.displayName || "Family Member";

    const clientEmail =
        clientDoc?.email || userDoc?.email || auth.currentUser?.email || "";

    return (
        <div
            className="activate-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activate-modal-title"
            onClick={(e) => {
                // Strictly non-closeable: clicking overlay does nothing
                e.stopPropagation();
            }}
        >
            <div
                className="activate-modal-card"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="activate-modal-header">
                    <div
                        className={`activate-icon-wrapper ${
                            successMsg ? "success" : ""
                        }`}
                    >
                        {successMsg ? (
                            <CheckCircle2 size={32} />
                        ) : (
                            <ShieldAlert size={32} />
                        )}
                    </div>


                    <h2 id="activate-modal-title" className="activate-modal-title">
                        {successMsg
                            ? "Account Activated!"
                            : "Set Your New Password"}
                    </h2>

                    <p className="activate-modal-desc">
                        {successMsg
                            ? "Your password has been changed. Accessing your family portal..."
                            : "For your security, please update your password to activate your family account before continuing."}
                    </p>
                </div>

                {/* Account Details Banner */}
                <div className="activate-user-banner">
                    <div className="activate-user-info">
                        <span className="activate-user-name">{clientName}</span>
                        {clientEmail && (
                            <span className="activate-user-email">
                                {clientEmail}
                            </span>
                        )}
                    </div>
                    <span className="activate-status-tag">
                        Pending Activation
                    </span>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="activate-error-box">
                        <AlertCircle size={18} className="activate-error-icon" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                    <div className="activate-success-box">
                        <CheckCircle2 size={20} />
                        <span>{successMsg}</span>
                    </div>
                )}

                {/* Change Password Form */}
                {!successMsg && (
                    <form onSubmit={handleSubmit} className="activate-form" noValidate>
                        {/* Current Password */}
                        <div className="activate-form-group">
                            <label className="activate-label" htmlFor="current-pass">
                                Current Password
                            </label>
                            <div className="activate-input-wrapper">
                                <Lock size={16} className="activate-input-icon" />
                                <input
                                    id="current-pass"
                                    type={showCurrent ? "text" : "password"}
                                    className="activate-input"
                                    placeholder="Enter current password"
                                    value={currentPassword}
                                    onChange={(e) => {
                                        setCurrentPassword(e.target.value);
                                        if (error) setError("");
                                    }}
                                    autoComplete="current-password"
                                    disabled={loading}
                                    required
                                />
                                <button
                                    type="button"
                                    className="activate-toggle-btn"
                                    onClick={() => setShowCurrent((p) => !p)}
                                    title={showCurrent ? "Hide password" : "Show password"}
                                    tabIndex={-1}
                                >
                                    {showCurrent ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* New Password */}
                        <div className="activate-form-group">
                            <label className="activate-label" htmlFor="new-pass">
                                New Password
                            </label>
                            <div className="activate-input-wrapper">
                                <KeyRound size={16} className="activate-input-icon" />
                                <input
                                    id="new-pass"
                                    type={showNew ? "text" : "password"}
                                    className="activate-input"
                                    placeholder="Enter new password (min. 6 chars)"
                                    value={newPassword}
                                    onChange={(e) => {
                                        setNewPassword(e.target.value);
                                        if (error) setError("");
                                    }}
                                    autoComplete="new-password"
                                    disabled={loading}
                                    required
                                />
                                <button
                                    type="button"
                                    className="activate-toggle-btn"
                                    onClick={() => setShowNew((p) => !p)}
                                    title={showNew ? "Hide password" : "Show password"}
                                    tabIndex={-1}
                                >
                                    {showNew ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="activate-form-group">
                            <label className="activate-label" htmlFor="confirm-pass">
                                Confirm New Password
                            </label>
                            <div className="activate-input-wrapper">
                                <KeyRound size={16} className="activate-input-icon" />
                                <input
                                    id="confirm-pass"
                                    type={showConfirm ? "text" : "password"}
                                    className="activate-input"
                                    placeholder="Re-enter new password"
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value);
                                        if (error) setError("");
                                    }}
                                    autoComplete="new-password"
                                    disabled={loading}
                                    required
                                />
                                <button
                                    type="button"
                                    className="activate-toggle-btn"
                                    onClick={() => setShowConfirm((p) => !p)}
                                    title={showConfirm ? "Hide password" : "Show password"}
                                    tabIndex={-1}
                                >
                                    {showConfirm ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Real-time Checklist */}
                        <div className="activate-checklist">
                            <div
                                className={`activate-check-item ${
                                    isMinLength ? "valid" : ""
                                }`}
                            >
                                <span className="activate-check-dot"></span>
                                <span>At least 8 characters</span>
                            </div>

                            <div
                                className={`activate-check-item ${
                                    hasSymbol ? "valid" : ""
                                }`}
                            >
                                <span className="activate-check-dot"></span>
                                <span>At least 1 symbol / special character (!@#$%...)</span>
                            </div>

                            <div
                                className={`activate-check-item ${
                                    isMatch ? "valid" : ""
                                }`}
                            >
                                <span className="activate-check-dot"></span>
                                <span>Passwords match</span>
                            </div>

                            {currentPassword.length > 0 && newPassword.length > 0 && (
                                <div
                                    className={`activate-check-item ${
                                        isDifferent ? "valid" : ""
                                    }`}
                                >
                                    <span className="activate-check-dot"></span>
                                    <span>Different from current password</span>
                                </div>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="activate-submit-btn"
                            disabled={!canSubmit}
                        >
                            {loading ? (
                                <>
                                    <Loader2
                                        size={18}
                                        className="activate-spin"
                                    />
                                    <span>Activating Account...</span>
                                </>
                            ) : (
                                <>
                                    <span>Update Password & Activate</span>
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Footer / Sign Out Button */}
                <div className="activate-modal-footer">
                    <button
                        type="button"
                        className="activate-signout-btn"
                        onClick={handleSignOut}
                        disabled={signingOut}
                        title="Sign out of your account"
                    >
                        {signingOut ? (
                            <>
                                <Loader2 size={14} className="activate-spin" />
                                <span>Signing out...</span>
                            </>
                        ) : (
                            <>
                                <LogOut size={14} />
                                <span>Sign out of account</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
