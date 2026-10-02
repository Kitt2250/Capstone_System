import { useState, useEffect } from "react";
import {
    getRealPhilippineDate,
    getRealPhilippineISO,
    getRealPhilippineTimeISO,
    getSystemDate,
    getSystemDateISO,
    getSystemDateOverrideInfo,
    setSystemDateOverride,
    resetSystemDate,
    deleteSystemDateOverride,
    subscribeSystemDate,
    formatPhilippineDateTime,
    SYSTEM_COLLECTION,
    SYSTEM_DOC_ID
} from "../../../utils/systemDate";
import logAuditEvent from "../../../utils/auditLogger";
import { syncWakeSpaceStatusesController } from "../../../controller/wakeSpaceController";
import { syncOperationalAlertsController } from "../../../controller/notificationController";
import {
    Clock,
    RotateCcw,
    Calendar,
    CheckCircle,
    AlertTriangle,
    Zap,
    Building2,
    Info,
    ArrowRight,
    Trash2,
    FileText
} from "lucide-react";
import "./AdminAbuse.css";

function AdminAbuse() {
    // Current live ticking time
    const [realNow, setRealNow] = useState(getRealPhilippineDate());
    const [overrideInfo, setOverrideInfo] = useState(getSystemDateOverrideInfo());

    // Form inputs
    const [inputDate, setInputDate] = useState(getSystemDateISO());
    const [inputTime, setInputTime] = useState(getRealPhilippineTimeISO().slice(0, 5));
    const [note, setNote] = useState("");
    const [feedback, setFeedback] = useState(null);

    // Live clock ticker (every second)
    useEffect(() => {
        const interval = setInterval(() => {
            setRealNow(getRealPhilippineDate());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Subscribe to system date override changes
    useEffect(() => {
        const unsub = subscribeSystemDate((info) => {
            setOverrideInfo(info);
            setInputDate(info.activeDate);
            if (info.isOverridden && info.overrideTime) {
                setInputTime(info.overrideTime.slice(0, 5));
            }
        });
        return () => unsub();
    }, []);

    const effectiveDate = getSystemDate();

    // Quick jump calculation helpers (based on currently selected inputDate)
    const applyOffset = (days = 0, months = 0, years = 0) => {
        const base = inputDate ? new Date(`${inputDate}T12:00:00`) : getRealPhilippineDate();
        base.setFullYear(base.getFullYear() + years);
        base.setMonth(base.getMonth() + months);
        base.setDate(base.getDate() + days);

        const y = base.getFullYear();
        const m = String(base.getMonth() + 1).padStart(2, "0");
        const d = String(base.getDate()).padStart(2, "0");
        setInputDate(`${y}-${m}-${d}`);
    };

    // Handle Set Custom Date
    const handleApplyDate = async () => {
        if (!inputDate) {
            setFeedback({ type: "warning", message: "Please select a valid date." });
            return;
        }

        const timeToApply = inputTime ? `${inputTime}:00` : "00:00:00";
        await setSystemDateOverride(inputDate, timeToApply, note || "Manual override via Admin Configuration");

        // Log audit event
        try {
            await logAuditEvent({
                module: "Admin Configuration",
                actionType: "MODIFY_SYSTEM_DATE",
                description: `Simulated system date modified to ${inputDate} ${timeToApply} (PHT). Note: ${note || "None"}`,
                targetItem: inputDate,
                details: {
                    simulatedDate: inputDate,
                    simulatedTime: timeToApply,
                    realDateAtChange: getRealPhilippineISO(),
                    timezone: "Asia/Manila (UTC+8)"
                }
            });
        } catch (err) {
            console.warn("Could not record audit log for date change:", err);
        }

        // Auto-sync wake space booking statuses against the new system date
        let syncMsg = "";
        try {
            const syncRes = await syncWakeSpaceStatusesController();
            if (syncRes?.updatedCount > 0) {
                syncMsg = ` • Auto-synced ${syncRes.updatedCount} Wake Space booking lifecycle status(es)!`;
            }
        } catch (err) {
            console.warn("Wake space status sync error:", err);
        }

        // Auto-sync operational alerts (overdue & due-today installments, wake spaces, contracts)
        try {
            const notifCount = await syncOperationalAlertsController([], { forceNotify: true });
            if (notifCount > 0) {
                syncMsg += ` • Generated ${notifCount} alert(s)!`;
            }
        } catch (err) {
            console.warn("Operational alert sync error:", err);
        }

        setFeedback({
            type: "success",
            message: `System Date successfully changed to ${inputDate} ${timeToApply} (Philippines Time)!${syncMsg}`
        });
        setTimeout(() => setFeedback(null), 5000);
    };

    // Handle Reset Date to Today (Philippines Time)
    const handleResetDate = async () => {
        await resetSystemDate();
        const todayIso = getRealPhilippineISO();
        const timeIso = getRealPhilippineTimeISO().slice(0, 5);
        setInputDate(todayIso);
        setInputTime(timeIso);
        setNote("");

        // Log audit event
        try {
            await logAuditEvent({
                module: "Admin Configuration",
                actionType: "RESET_SYSTEM_DATE",
                description: `System date reset back to real-time Philippines Time (${todayIso}).`,
                targetItem: todayIso,
                details: {
                    resetTo: todayIso,
                    timezone: "Asia/Manila (UTC+8)"
                }
            });
        } catch (err) {
            console.warn("Could not record audit log for date reset:", err);
        }

        // Auto-sync wake space booking statuses back to real today
        let syncMsg = "";
        try {
            const syncRes = await syncWakeSpaceStatusesController();
            if (syncRes?.updatedCount > 0) {
                syncMsg = ` • Restored ${syncRes.updatedCount} Wake Space booking status(es) for real today!`;
            }
        } catch (err) {
            console.warn("Wake space status sync error:", err);
        }

        // Auto-sync operational alerts back to real today
        try {
            const notifCount = await syncOperationalAlertsController([], { forceNotify: true });
            if (notifCount > 0) {
                syncMsg += ` • Checked ${notifCount} operational alert(s)!`;
            }
        } catch (err) {
            console.warn("Operational alert sync error:", err);
        }

        setFeedback({
            type: "success",
            message: `System Date reset to Real Today (${todayIso}) Philippines Time!${syncMsg}`
        });
        setTimeout(() => setFeedback(null), 5000);
    };

    // Handle Delete Admin Abuse Document directly from system_collection
    const handleDeleteAdminAbuse = async () => {
        try {
            await deleteSystemDateOverride();
            const todayIso = getRealPhilippineISO();
            const timeIso = getRealPhilippineTimeISO().slice(0, 5);
            setInputDate(todayIso);
            setInputTime(timeIso);
            setNote("");

            // Log audit event
            try {
                await logAuditEvent({
                    module: "Admin Configuration",
                    actionType: "DELETE_ADMIN_CONFIGURATION",
                    description: `Admin Configuration document deleted from system_collection. System reverted cleanly to normal Philippines Time.`,
                    targetItem: `${SYSTEM_COLLECTION}/${SYSTEM_DOC_ID}`,
                    details: {
                        collection: SYSTEM_COLLECTION,
                        document: SYSTEM_DOC_ID,
                        action: "DELETED",
                        stayNormalDate: todayIso,
                        timezone: "Asia/Manila (UTC+8)"
                    }
                });
            } catch (err) {
                console.warn("Could not record audit log for delete admin abuse:", err);
            }

            // Auto-sync wake space booking statuses back to real today
            let syncMsg = "";
            try {
                const syncRes = await syncWakeSpaceStatusesController();
                if (syncRes?.updatedCount > 0) {
                    syncMsg = ` • Restored ${syncRes.updatedCount} Wake Space booking status(es) for real today!`;
                }
            } catch (err) {
                console.warn("Wake space status sync error:", err);
            }

            // Auto-sync operational alerts back to real today
            try {
                const notifCount = await syncOperationalAlertsController([], { forceNotify: true });
                if (notifCount > 0) {
                    syncMsg += ` • Checked ${notifCount} operational alert(s)!`;
                }
            } catch (err) {
                console.warn("Operational alert sync error:", err);
            }

            setFeedback({
                type: "success",
                message: `Admin Configuration record permanently deleted from Firestore ${SYSTEM_COLLECTION}! The system stays 100% normal on real Philippines Time (${todayIso}).${syncMsg}`
            });
            setTimeout(() => setFeedback(null), 5000);
        } catch (err) {
            setFeedback({
                type: "warning",
                message: `Failed to delete from ${SYSTEM_COLLECTION}: ${err.message}`
            });
        }
    };

    // Manual sync handler
    const [syncing, setSyncing] = useState(false);
    const handleManualSync = async () => {
        setSyncing(true);
        try {
            const res = await syncWakeSpaceStatusesController();
            let alertMsg = "";
            try {
                const notifCount = await syncOperationalAlertsController([], { forceNotify: true });
                if (notifCount > 0) {
                    alertMsg = ` • Updated ${notifCount} operational alert(s)!`;
                }
            } catch (notifErr) {
                console.warn("Manual alert sync error:", notifErr);
            }

            setFeedback({
                type: "success",
                message: (res.updatedCount > 0
                    ? `Synchronized ${res.updatedCount} Wake Space booking status(es) successfully!`
                    : "All Wake Space booking statuses are already up to date with the current system date.") + alertMsg
            });
        } catch (err) {
            setFeedback({ type: "warning", message: "Failed to sync statuses: " + err.message });
        } finally {
            setSyncing(false);
            setTimeout(() => setFeedback(null), 5000);
        }
    };

    // Format Philippine Time strings for display
    const realDateFormatted = realNow.toLocaleDateString("en-US", {
        timeZone: "Asia/Manila",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const realTimeFormatted = realNow.toLocaleTimeString("en-US", {
        timeZone: "Asia/Manila",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    const effectiveDateFormatted = effectiveDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const effectiveTimeFormatted = overrideInfo.isOverridden
        ? `${overrideInfo.overrideTime} (Fixed)`
        : realTimeFormatted;

    return (
        <div>
            <div className="admin-abuse-container">
                {/* Feedback Notification Box */}
                {feedback && (
                    <div className={`abuse-alert-box ${feedback.type}`}>
                        {feedback.type === "success" ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                        <span>{feedback.message}</span>
                    </div>
                )}

                {/* Clocks Comparison Grid */}
                <div className="admin-abuse-clocks-grid">
                    {/* Real Time Clock */}
                    <div className="clock-card">
                        <div className="clock-card-header">
                            <span className="clock-card-label">
                                <Clock size={15} />
                                Real Philippines Time (Asia/Manila)
                            </span>
                            <span className="pht-badge" style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                                Live UTC+8
                            </span>
                        </div>
                        <div className="clock-time-display">
                            {realTimeFormatted}
                        </div>
                        <div className="clock-date-display">
                            {realDateFormatted}
                        </div>
                        <div className="clock-meta-sub">
                            <Info size={13} />
                            <span>Actual wall-clock time in the Philippines</span>
                        </div>
                    </div>

                    {/* Effective System Date Clock */}
                    <div className={`clock-card effective ${overrideInfo.isOverridden ? "active-simulated" : ""}`}>
                        <div className="clock-card-header">
                            <span className="clock-card-label">
                                <Zap size={15} />
                                Effective Application System Date
                            </span>
                            {overrideInfo.isOverridden ? (
                                <span className="abuse-status-pill simulated" style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                                    OVERRIDDEN
                                </span>
                            ) : (
                                <span className="abuse-status-pill real" style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                                    MATCHING REAL TIME
                                </span>
                            )}
                        </div>
                        <div className="clock-time-display">
                            {effectiveTimeFormatted}
                        </div>
                        <div className="clock-date-display">
                            {effectiveDateFormatted}
                        </div>
                        <div className="clock-meta-sub">
                            {overrideInfo.isOverridden ? (
                                <span style={{ color: "#b45309", fontWeight: 600 }}>
                                    ⚠️ System modules will perceive today as: {overrideInfo.overrideDate}
                                </span>
                            ) : (
                                <span>All modules are operating on genuine current date.</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Control Panel: Modify Date */}
                <div className="control-panel-card">
                    <h3 className="control-panel-title">
                        <Calendar size={18} />
                        Set System Date &amp; Time (Philippines Time)
                    </h3>

                    {/* Inputs */}
                    <div className="control-inputs-row">
                        <div className="control-field">
                            <label className="control-label">
                                <Calendar size={14} />
                                System Date (PHT)
                            </label>
                            <input
                                type="date"
                                className="control-input"
                                value={inputDate}
                                onChange={(e) => setInputDate(e.target.value)}
                            />
                        </div>

                        <div className="control-field">
                            <label className="control-label">
                                <Clock size={14} />
                                Time (HH:mm - Optional)
                            </label>
                            <input
                                type="time"
                                className="control-input"
                                value={inputTime}
                                onChange={(e) => setInputTime(e.target.value)}
                            />
                        </div>

                        <div className="control-field" style={{ flex: 1.5 }}>
                            <label className="control-label">
                                <FileText size={14} />
                                Reason / Testing Note (Optional)
                            </label>
                            <input
                                type="text"
                                className="control-input"
                                placeholder="e.g., Testing Wake Space reservation expiry or installment renewal..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="quick-presets-group">
                        <span className="quick-presets-label">Quick Jump Presets:</span>
                        <div className="quick-presets-buttons">
                            <button type="button" className="preset-btn" onClick={() => applyOffset(1)}>
                                +1 Day (Tomorrow)
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(3)}>
                                +3 Days
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(7)}>
                                +1 Week
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(0, 1)}>
                                +1 Month
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(0, 6)}>
                                +6 Months
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(0, 0, 1)}>
                                +1 Year
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(-1)}>
                                -1 Day (Yesterday)
                            </button>
                            <button type="button" className="preset-btn" onClick={() => applyOffset(0, -1)}>
                                -1 Month
                            </button>
                            <button
                                type="button"
                                className="preset-btn"
                                style={{ color: "#004d8c", fontWeight: 700 }}
                                onClick={() => {
                                    setInputDate(getRealPhilippineISO());
                                    setInputTime(getRealPhilippineTimeISO().slice(0, 5));
                                }}
                            >
                                Set to Today's Real Date
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="control-actions-bar">
                        <button
                            type="button"
                            className="btn-apply-date"
                            onClick={handleApplyDate}
                        >
                            <CheckCircle size={18} />
                            Apply System Date
                        </button>

                        <button
                            type="button"
                            className="btn-reset-date"
                            onClick={handleResetDate}
                            title="Restore system date to actual real-time today in the Philippines"
                        >
                            <RotateCcw size={17} />
                            Reset to Today (Real PHT)
                        </button>

                        <button
                            type="button"
                            className="btn-delete-abuse"
                            onClick={handleDeleteAdminAbuse}
                            title="Completely delete Admin Configuration document from system_collection so system stays normal"
                        >
                            <Trash2 size={16} />
                            Delete Admin Configuration Doc
                        </button>

                        <button
                            type="button"
                            className="btn-action-outline"
                            style={{ marginLeft: "auto", height: "42px", gap: "8px" }}
                            onClick={handleManualSync}
                            disabled={syncing}
                            title="Re-evaluate all Wake Space booking statuses against current system date"
                        >
                            <Building2 size={16} />
                            {syncing ? "Syncing..." : "Sync Wake Space Statuses"}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default AdminAbuse;
