import { useState, useEffect, useMemo } from "react";
import {
    Search, Calendar, List, LayoutGrid, Clock, Bell, CheckCircle,
    Bed, AlertCircle, User, Heart, Sparkles
} from "lucide-react";
import Header from "../../../components/Header/Header";
import {
    subscribeWakeSpaceBookings,
    subscribeWakeSpaces
} from "../../../services/wakeSpaceServices.jsx";
import { getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import WakeSpaceCalendar from "../../../components/WakeSpaceCalendar/WakeSpaceCalendar.jsx";
import "../../Admin/UserManagement/UserManagement.css";
import "./Wakespace.css";

function formatFriendlyDate(dateStr) {
    if (!dateStr) return "—";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return dateStr;
    }
}

function WakeSpace() {
    const [activeView, setActiveView] = useState("calendar");
    const [bookings, setBookings] = useState([]);
    const [wakeSpaces, setWakeSpaces] = useState([]);

    // ── Listen to Firestore wakeSpaceRental collection ──
    useEffect(() => {
        const unsub = subscribeWakeSpaceBookings(setBookings);
        return () => unsub();
    }, []);

    // ── Listen to Firestore wake_space collection (facility definitions) ──
    useEffect(() => {
        const unsub = subscribeWakeSpaces(setWakeSpaces);
        return () => unsub();
    }, []);

    // ── System Date (reacts to Admin Abuse date override) ──
    const [todayStr, setTodayStr] = useState(getSystemDateISO());
    useEffect(() => {
        const unsub = subscribeSystemDate((info) => {
            setTodayStr(info.activeDate);
        });
        return () => unsub();
    }, []);

    // ── Derive per-space status from bookings ──
    const spaceStatus = useMemo(() => {
        const sorted = [...wakeSpaces].sort((a, b) => {
            const order = { "A": 1, "B": 2, "C": 3 };
            return (order[a.wake] || 99) - (order[b.wake] || 99);
        });

        return sorted.map((ws) => {
            // Find bookings assigned to this space
            const spaceBookings = bookings.filter(
                (b) => b.spaceId === ws.id || b.spaceId === ws.wake
            );

            // Current active booking (today falls within range)
            const current = spaceBookings.find(
                (b) =>
                    (b.status === "active" || b.status === "pending") &&
                    b.startDate <= todayStr &&
                    b.endDate >= todayStr
            );

            // Upcoming bookings (start date is after today)
            const upcoming = spaceBookings
                .filter((b) => b.startDate > todayStr && (b.status === "pending" || b.status === "active"))
                .sort((a, b) => a.startDate.localeCompare(b.startDate));

            const totalBookings = spaceBookings.length;
            const completedBookings = spaceBookings.filter((b) => b.status === "completed").length;

            return {
                ...ws,
                current,
                upcoming,
                totalBookings,
                completedBookings,
                isOccupied: !!current,
            };
        });
    }, [wakeSpaces, bookings, todayStr]);

    // ── KPI calculations ──
    const totalBookings = bookings.length;
    const activeVigils = bookings.filter((b) => b.status === "active").length;
    const pendingCount = bookings.filter((b) => b.status === "pending").length;
    const completedCount = bookings.filter((b) => b.status === "completed").length;

    // ── Table search & filter ──
    const [searchQuery, setSearchQuery] = useState("");
    const [filterSpace, setFilterSpace] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");

    const filteredBookings = useMemo(() => {
        return bookings.filter((b) => {
            // Search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchId = (b.bookingId || b.id || "").toLowerCase().includes(q);
                const matchClient = (b.client || "").toLowerCase().includes(q);
                const matchDeceased = (b.deceased || "").toLowerCase().includes(q);
                const matchSpace = (b.spaceId || "").toLowerCase().includes(q);
                if (!matchId && !matchClient && !matchDeceased && !matchSpace) return false;
            }
            // Space filter
            if (filterSpace !== "all") {
                if (b.spaceId !== filterSpace) return false;
            }
            // Status filter
            if (filterStatus !== "all") {
                if (b.status !== filterStatus) return false;
            }
            return true;
        });
    }, [bookings, searchQuery, filterSpace, filterStatus]);

    return (
        <div className="user-management-page">
            <Header page="wake-spaces" />
            <div className="user-management-container">

                {/* KPI Cards */}
                <div className="um-kpi-grid ws-kpi-grid">
                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">TOTAL BOOKINGS</span>
                            <span className="ws-kpi-icon-wrap blue-icon"><LayoutGrid size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{totalBookings}</span>
                        </div>
                        <span className="ws-kpi-sub">All wake records</span>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">ACTIVE VIGILS</span>
                            <span className="ws-kpi-icon-wrap green-icon"><Clock size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{activeVigils}</span>
                        </div>
                        <span className="ws-kpi-sub">Currently occupied spaces</span>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">UPCOMING</span>
                            <span className="ws-kpi-icon-wrap orange-icon"><Bell size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{pendingCount}</span>
                        </div>
                        <span className="ws-kpi-sub">Reserved for future dates</span>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">COMPLETED</span>
                            <span className="ws-kpi-icon-wrap purple-icon"><CheckCircle size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{completedCount}</span>
                        </div>
                        <span className="ws-kpi-sub">Concluded services</span>
                    </div>
                </div>

                {/* ═══════ 3-COLUMN WAKE SPACE CARDS ═══════ */}
                <div className="ws-section-header">
                    <div className="ws-section-title-group">
                        <span className="ws-section-icon"><Bed size={16} /></span>
                        <span className="ws-section-title">Wake Spaces</span>
                        <span className="badge-count">{wakeSpaces.length} spaces</span>
                    </div>
                </div>

                <div className="ws-spaces-grid">
                    {spaceStatus.length === 0 ? (
                        <div className="ws-spaces-empty">
                            <AlertCircle size={20} />
                            <span>No wake spaces found. Seed the wake_space collection first.</span>
                        </div>
                    ) : (
                        spaceStatus.map((space) => (
                            <div
                                key={space.id}
                                className={`ws-space-card ${space.isOccupied ? "ws-space-occupied" : "ws-space-available"}`}
                            >
                                {/* Card Header */}
                                <div className="ws-space-card-header">
                                    <div className="ws-space-name-row">
                                        <div className={`ws-space-icon-circle ${space.isOccupied ? "occupied" : "available"}`}>
                                            <Bed size={20} />
                                        </div>
                                        <div>
                                            <div className="ws-space-name-line">
                                                <span className="ws-space-name">Wake Space {space.wake}</span>
                                            </div>
                                            <div className="ws-space-price-row">
                                                <span className="ws-price-val">₱{Number(space.price || 0).toLocaleString()}</span>
                                                <span className="ws-price-unit">/ night</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className={`ws-space-status-badge ${space.isOccupied ? "ws-badge-occupied" : "ws-badge-available"}`}>
                                        <span className="ws-badge-dot" />
                                        {space.isOccupied ? "Occupied" : "Available"}
                                    </span>
                                </div>

                                {/* Current Booking / Active Vigil */}
                                {space.current ? (
                                    <div className="ws-space-current">
                                        <div className="ws-space-current-top">
                                            <div className="ws-space-current-label">
                                                <Clock size={12} />
                                                <span>Active Vigil</span>
                                            </div>
                                            <span className="ws-duration-badge">
                                                {space.current.days} night{space.current.days > 1 ? "s" : ""}
                                            </span>
                                        </div>
                                        <div className="ws-space-current-details">
                                            {space.current.deceased && (
                                                <div className="ws-detail-row highlight">
                                                    <Heart size={13} className="ws-icon-deceased" />
                                                    <span className="ws-detail-label">Deceased</span>
                                                    <span className="ws-detail-val deceased">{space.current.deceased}</span>
                                                </div>
                                            )}
                                            {space.current.client && (
                                                <div className="ws-detail-row">
                                                    <User size={13} className="ws-icon-client" />
                                                    <span className="ws-detail-label">Client</span>
                                                    <span className="ws-detail-val">{space.current.client}</span>
                                                </div>
                                            )}
                                            <div className="ws-detail-row">
                                                <Calendar size={13} className="ws-icon-dates" />
                                                <span className="ws-detail-label">Schedule</span>
                                                <span className="ws-detail-val dates">
                                                    {formatFriendlyDate(space.current.startDate)} – {formatFriendlyDate(space.current.endDate)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="ws-space-no-current">
                                        <div className="ws-vacant-icon-wrap">
                                            <Sparkles size={16} />
                                        </div>
                                        <div>
                                            <div className="ws-vacant-title">Vacant & Ready</div>
                                            <div className="ws-vacant-sub">Available for immediate booking</div>
                                        </div>
                                    </div>
                                )}

                                {/* Upcoming Queue */}
                                <div className="ws-space-upcoming">
                                    <div className="ws-space-upcoming-label">
                                        <span>Upcoming Reservations</span>
                                        <span className="ws-upcoming-count">{space.upcoming.length}</span>
                                    </div>
                                    {space.upcoming.length === 0 ? (
                                        <div className="ws-upcoming-empty">No upcoming reservations queued</div>
                                    ) : (
                                        <div className="ws-upcoming-list">
                                            {space.upcoming.slice(0, 2).map((ub) => (
                                                <div key={ub.id} className="ws-upcoming-item">
                                                    <div className="ws-upcoming-item-left">
                                                        <span className="ws-upcoming-dates">
                                                            {formatFriendlyDate(ub.startDate)} – {formatFriendlyDate(ub.endDate)}
                                                        </span>
                                                        {ub.client && <span className="ws-upcoming-client">{ub.client}</span>}
                                                    </div>
                                                    <span className="ws-upcoming-nights-badge">
                                                        {ub.days}n
                                                    </span>
                                                </div>
                                            ))}
                                            {space.upcoming.length > 2 && (
                                                <div className="ws-upcoming-more">
                                                    +{space.upcoming.length - 2} more upcoming
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Footer Stats */}
                                <div className="ws-space-footer">
                                    <div className="ws-space-stat">
                                        <span className="ws-stat-value">{space.totalBookings}</span>
                                        <span className="ws-stat-label">Total</span>
                                    </div>
                                    <div className="ws-stat-divider" />
                                    <div className="ws-space-stat">
                                        <span className="ws-stat-value">{space.completedBookings}</span>
                                        <span className="ws-stat-label">Completed</span>
                                    </div>
                                    <div className="ws-stat-divider" />
                                    <div className="ws-space-stat">
                                        <span className="ws-stat-value">{space.upcoming.length}</span>
                                        <span className="ws-stat-label">Upcoming</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* ═══════ SECTION HEADER WITH VIEW TOGGLE ═══════ */}
                <div className="ws-section-header" style={{ marginTop: "28px" }}>
                    <div className="ws-section-title-group">
                        <span className="ws-section-icon"><List size={16} /></span>
                        <span className="ws-section-title">All Bookings</span>
                        <span className="badge-count">{bookings.length} records</span>
                    </div>
                    <div className="ws-header-right">
                        <div className="ws-view-toggle">
                            <button
                                className={`ws-toggle-btn ${activeView === "calendar" ? "ws-toggle-active" : ""}`}
                                onClick={() => setActiveView("calendar")}
                            >
                                <Calendar size={14} />
                                Calendar
                            </button>
                            <button
                                className={`ws-toggle-btn ${activeView === "list" ? "ws-toggle-active" : ""}`}
                                onClick={() => setActiveView("list")}
                            >
                                <List size={14} />
                                Table
                            </button>
                        </div>
                    </div>
                </div>

                {/* ═══════ CALENDAR VIEW ═══════ */}
                {activeView === "calendar" && (
                    <WakeSpaceCalendar bookings={bookings} wakeSpaces={wakeSpaces} />
                )}

                {/* ═══════ LIST / TABLE VIEW ═══════ */}
                {activeView === "list" && (
                    <div className="ws-list-wrapper">
                        <div className="filters-bar ws-filters-bar">
                            <div className="search-wrapper">
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search by ID, deceased, client, or space..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="filter-select"
                                value={filterSpace}
                                onChange={(e) => setFilterSpace(e.target.value)}
                            >
                                <option value="all">All Spaces</option>
                                {wakeSpaces.map((ws) => (
                                    <option key={ws.id} value={ws.id}>
                                        Wake Space {ws.wake}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="filter-select"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="all">All Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                            </select>
                        </div>

                        <div className="table-wrapper">
                            <table className="ws-table">
                                <thead>
                                    <tr>
                                        <th>BOOKING ID</th>
                                        <th>SPACE</th>
                                        <th>CLIENT</th>
                                        <th>DECEASED</th>
                                        <th>START DATE</th>
                                        <th>END DATE</th>
                                        <th>NIGHTS</th>
                                        <th>STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredBookings.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="ws-empty-row">No bookings found.</td>
                                        </tr>
                                    ) : (
                                        filteredBookings.map((b) => (
                                            <tr key={b.id}>
                                                <td className="ws-booking-id">{b.bookingId || b.id.slice(0, 8).toUpperCase()}</td>
                                                <td>
                                                    <span className="ws-space-tag">{b.spaceId || "—"}</span>
                                                </td>
                                                <td>{b.client || "—"}</td>
                                                <td>{b.deceased || "—"}</td>
                                                <td>{b.startDate}</td>
                                                <td>{b.endDate}</td>
                                                <td>{b.days} night{b.days > 1 ? "s" : ""}</td>
                                                <td>
                                                    <span className={`ws-status-pill ws-status-${b.status}`}>
                                                        {b.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default WakeSpace;
