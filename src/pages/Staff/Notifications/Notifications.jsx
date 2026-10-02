import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import {
    Bell,
    CheckCheck,
    Trash2,
    Search,
    AlertTriangle,
    Info,
    Flame,
    CheckCircle2,
    Calendar,
    ArrowUpRight,
    CreditCard,
    Bed,
    RefreshCw,
    Shield,
    ExternalLink,
    Filter
} from "lucide-react";
import Header from "../../../components/Header/Header";
import {
    subscribeNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearReadNotifications
} from "../../../services/notificationServices";
import {
    computeNotificationStats,
    syncOperationalAlertsController
} from "../../../controller/notificationController";
import { getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import "./Notifications.css";

export default function Notifications() {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all"); // "all", "wake", "installment", "payments", "renewals", "system"
    const [statusFilter, setStatusFilter] = useState("all"); // "all", "unread", "read"
    const [typeFilter, setTypeFilter] = useState("all"); // "all", "urgent", "high", "medium", "low", "info"
    const [processingAction, setProcessingAction] = useState(false);
    const [feedback, setFeedback] = useState("");

    // Real-time notification subscription
    useEffect(() => {
        const unsub = subscribeNotifications((data) => {
            setNotifications(data || []);
        }, null);

        return () => unsub();
    }, []);

    // Calculate live KPI stats
    const stats = useMemo(() => computeNotificationStats(notifications), [notifications]);

    // Filter notifications
    const filteredNotifications = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return notifications.filter((item) => {
            // Category filter
            if (categoryFilter !== "all" && String(item.category || "").toLowerCase() !== categoryFilter) {
                return false;
            }

            // Status filter
            if (statusFilter === "unread" && item.is_read) return false;
            if (statusFilter === "read" && !item.is_read) return false;

            // Type / Priority filter
            if (typeFilter !== "all" && String(item.type || "").toLowerCase() !== typeFilter) {
                return false;
            }

            // Search query
            if (!query) return true;

            const matchTitle = (item.title || "").toLowerCase().includes(query);
            const matchMsg = (item.message || "").toLowerCase().includes(query);
            const matchCat = (item.category || "").toLowerCase().includes(query);
            const matchId = String(item.notification_id || "").includes(query);

            return matchTitle || matchMsg || matchCat || matchId;
        });
    }, [notifications, searchTerm, categoryFilter, statusFilter, typeFilter]);

    // Handlers
    const handleMarkAsRead = async (id) => {
        try {
            await markNotificationAsRead(id);
        } catch (err) {
            console.error("Failed to mark as read:", err);
        }
    };

    const handleMarkAllRead = async () => {
        if (stats.unread === 0) return;
        setProcessingAction(true);
        try {
            const count = await markAllNotificationsAsRead(notifications);
            setFeedback(`Marked ${count} notification(s) as read.`);
            setTimeout(() => setFeedback(""), 3500);
        } catch (err) {
            console.error("Failed to mark all as read:", err);
        } finally {
            setProcessingAction(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteNotification(id);
        } catch (err) {
            console.error("Failed to delete notification:", err);
        }
    };

    const handleClearRead = async () => {
        const readCount = notifications.filter((n) => n.is_read).length;
        if (readCount === 0) return;

        setProcessingAction(true);
        try {
            const count = await clearReadNotifications(notifications);
            setFeedback(`Cleared ${count} read notification(s).`);
            setTimeout(() => setFeedback(""), 3500);
        } catch (err) {
            console.error("Failed to clear read notifications:", err);
        } finally {
            setProcessingAction(false);
        }
    };

    const handleActionClick = async (notif) => {
        if (!notif.is_read && notif.id) {
            await markNotificationAsRead(notif.id);
        }
        if (notif.action_link) {
            navigate(notif.action_link);
        }
    };

    // Format display date
    const formatTimestamp = (dateStr) => {
        if (!dateStr) return "Just now";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="user-management-page">
            <Header page="notifications" />

            <div className="notif-page-container">
                {/* ── KPI METRICS CARDS ── */}
                <div className="notif-kpi-grid">
                    <div className="notif-kpi-card">
                        <div className="notif-kpi-icon blue">
                            <Bell size={20} />
                        </div>
                        <div className="notif-kpi-content">
                            <span className="notif-kpi-label">Total Notifications</span>
                            <span className="notif-kpi-value">{stats.total}</span>
                        </div>
                    </div>

                    <div className="notif-kpi-card">
                        <div className="notif-kpi-icon amber">
                            <AlertTriangle size={20} />
                        </div>
                        <div className="notif-kpi-content">
                            <span className="notif-kpi-label">Unread Alerts</span>
                            <span className="notif-kpi-value highlight">{stats.unread}</span>
                        </div>
                    </div>

                    <div className="notif-kpi-card">
                        <div className="notif-kpi-icon red">
                            <Flame size={20} />
                        </div>
                        <div className="notif-kpi-content">
                            <span className="notif-kpi-label">Urgent / High Priority</span>
                            <span className="notif-kpi-value red">{stats.urgent}</span>
                        </div>
                    </div>

                    <div className="notif-kpi-card">
                        <div className="notif-kpi-icon teal">
                            <Bed size={20} />
                        </div>
                        <div className="notif-kpi-content">
                            <span className="notif-kpi-label">Wake Space Vigils</span>
                            <span className="notif-kpi-value">{stats.byCategory.wake}</span>
                        </div>
                    </div>
                </div>

                {/* Feedback banner */}
                {feedback && (
                    <div className="notif-feedback-banner">
                        <CheckCircle2 size={16} />
                        <span>{feedback}</span>
                    </div>
                )}

                {/* ── CONTROLS TOOLBAR ── */}
                <div className="notif-controls-card">
                    {/* Top Row: Search & Actions */}
                    <div className="notif-controls-top">
                        <div className="notif-search-wrap">
                            <Search size={16} className="notif-search-icon" />
                            <input
                                type="text"
                                className="notif-search-input"
                                placeholder="Search by title, message, category, or ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="notif-actions-group">
                            <button
                                type="button"
                                className="notif-btn-secondary"
                                onClick={handleMarkAllRead}
                                disabled={processingAction || stats.unread === 0}
                                title="Mark all unread notifications as read"
                            >
                                <CheckCheck size={15} />
                                <span>Mark All as Read</span>
                            </button>

                            <button
                                type="button"
                                className="notif-btn-secondary"
                                onClick={handleClearRead}
                                disabled={processingAction || notifications.filter((n) => n.is_read).length === 0}
                                title="Clear all read notifications"
                            >
                                <Trash2 size={15} />
                                <span>Clear Read</span>
                            </button>
                        </div>
                    </div>

                    {/* Bottom Row: Category & Status Filter Tabs */}
                    <div className="notif-filter-tabs-row">
                        <div className="notif-category-chips">
                            <button
                                type="button"
                                className={`notif-chip ${categoryFilter === "all" ? "active" : ""}`}
                                onClick={() => setCategoryFilter("all")}
                            >
                                All ({stats.total})
                            </button>
                            <button
                                type="button"
                                className={`notif-chip ${categoryFilter === "wake" ? "active" : ""}`}
                                onClick={() => setCategoryFilter("wake")}
                            >
                                <Bed size={13} />
                                Wake ({stats.byCategory.wake})
                            </button>
                            <button
                                type="button"
                                className={`notif-chip ${categoryFilter === "installment" ? "active" : ""}`}
                                onClick={() => setCategoryFilter("installment")}
                            >
                                <CreditCard size={13} />
                                Installment ({stats.byCategory.installment})
                            </button>
                            <button
                                type="button"
                                className={`notif-chip ${categoryFilter === "payments" ? "active" : ""}`}
                                onClick={() => setCategoryFilter("payments")}
                            >
                                <CheckCircle2 size={13} />
                                Payments ({stats.byCategory.payments})
                            </button>
                            <button
                                type="button"
                                className={`notif-chip ${categoryFilter === "renewals" ? "active" : ""}`}
                                onClick={() => setCategoryFilter("renewals")}
                            >
                                <RefreshCw size={13} />
                                Renewals ({stats.byCategory.renewals})
                            </button>
                            <button
                                type="button"
                                className={`notif-chip ${categoryFilter === "system" ? "active" : ""}`}
                                onClick={() => setCategoryFilter("system")}
                            >
                                <Shield size={13} />
                                System ({stats.byCategory.system})
                            </button>
                        </div>

                        {/* Unread / Read Subfilter */}
                        <div className="notif-status-filter">
                            <button
                                type="button"
                                className={`notif-subfilter-btn ${statusFilter === "all" ? "active" : ""}`}
                                onClick={() => setStatusFilter("all")}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                className={`notif-subfilter-btn ${statusFilter === "unread" ? "active" : ""}`}
                                onClick={() => setStatusFilter("unread")}
                            >
                                Unread ({stats.unread})
                            </button>
                            <button
                                type="button"
                                className={`notif-subfilter-btn ${statusFilter === "read" ? "active" : ""}`}
                                onClick={() => setStatusFilter("read")}
                            >
                                Read
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── NOTIFICATIONS LIST ── */}
                <div className="notif-list-container">
                    {filteredNotifications.length === 0 ? (
                        <div className="notif-empty-card">
                            <div className="notif-empty-icon-wrap">
                                <Bell size={36} color="#94a3b8" />
                            </div>
                            <h3 className="notif-empty-title">No notifications found</h3>
                            <p className="notif-empty-text">
                                {searchTerm || categoryFilter !== "all" || statusFilter !== "all"
                                    ? "No notifications match the active filter criteria. Try clearing filters or search terms."
                                    : "You are all caught up! There are currently no new notifications or alerts."}
                            </p>
                            {(searchTerm || categoryFilter !== "all" || statusFilter !== "all") && (
                                <button
                                    type="button"
                                    className="notif-btn-secondary"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setCategoryFilter("all");
                                        setStatusFilter("all");
                                        setTypeFilter("all");
                                    }}
                                    style={{ marginTop: "12px" }}
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="notif-cards-stack">
                            {filteredNotifications.map((notif) => {
                                const isUnread = !notif.is_read;
                                const typeClass = String(notif.type || "info").toLowerCase();
                                const categoryClass = String(notif.category || "system").toLowerCase();

                                return (
                                    <div
                                        key={notif.id || notif.notification_id}
                                        className={`notif-card ${isUnread ? "unread" : "read"} ${typeClass}`}
                                    >
                                        {/* Unread indicator bar */}
                                        {isUnread && <div className="notif-unread-bar" />}

                                        <div className="notif-card-main">
                                            {/* Header tags: Priority, Category, ID, Timestamp */}
                                            <div className="notif-card-header">
                                                <div className="notif-tags-wrap">
                                                    {/* Priority Type Badge */}
                                                    <span className={`notif-badge-priority ${typeClass}`}>
                                                        {typeClass === "urgent" && <Flame size={12} />}
                                                        {typeClass === "high" && <AlertTriangle size={12} />}
                                                        {typeClass === "medium" && <Info size={12} />}
                                                        {typeClass === "info" && <Shield size={12} />}
                                                        <span>{typeClass.toUpperCase()}</span>
                                                    </span>

                                                    {/* Category Badge */}
                                                    <span className={`notif-badge-category ${categoryClass}`}>
                                                        {categoryClass.toUpperCase()}
                                                    </span>

                                                    {/* Notification ID */}
                                                    <span className="notif-id-tag">
                                                        #{notif.notification_id}
                                                    </span>

                                                    {isUnread && (
                                                        <span className="notif-badge-new">NEW</span>
                                                    )}
                                                </div>

                                                <span className="notif-timestamp">
                                                    {formatTimestamp(notif.created_at)}
                                                </span>
                                            </div>

                                            {/* Title & Body */}
                                            <h4 className="notif-card-title">{notif.title}</h4>
                                            <p className="notif-card-message">{notif.message}</p>

                                            {/* Footer Actions */}
                                            <div className="notif-card-footer">
                                                <div className="notif-footer-meta">
                                                    {notif.is_read ? (
                                                        <span className="notif-read-status">
                                                            <CheckCheck size={13} />
                                                            Read {formatTimestamp(notif.read_at)}
                                                        </span>
                                                    ) : (
                                                        <span className="notif-unread-status">
                                                            Unread
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="notif-card-btns">
                                                    {isUnread && (
                                                        <button
                                                            type="button"
                                                            className="notif-btn-mark-read"
                                                            onClick={() => handleMarkAsRead(notif.id)}
                                                            title="Mark as read"
                                                        >
                                                            <CheckCheck size={14} />
                                                            <span>Mark Read</span>
                                                        </button>
                                                    )}

                                                    {notif.action_link && (
                                                        <button
                                                            type="button"
                                                            className="notif-btn-action"
                                                            onClick={() => handleActionClick(notif)}
                                                        >
                                                            <span>View Details</span>
                                                            <ArrowUpRight size={14} />
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="notif-btn-delete"
                                                        onClick={() => handleDelete(notif.id)}
                                                        title="Delete notification"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
