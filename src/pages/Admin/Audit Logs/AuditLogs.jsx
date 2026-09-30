import { useEffect, useState, useMemo } from "react";
import Header from "../../../components/Header/Header";
import Table from "../../../components/Table/Table";
import Pagination from "../../../components/Pagination/Pagination";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../../firebase/config";
import {
    Search,
    Shield,
    FileText,
    Calendar,
    User,
    Eye,
    X,
    Clock,
    Activity,
    Layers,
    Filter,
    ArrowUpDown,
    CheckCircle2,
    AlertCircle,
    Info,
    RefreshCw
} from "lucide-react";
import "./AuditLogs.css";

export default function AuditLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [moduleFilter, setModuleFilter] = useState("all");
    const [actionFilter, setActionFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedLog, setSelectedLog] = useState(null);
    const logsPerPage = 6;

    // Real-time Firestore subscription to "auditLogs"
    useEffect(() => {
        setLoading(true);
        // Subscribe to auditLogs
        const logsRef = collection(db, "auditLogs");
        const unsub = onSnapshot(
            logsRef,
            (snapshot) => {
                const fetched = snapshot.docs.map((docSnap) => {
                    const data = docSnap.data();
                    // Resolve date / timestamp
                    let dateObj = null;
                    if (data.createdAt?.toDate) {
                        dateObj = data.createdAt.toDate();
                    } else if (data.createdAt?.seconds) {
                        dateObj = new Date(data.createdAt.seconds * 1000);
                    } else if (data.timestampISO) {
                        dateObj = new Date(data.timestampISO);
                    }

                    // Resilient Description Resolution
                    let resolvedDesc = "";
                    if (typeof data.description === "string" && data.description.trim()) {
                        resolvedDesc = data.description.trim();
                    } else if (typeof data.desc === "string" && data.desc.trim()) {
                        resolvedDesc = data.desc.trim();
                    } else if (typeof data.actionDescription === "string" && data.actionDescription.trim()) {
                        resolvedDesc = data.actionDescription.trim();
                    } else if (typeof data.message === "string" && data.message.trim()) {
                        resolvedDesc = data.message.trim();
                    } else if (data.details && typeof data.details.description === "string" && data.details.description.trim()) {
                        resolvedDesc = data.details.description.trim();
                    } else if (data.details && typeof data.details.message === "string" && data.details.message.trim()) {
                        resolvedDesc = data.details.message.trim();
                    } else if (typeof data.description === "object" && data.description) {
                        resolvedDesc = JSON.stringify(data.description);
                    } else {
                        const act = data.actionType || data.action || "";
                        const mod = data.module || "";
                        if (act || mod) {
                            resolvedDesc = `${act || "Activity"} recorded in ${mod || "System"}`;
                        } else {
                            resolvedDesc = "No description provided";
                        }
                    }

                    // Resilient Target Resolution
                    const sanitizeTarget = (val) => {
                        if (val == null) return "";
                        if (typeof val === "object") return "";
                        const str = String(val).trim();
                        if (str === "" || str === "N/A" || str === "null" || str === "undefined") return "";
                        return str;
                    };

                    let resolvedTarget = sanitizeTarget(data.targetItem) ||
                        sanitizeTarget(data.target) ||
                        sanitizeTarget(data.target_item) ||
                        sanitizeTarget(data.targetName) ||
                        sanitizeTarget(data.targetId) ||
                        sanitizeTarget(data.target_id);

                    if (!resolvedTarget && data.details && typeof data.details === "object") {
                        const d = data.details;
                        resolvedTarget = sanitizeTarget(d.plotCode) ||
                            sanitizeTarget(d.plotId) ||
                            sanitizeTarget(d.target) ||
                            sanitizeTarget(d.targetItem) ||
                            sanitizeTarget(d.receipt) ||
                            sanitizeTarget(d.burialId) ||
                            sanitizeTarget(d.bookingId) ||
                            sanitizeTarget(d.contractId) ||
                            sanitizeTarget(d.contractID) ||
                            sanitizeTarget(d.deceasedName) ||
                            sanitizeTarget(d.deceasedFullName) ||
                            sanitizeTarget(d.spaceName) ||
                            sanitizeTarget(d.range);
                    }

                    const targetDisplayVal = resolvedTarget || "—";

                    return {
                        id: docSnap.id,
                        ...data,
                        description: resolvedDesc,
                        descriptionDisplay: resolvedDesc,
                        targetItem: targetDisplayVal !== "—" ? targetDisplayVal : "N/A",
                        targetDisplay: targetDisplayVal,
                        timestampDate: dateObj || new Date(0),
                        timestampDisplay: dateObj ? formatLogTimestamp(dateObj) : "—",
                        performedByName: data.performedBy?.name || "Staff User",
                        performedByRole: data.performedBy?.role || "Staff",
                        performedByEmail: data.performedBy?.email || ""
                    };
                });

                // Sort descending by timestamp
                fetched.sort((a, b) => b.timestampDate - a.timestampDate);

                setLogs(fetched);
                setLoading(false);
            },
            (err) => {
                console.error("Error subscribing to auditLogs:", err);
                setLoading(false);
            }
        );

        return () => unsub();
    }, []);

    // Format timestamp nicely
    function formatLogTimestamp(date) {
        if (!date || isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Manila",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        }).format(date);
    }

    // Dynamic unique modules & action types for dropdowns
    const availableModules = useMemo(() => {
        const set = new Set();
        logs.forEach((l) => {
            if (l.module) set.add(l.module);
        });
        return Array.from(set).sort();
    }, [logs]);

    const availableActions = useMemo(() => {
        const set = new Set();
        logs.forEach((l) => {
            if (l.actionType) set.add(l.actionType);
        });
        return Array.from(set).sort();
    }, [logs]);

    // Filtering logic
    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            // Module filter
            if (moduleFilter !== "all" && (log.module || "").toLowerCase() !== moduleFilter.toLowerCase()) {
                return false;
            }

            // Action filter
            if (actionFilter !== "all" && (log.actionType || "").toLowerCase() !== actionFilter.toLowerCase()) {
                return false;
            }

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const desc = (log.descriptionDisplay || log.description || "").toLowerCase();
                const target = (log.targetDisplay || log.targetItem || "").toLowerCase();
                const staff = (log.performedByName || "").toLowerCase();
                const email = (log.performedByEmail || "").toLowerCase();
                const mod = (log.module || "").toLowerCase();
                const act = (log.actionType || "").toLowerCase();

                if (
                    !desc.includes(q) &&
                    !target.includes(q) &&
                    !staff.includes(q) &&
                    !email.includes(q) &&
                    !mod.includes(q) &&
                    !act.includes(q)
                ) {
                    return false;
                }
            }

            return true;
        });
    }, [logs, moduleFilter, actionFilter, searchQuery]);

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, moduleFilter, actionFilter]);

    // Pagination calculations
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
    const startIndex = (currentPage - 1) * logsPerPage;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + logsPerPage);

    // KPI Summary counts
    const totalLogsCount = logs.length;
    const distinctModulesCount = availableModules.length;
    const todayLogsCount = useMemo(() => {
        const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
        return logs.filter((l) => {
            if (!l.timestampDate || isNaN(l.timestampDate.getTime())) return false;
            const logStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(l.timestampDate);
            return logStr === todayStr;
        }).length;
    }, [logs]);

    const activeStaffCount = useMemo(() => {
        const uids = new Set();
        logs.forEach((l) => {
            if (l.performedBy?.uid) uids.add(l.performedBy.uid);
            else if (l.performedByName) uids.add(l.performedByName);
        });
        return uids.size;
    }, [logs]);

    // Helper for module badge class
    const getModuleBadgeClass = (mod = "") => {
        const m = mod.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (m.includes("pos") || m.includes("pointofsale")) return "mod-pos";
        if (m.includes("interment") || m.includes("burial")) return "mod-interment";
        if (m.includes("plot") || m.includes("map") || m.includes("grave")) return "mod-plot";
        if (m.includes("payment")) return "mod-payment";
        if (m.includes("wakespace") || m.includes("wake")) return "mod-wake";
        if (m.includes("abuse") || m.includes("admin")) return "mod-abuse";
        if (m.includes("notif")) return "mod-notif";
        return "mod-default";
    };

    // Helper for action type badge class
    const getActionBadgeClass = (action = "") => {
        const a = action.toUpperCase();
        if (a.includes("CREATE") || a.includes("ADD") || a.includes("INSERT")) return "act-create";
        if (a.includes("UPDATE") || a.includes("MODIFY") || a.includes("EDIT")) return "act-update";
        if (a.includes("DELETE") || a.includes("REMOVE") || a.includes("ARCHIVE")) return "act-delete";
        if (a.includes("SIMULAT") || a.includes("DATE")) return "act-sim";
        return "act-activity";
    };

    // Table columns definition
    const columns = [
        {
            key: "timestamp",
            label: "Timestamp",
            render: (row) => (
                <div className="al-cell-time">
                    <Clock size={13} className="al-time-icon" />
                    <span>{row.timestampDisplay}</span>
                </div>
            )
        },
        {
            key: "performedBy",
            label: "Staff / Performer",
            render: (row) => (
                <div className="al-cell-user">
                    <span className="al-user-name">{row.performedByName}</span>
                    <span className={`al-user-role-badge role-${(row.performedByRole || "staff").toLowerCase()}`}>
                        {row.performedByRole}
                    </span>
                </div>
            )
        },
        {
            key: "module",
            label: "Module",
            render: (row) => (
                <span className={`al-module-pill ${getModuleBadgeClass(row.module)}`}>
                    {row.module || "System"}
                </span>
            )
        },
        {
            key: "actionType",
            label: "Action",
            render: (row) => (
                <span className={`al-action-pill ${getActionBadgeClass(row.actionType)}`}>
                    {row.actionType || "ACTIVITY"}
                </span>
            )
        },
        {
            key: "description",
            label: "Description",
            render: (row) => (
                <div className="al-cell-desc">
                    <span className="al-desc-text" title={row.descriptionDisplay}>
                        {row.descriptionDisplay}
                    </span>
                </div>
            )
        },
        {
            key: "target",
            label: "Target",
            render: (row) => {
                const isBlank = !row.targetDisplay || row.targetDisplay === "—" || row.targetDisplay === "N/A";
                return (
                    <div className="al-cell-target">
                        {isBlank ? (
                            <span className="al-target-empty">—</span>
                        ) : (
                            <span className="al-target-badge" title={row.targetDisplay}>
                                {row.targetDisplay}
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            key: "actions",
            label: "",
            render: (row) => (
                <button
                    type="button"
                    className="al-view-btn"
                    onClick={() => setSelectedLog(row)}
                    title="View Full Audit Details"
                >
                    <Eye size={15} />
                    <span>Details</span>
                </button>
            )
        }
    ];

    return (
        <div className="audit-logs-page">
            <Header page="audit-log" />

            <div className="audit-logs-container">
                {/* Page Title Bar */}
                <div className="page-title-bar">
                    <div>
                        <h2>
                            <Shield size={22} className="page-title-icon" />
                            Audit Logs & Security Trail
                            <span className="badge-count">{filteredLogs.length} events</span>
                        </h2>
                        <p className="al-subtitle">
                            Real-time immutable audit trail monitoring staff operations, grave allocations, POS transactions, and system events.
                        </p>
                    </div>
                </div>

                {/* KPI Summary Cards */}
                <div className="al-kpi-grid">
                    <div className="al-kpi-card">
                        <div className="al-kpi-header">
                            <span className="al-kpi-label">TOTAL LOG EVENTS</span>
                            <div className="al-kpi-icon blue">
                                <FileText size={16} />
                            </div>
                        </div>
                        <div className="al-kpi-value">{totalLogsCount.toLocaleString()}</div>
                        <span className="al-kpi-sub">Lifetime audit records</span>
                    </div>

                    <div className="al-kpi-card">
                        <div className="al-kpi-header">
                            <span className="al-kpi-label">MODULES TRACKED</span>
                            <div className="al-kpi-icon green">
                                <Layers size={16} />
                            </div>
                        </div>
                        <div className="al-kpi-value">{distinctModulesCount}</div>
                        <span className="al-kpi-sub">POS, Map, Interment & more</span>
                    </div>

                    <div className="al-kpi-card">
                        <div className="al-kpi-header">
                            <span className="al-kpi-label">TODAY'S ACTIONS</span>
                            <div className="al-kpi-icon amber">
                                <Activity size={16} />
                            </div>
                        </div>
                        <div className="al-kpi-value">{todayLogsCount}</div>
                        <span className="al-kpi-sub">Philippine standard date</span>
                    </div>

                    <div className="al-kpi-card">
                        <div className="al-kpi-header">
                            <span className="al-kpi-label">CONTRIBUTORS</span>
                            <div className="al-kpi-icon purple">
                                <User size={16} />
                            </div>
                        </div>
                        <div className="al-kpi-value">{activeStaffCount}</div>
                        <span className="al-kpi-sub">Distinct active accounts</span>
                    </div>
                </div>

                {/* Filters Bar */}
                <div className="filters-bar">
                    <div className="search-wrapper" style={{ width: "320px" }}>
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search description, target item, staff..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Module Filter */}
                    <select
                        className="al-select-filter"
                        value={moduleFilter}
                        onChange={(e) => setModuleFilter(e.target.value)}
                    >
                        <option value="all">All Modules</option>
                        {availableModules.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>

                    {/* Action Type Filter */}
                    <select
                        className="al-select-filter"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                    >
                        <option value="all">All Actions</option>
                        {availableActions.map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>

                    {(searchQuery || moduleFilter !== "all" || actionFilter !== "all") && (
                        <button
                            type="button"
                            className="al-reset-filter-btn"
                            onClick={() => {
                                setSearchQuery("");
                                setModuleFilter("all");
                                setActionFilter("all");
                            }}
                        >
                            Reset Filters
                        </button>
                    )}
                </div>

                {/* Table Content */}
                {loading ? (
                    <div className="al-loading-box">
                        <RefreshCw size={24} className="spinning" />
                        <p>Loading real-time audit logs from Firestore...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="al-empty-box">
                        <Shield size={44} strokeWidth={1.2} />
                        <p>No audit log events found matching your criteria.</p>
                    </div>
                ) : (
                    <>
                        <Table data={paginatedLogs} columns={columns} />

                        {/* Pagination Bar */}
                        <div className="al-pagination-bar">
                            <span className="al-showing-text">
                                Showing {startIndex + 1} to {Math.min(startIndex + logsPerPage, filteredLogs.length)} of {filteredLogs.length} audit events
                            </span>
                            {totalPages > 1 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                />
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Audit Log Detail Modal */}
            {selectedLog && (
                <div className="al-modal-backdrop" onClick={() => setSelectedLog(null)}>
                    <div className="al-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="al-modal-header">
                            <div>
                                <div className="al-modal-meta-top">
                                    <span className={`al-module-pill ${getModuleBadgeClass(selectedLog.module)}`}>
                                        {selectedLog.module}
                                    </span>
                                    <span className={`al-action-pill ${getActionBadgeClass(selectedLog.actionType)}`}>
                                        {selectedLog.actionType}
                                    </span>
                                </div>
                                <h3 className="al-modal-title">Audit Event Inspection</h3>
                                <span className="al-modal-time">{selectedLog.timestampDisplay}</span>
                            </div>
                            <button
                                type="button"
                                className="al-modal-close"
                                onClick={() => setSelectedLog(null)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="al-modal-body">
                            {/* Summary Group */}
                            <div className="al-inspect-section">
                                <h4>Event Description</h4>
                                <p className="al-inspect-desc">{selectedLog.descriptionDisplay || selectedLog.description || "No description logged"}</p>
                            </div>

                            <div className="al-inspect-grid">
                                <div className="al-inspect-item">
                                    <span className="al-item-label">Target Item / ID</span>
                                    <span className={`al-item-value ${selectedLog.targetDisplay && selectedLog.targetDisplay !== '—' ? 'highlight' : ''}`}>
                                        {selectedLog.targetDisplay || selectedLog.targetItem || "—"}
                                    </span>
                                </div>
                                <div className="al-inspect-item">
                                    <span className="al-item-label">Document ID</span>
                                    <span className="al-item-value monospace">{selectedLog.id}</span>
                                </div>
                                <div className="al-inspect-item">
                                    <span className="al-item-label">Performed By (Name)</span>
                                    <span className="al-item-value">{selectedLog.performedByName}</span>
                                </div>
                                <div className="al-inspect-item">
                                    <span className="al-item-label">User Role</span>
                                    <span className="al-item-value">{selectedLog.performedByRole}</span>
                                </div>
                                <div className="al-inspect-item">
                                    <span className="al-item-label">User Email</span>
                                    <span className="al-item-value monospace">{selectedLog.performedByEmail || "—"}</span>
                                </div>
                                <div className="al-inspect-item">
                                    <span className="al-item-label">User UID</span>
                                    <span className="al-item-value monospace">{selectedLog.performedBy?.uid || "N/A"}</span>
                                </div>
                            </div>

                            {/* Additional metadata & payload */}
                            <div className="al-inspect-section" style={{ marginTop: "16px" }}>
                                <h4>Event Payload & Details</h4>
                                {selectedLog.details && Object.keys(selectedLog.details).length > 0 ? (
                                    <pre className="al-inspect-json">
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </pre>
                                ) : (
                                    <p className="al-empty-details">No extra metadata payload attached to this log entry.</p>
                                )}
                            </div>
                        </div>

                        <div className="al-modal-footer">
                            <button
                                type="button"
                                className="al-modal-btn-close"
                                onClick={() => setSelectedLog(null)}
                            >
                                Close Inspection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}