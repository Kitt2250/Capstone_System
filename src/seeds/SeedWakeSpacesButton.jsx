/**
 * Temporary component to seed the wake_space collection.
 * Import and render this ONCE in any page, then remove it.
 *
 * Usage:  import SeedWakeSpaces from "../../seeds/SeedWakeSpacesButton";
 *         <SeedWakeSpaces />
 */
import { useState } from "react";
import { seedWakeSpaces } from "./seedWakeSpaces";

export default function SeedWakeSpacesButton() {
    const [status, setStatus] = useState("idle");
    const [results, setResults] = useState([]);

    const handleSeed = async () => {
        setStatus("seeding");
        try {
            const res = await seedWakeSpaces();
            setResults(res);
            setStatus("done");
        } catch (err) {
            setStatus("error");
            console.error(err);
        }
    };

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
            <button
                onClick={handleSeed}
                disabled={status === "seeding"}
                style={{
                    padding: "10px 24px",
                    background: status === "done" ? "#059669" : "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: status === "seeding" ? "wait" : "pointer",
                    fontWeight: 600,
                }}
            >
                {status === "idle" && "🌱 Seed Wake Spaces (A, B, C)"}
                {status === "seeding" && "⏳ Seeding..."}
                {status === "done" && "✅ Seeded!"}
                {status === "error" && "❌ Error — check console"}
            </button>

            {results.length > 0 && (
                <ul style={{ marginTop: 12 }}>
                    {results.map((r) => (
                        <li key={r.id} style={{ color: r.success ? "#059669" : "#ef4444" }}>
                            {r.id}: {r.success ? "✅ Success" : `❌ ${r.error}`}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
