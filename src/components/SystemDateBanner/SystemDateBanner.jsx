import { useState, useEffect } from "react";
import { Link } from "react-router";
import { getSystemDateOverrideInfo, resetSystemDate, subscribeSystemDate } from "../../utils/systemDate";
import { Zap, RotateCcw, ArrowRight } from "lucide-react";
import "./SystemDateBanner.css";

function SystemDateBanner() {
    const [overrideInfo, setOverrideInfo] = useState(getSystemDateOverrideInfo());

    useEffect(() => {
        const unsub = subscribeSystemDate((info) => {
            setOverrideInfo(info);
        });
        return () => unsub();
    }, []);

    if (!overrideInfo.isOverridden) return null;

    return (
        <div className="system-date-banner">
            <div className="system-date-banner-content">
                <span className="system-date-badge">
                    <Zap size={13} />
                    SIMULATED DATE ACTIVE
                </span>
                <span className="system-date-text">
                    App is running on: <strong>{overrideInfo.overrideDate} {overrideInfo.overrideTime} (PHT)</strong>
                    <span className="system-date-real"> — Real: {overrideInfo.realDate}</span>
                </span>
            </div>

            <div className="system-date-banner-actions">
                <button
                    type="button"
                    className="system-date-reset-btn"
                    onClick={() => resetSystemDate()}
                    title="Reset to today's real date (Philippines Time)"
                >
                    <RotateCcw size={13} />
                    Reset to Today
                </button>
                <Link to="/admin/admin-configuration" className="system-date-manage-link">
                    Manage Date
                    <ArrowRight size={13} />
                </Link>
            </div>
        </div>
    );
}

export default SystemDateBanner;
