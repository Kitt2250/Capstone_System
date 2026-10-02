import { useState, useEffect } from "react";
import { handleLogin } from "../../controller/LoginController";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase/config";
import cherubimHeavenBg from "../../assets/cherubim_heaven_background.jpg";
import cherubimLogoWithName from "../../assets/cherubim_logo_with_name.png";
import "./Login.css";

function Login({ initialView = "login" }) {
    const [view, setView] = useState(() => {
        return initialView === "forgot" || (typeof window !== "undefined" && window.location.pathname.includes("forgot"))
            ? "forgot"
            : "login";
    });

    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [resetSubmitted, setResetSubmitted] = useState(false);

    // Auto-return to login view 6s after successful reset email send
    useEffect(() => {
        if (resetSubmitted) {
            const timer = setTimeout(() => {
                setResetSubmitted(false);
                setView("login");
            }, 6000);
            return () => clearTimeout(timer);
        }
    }, [resetSubmitted]);

    // Handle standard login
    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await handleLogin(email, password);
            // onAuthStateChanged in App.jsx will automatically navigate to the user's role route
        } catch (err) {
            setError(err.message || "Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    // Handle password reset
    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError("Please enter a valid, correctly formatted email address.");
            return;
        }

        setLoading(true);
        try {
            const actionCodeSettings = {
                url: window.location.origin + "/login",
                handleCodeInApp: false,
            };
            await sendPasswordResetEmail(auth, email, actionCodeSettings);
            setResetSubmitted(true);
        } catch (err) {
            console.error(err);
            if (err.code === "auth/user-not-found") {
                setError("No account found with that email.");
            } else if (err.code === "auth/invalid-email") {
                setError("Please enter a valid email address.");
            } else {
                setError("Something went wrong. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const switchToForgot = () => {
        setError("");
        setResetSubmitted(false);
        setView("forgot");
        if (typeof window !== "undefined" && window.history.pushState) {
            window.history.pushState(null, "", "/forgot-password");
        }
    };

    const switchToLogin = () => {
        setError("");
        setResetSubmitted(false);
        setView("login");
        if (typeof window !== "undefined" && window.history.pushState) {
            window.history.pushState(null, "", "/login");
        }
    };

    return (
        <div
            className="login-wrapper"
            style={{ backgroundImage: `url(${cherubimHeavenBg})` }}
        >
            <div className="login-overlay" />

            <div className="login-center">
                {/* Brand Logo & Subtitle */}
                <div className="login-brand">
                    <img
                        src={cherubimLogoWithName}
                        alt="Cherubim of Heaven Memorial Park"
                        className="login-logo-img"
                    />
                    <p className="login-subtitle">
                        Memorial Services Management System
                    </p>
                </div>

                {/* Main Card */}
                {view === "login" ? (
                    <div className="login-card">
                        <h2 className="login-card-title">Sign in to your account</h2>

                        <form onSubmit={handleLoginSubmit} className="login-form">
                            {/* Email */}
                            <div className="login-field">
                                <label htmlFor="login-email" className="login-label">
                                    Email
                                </label>
                                <input
                                    id="login-email"
                                    type="email"
                                    className="login-input"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        setError("");
                                    }}
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div className="login-field">
                                <label htmlFor="login-password" className="login-label">
                                    Password
                                </label>
                                <div className="login-password-wrap">
                                    <input
                                        id="login-password"
                                        type={showPassword ? "text" : "password"}
                                        className="login-input login-input--password"
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            setError("");
                                        }}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="login-eye-btn"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                width="17"
                                                height="17"
                                            >
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                width="17"
                                                height="17"
                                            >
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Error Alert */}
                            {error && <p className="login-error">{error}</p>}

                            {/* Forgot Password Link */}
                            <div className="login-forgot-row">
                                <button
                                    type="button"
                                    className="login-forgot-link"
                                    onClick={switchToForgot}
                                >
                                    Forgot Password?
                                </button>
                            </div>

                            {/* Sign In Submit Button */}
                            <button
                                type="submit"
                                className="login-submit-btn"
                                disabled={loading}
                            >
                                {loading ? "Signing in..." : "Sign In"}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="login-card fp-card-center">
                        {!resetSubmitted ? (
                            <>
                                {/* Mail Icon Header */}
                                <div className="fp-icon-wrap">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#2563eb"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        width="28"
                                        height="28"
                                    >
                                        <rect x="2" y="4" width="20" height="16" rx="2" />
                                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                    </svg>
                                </div>

                                <h2 className="fp-card-title">Forgot your password?</h2>
                                <p className="fp-card-desc">
                                    Enter your email address and we'll send you a link to reset your password.
                                </p>

                                <form onSubmit={handleForgotSubmit} className="login-form">
                                    <div className="login-field">
                                        <label htmlFor="fp-email" className="login-label">
                                            Email
                                        </label>
                                        <input
                                            id="fp-email"
                                            type="email"
                                            className="login-input"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => {
                                                setEmail(e.target.value);
                                                setError("");
                                            }}
                                            required
                                        />
                                    </div>

                                    {error && <p className="login-error">{error}</p>}

                                    <button
                                        type="submit"
                                        className="login-submit-btn"
                                        disabled={loading}
                                    >
                                        {loading ? "Sending..." : "Send Reset Link"}
                                    </button>

                                    <button
                                        type="button"
                                        className="fp-back-btn"
                                        onClick={switchToLogin}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            width="15"
                                            height="15"
                                        >
                                            <line x1="19" y1="12" x2="5" y2="12" />
                                            <polyline points="12 19 5 12 12 5" />
                                        </svg>
                                        Back to Sign In
                                    </button>
                                </form>
                            </>
                        ) : (
                            <>
                                {/* Success Icon */}
                                <div className="fp-success-icon">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#16a34a"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        width="32"
                                        height="32"
                                    >
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                </div>
                                <h2 className="fp-card-title">Check your email</h2>
                                <p className="fp-card-desc">
                                    We sent a password reset link to <strong>{email}</strong>. Please check your inbox.
                                </p>
                                <button
                                    type="button"
                                    className="login-submit-btn"
                                    onClick={switchToLogin}
                                >
                                    Back to Sign In
                                </button>
                                <button
                                    type="button"
                                    className="fp-resend-btn"
                                    onClick={() => setResetSubmitted(false)}
                                >
                                    Didn't receive it? Try again
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Login;