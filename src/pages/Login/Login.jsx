import { useState } from "react";
import { handleLogin } from "../../controller/LoginController";

function Login() {

    const [form, setForm] = useState({
        email: "",
        password: ""
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit() {
        setError("");
        setLoading(true);

        try {
            const user = await handleLogin(
                form.email,
                form.password
            );

            console.log("Logged in:", user);

            alert("Login successful!");

            setForm({
                email: "",
                password: ""
            });

        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <h1>Login</h1>

            <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => {
                    setForm({
                        ...form,
                        email: e.target.value
                    });
                }}
            />

            <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => {
                    setForm({
                        ...form,
                        password: e.target.value
                    });
                }}
            />

            <button
                onClick={handleSubmit}
                disabled={loading}
            >
                {loading ? "Logging in..." : "Login"}
            </button>

            {error && <p>{error}</p>}
        </>
    );
}

export default Login