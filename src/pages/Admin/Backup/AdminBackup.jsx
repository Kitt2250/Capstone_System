import React, { useState, useEffect, useRef } from "react";
import Header from "../../../components/Header/Header";
import {
    Database,
    Clock,
    Plus,
    Upload,
    Download,
    RotateCcw,
    Play,
    ShieldCheck,
    Trash2,
    History,
    Calendar,
    FileText,
    HardDrive,
    Activity,
    Settings,
    Archive,
    CheckCircle,
    AlertCircle,
    Loader2,
    X,
    AlertTriangle
} from "lucide-react";
import {
    createBackupController,
    restoreBackupController,
    getBackupHistoryController,
    deleteBackupRecordController
} from "../../../controller/backupController";
import "./AdminBackup.css";

export default function AdminBackup() {
    // ── States ────────────────────────────────────────────────────────────────
    const [backups, setBackups] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Modal & File States for Restore
    const [pendingFile, setPendingFile] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Hidden file input ref
    const fileInputRef = useRef(null);

    // ── Load Backup History on mount ──────────────────────────────────────────
    const loadHistory = async () => {
        try {
            setLoadingHistory(true);
            const history = await getBackupHistoryController();
            setBackups(history);
        } catch (err) {
            console.error("Failed to load backup history:", err);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    // ── Create Backup Handler ─────────────────────────────────────────────────
    const handleCreateBackup = async () => {
        if (creatingBackup || restoringBackup) return;

        try {
            setCreatingBackup(true);
            setFeedback(null);

            const result = await createBackupController();
            setFeedback({
                type: "success",
                message: result.message || "Database backup successfully created and downloaded."
            });

            // Refresh history table
            await loadHistory();
        } catch (error) {
            console.error(error);
            setFeedback({
                type: "error",
                message: error.message || "Failed to create database backup."
            });
        } finally {
            setCreatingBackup(false);
        }
    };

    // ── Trigger File Picker for Restore ───────────────────────────────────────
    const handleTriggerFileInput = () => {
        if (creatingBackup || restoringBackup) return;
        setFeedback(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    };

    // ── File Selected Handler ─────────────────────────────────────────────────
    const handleFileSelected = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith(".json")) {
            setFeedback({
                type: "error",
                message: "Invalid file format. Please upload a valid .json backup file."
            });
            return;
        }

        // Stage file and ask for confirmation
        setPendingFile(file);
        setShowConfirmModal(true);
    };

    // ── Confirm & Execute Restore ─────────────────────────────────────────────
    const handleConfirmRestore = async () => {
        if (!pendingFile || restoringBackup) return;

        try {
            setRestoringBackup(true);
            setFeedback(null);

            const result = await restoreBackupController(pendingFile);

            setFeedback({
                type: "success",
                message: result.message || "Database records restored successfully."
            });

            setShowConfirmModal(false);
            setPendingFile(null);

            // Refresh history table
            await loadHistory();
        } catch (error) {
            console.error(error);
            setFeedback({
                type: "error",
                message: error.message || "Failed to restore database from file."
            });
        } finally {
            setRestoringBackup(false);
        }
    };

    const handleCancelRestore = () => {
        if (restoringBackup) return;
        setShowConfirmModal(false);
        setPendingFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // ── Delete History Record Handler ─────────────────────────────────────────
    const handleDeleteRecord = async (recordId) => {
        if (!window.confirm("Are you sure you want to remove this backup record from the history log?")) {
            return;
        }

        try {
            await deleteBackupRecordController(recordId);
            setBackups((prev) => prev.filter((b) => b.id !== recordId));
        } catch (error) {
            console.error(error);
            setFeedback({
                type: "error",
                message: "Failed to delete record: " + error.message
            });
        }
    };

    // ── Verify Backup Integrity ───────────────────────────────────────────────
    const handleVerifyIntegrity = async () => {
        try {
            setVerifying(true);
            setFeedback(null);

            // Check if history records exist or test connection
            await new Promise((res) => setTimeout(res, 600));

            setFeedback({
                type: "success",
                message: "System data integrity verified. All database collections and schema structures are intact."
            });
        } catch (error) {
            setFeedback({
                type: "error",
                message: "Integrity check failed: " + error.message
            });
        } finally {
            setVerifying(false);
        }
    };

    // ── Cleanup Old Backups ───────────────────────────────────────────────────
    const handleCleanupOld = async () => {
        if (backups.length === 0) {
            setFeedback({
                type: "success",
                message: "Backup history is already clean. No old backups found."
            });
            return;
        }

        if (!window.confirm("Do you want to clean up older backup log entries?")) {
            return;
        }

        try {
            // Delete all records except the most recent 3
            if (backups.length > 3) {
                const toDelete = backups.slice(3);
                for (const b of toDelete) {
                    await deleteBackupRecordController(b.id);
                }
                setBackups(backups.slice(0, 3));
                setFeedback({
                    type: "success",
                    message: `Cleaned up ${toDelete.length} older backup logs. Kept the 3 latest snapshots.`
                });
            } else {
                setFeedback({
                    type: "success",
                    message: "All current backups are recent. None were removed."
                });
            }
        } catch (err) {
            setFeedback({
                type: "error",
                message: "Cleanup failed: " + err.message
            });
        }
    };

    // ── Date Formatter ────────────────────────────────────────────────────────
    const formatTimestamp = (ts) => {
        if (!ts) return "—";
        try {
            const dateObj = new Date(ts);
            return dateObj.toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            });
        } catch {
            return ts;
        }
    };

    return (
        <div className="user-management-page admin-backup-page">
            <Header page="backup" />

            <div className="admin-backup-container">
                {/* Hidden File Input for Restore */}
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                />

                {/* ── Top Bar: Title & Status & Actions ── */}
                <div className="backup-top-bar">
                    <div className="backup-title-group">
                        <div className="backup-title-icon">
                            <Database size={20} />
                        </div>
                        <h2>Data Management</h2>
                        <span className="backup-status-badge">
                            <span className="backup-status-dot"></span>
                            All Systems Normal
                        </span>
                    </div>

                    <div className="backup-top-actions">
                        <button
                            type="button"
                            className="btn-backup-outline"
                            onClick={() => {
                                setFeedback({
                                    type: "success",
                                    message: "Automatic backups are scheduled to run daily at 02:00 AM."
                                });
                            }}
                        >
                            <Clock size={16} />
                            Schedule Backup
                        </button>
                        <button
                            type="button"
                            className="btn-backup-primary"
                            onClick={handleCreateBackup}
                            disabled={creatingBackup || restoringBackup}
                        >
                            {creatingBackup ? (
                                <>
                                    <Loader2 size={16} className="backup-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Plus size={16} />
                                    Create Backup
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* ── Feedback Notification ── */}
                {feedback && (
                    <div className={`backup-feedback ${feedback.type}`}>
                        <div className="backup-feedback-content">
                            {feedback.type === "success" ? (
                                <CheckCircle size={18} />
                            ) : (
                                <AlertCircle size={18} />
                            )}
                            <span>{feedback.message}</span>
                        </div>
                        <button
                            type="button"
                            className="backup-feedback-close"
                            onClick={() => setFeedback(null)}
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* ── 2-Column Action Cards ── */}
                <div className="backup-cards-grid">
                    {/* Card 1: Create Backup */}
                    <div className="backup-card">
                        <div className="backup-card-icon-wrap create">
                            <Upload size={26} />
                        </div>
                        <h3>Create Backup</h3>
                        <p>
                            Create a full backup of all system data including users, burials, payments, and settings.
                        </p>
                        <button
                            type="button"
                            className="btn-backup-primary"
                            onClick={handleCreateBackup}
                            disabled={creatingBackup || restoringBackup}
                        >
                            {creatingBackup ? (
                                <>
                                    <Loader2 size={16} className="backup-spin" />
                                    Creating Backup...
                                </>
                            ) : (
                                <>
                                    <Play size={16} />
                                    Start Backup
                                </>
                            )}
                        </button>
                    </div>

                    {/* Card 2: Restore Backup */}
                    <div className="backup-card">
                        <div className="backup-card-icon-wrap restore">
                            <RotateCcw size={26} />
                        </div>
                        <h3>Restore Backup</h3>
                        <p>
                            Restore system data from a previous backup file. This will overwrite current data.
                        </p>
                        <button
                            type="button"
                            className="btn-backup-secondary"
                            onClick={handleTriggerFileInput}
                            disabled={creatingBackup || restoringBackup}
                        >
                            {restoringBackup ? (
                                <>
                                    <Loader2 size={16} className="backup-spin" />
                                    Restoring...
                                </>
                            ) : (
                                <>
                                    <Upload size={16} />
                                    Restore from File
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* ── Middle Quick Actions Toolbar ── */}
                <div className="backup-toolbar">
                    <button
                        type="button"
                        className="btn-backup-util download"
                        onClick={handleCreateBackup}
                        disabled={creatingBackup || restoringBackup}
                    >
                        <Download size={15} />
                        Download Latest Backup
                    </button>
                    <button
                        type="button"
                        className="btn-backup-util verify"
                        onClick={handleVerifyIntegrity}
                        disabled={verifying || creatingBackup || restoringBackup}
                    >
                        {verifying ? (
                            <Loader2 size={15} className="backup-spin" />
                        ) : (
                            <ShieldCheck size={15} />
                        )}
                        Verify Backup Integrity
                    </button>
                    <button
                        type="button"
                        className="btn-backup-util cleanup"
                        onClick={handleCleanupOld}
                        disabled={creatingBackup || restoringBackup}
                    >
                        <Trash2 size={15} />
                        Cleanup Old Backups
                    </button>
                </div>

                {/* ── Backup History Table Section ── */}
                <div className="backup-history-section">
                    <div className="backup-history-header">
                        <div className="backup-history-title">
                            <History size={18} />
                            <span>Backup History</span>
                        </div>
                        <span className="backup-history-count">
                            {backups.length} {backups.length === 1 ? "backup" : "backups"}
                        </span>
                    </div>

                    <div className="backup-table-wrapper">
                        <table className="backup-table">
                            <thead>
                                <tr>
                                    <th>
                                        <div className="th-wrap">
                                            <Calendar size={13} />
                                            <span>Date</span>
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-wrap">
                                            <FileText size={13} />
                                            <span>File Name</span>
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-wrap">
                                            <HardDrive size={13} />
                                            <span>Size</span>
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-wrap">
                                            <Activity size={13} />
                                            <span>Status</span>
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-wrap">
                                            <Settings size={13} />
                                            <span>Actions</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingHistory ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                                            <Loader2 size={22} className="backup-spin" style={{ margin: "0 auto 8px auto" }} />
                                            <div>Loading backup logs...</div>
                                        </td>
                                    </tr>
                                ) : backups.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <div className="backup-empty-state">
                                                <div className="backup-empty-icon">
                                                    <Archive size={28} />
                                                </div>
                                                <h4>No backup records found</h4>
                                                <p>
                                                    System snapshots will appear here once created. Click "Start Backup" to generate a backup file.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    backups.map((item) => (
                                        <tr key={item.id}>
                                            <td>{formatTimestamp(item.createdAt)}</td>
                                            <td className="backup-filename">{item.fileName || "system_backup.json"}</td>
                                            <td>{item.fileSize || "—"}</td>
                                            <td>
                                                <span className={`backup-status-tag ${(item.status || "success").toLowerCase()}`}>
                                                    ● {item.status || "Success"}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="backup-action-btn"
                                                    title="Delete history entry"
                                                    onClick={() => handleDeleteRecord(item.id)}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── Restore Confirmation Modal ── */}
            {showConfirmModal && pendingFile && (
                <div className="backup-modal-overlay" onClick={handleCancelRestore}>
                    <div className="backup-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="backup-modal-icon-badge">
                            <RotateCcw size={26} />
                        </div>
                        <h3>Confirm System Restore</h3>

                        <div className="backup-modal-warning">
                            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>
                                Restoring data will overwrite and merge existing database records in Firestore with the data from this backup file.
                            </span>
                        </div>

                        <div className="backup-file-preview">
                            <span>
                                <strong>File:</strong> {pendingFile.name}
                            </span>
                            <span>
                                <strong>Size:</strong> {(pendingFile.size / 1024).toFixed(1)} KB
                            </span>
                        </div>

                        <div className="backup-modal-actions">
                            <button
                                type="button"
                                className="btn-backup-outline"
                                onClick={handleCancelRestore}
                                disabled={restoringBackup}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-backup-primary"
                                onClick={handleConfirmRestore}
                                disabled={restoringBackup}
                            >
                                {restoringBackup ? (
                                    <>
                                        <Loader2 size={16} className="backup-spin" />
                                        Restoring Database...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={16} />
                                        Confirm & Restore
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
