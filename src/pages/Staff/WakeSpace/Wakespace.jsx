import { useState, useEffect } from "react";
import {
    Search, Calendar, List, LayoutGrid, Clock, Bell, CheckCircle
} from "lucide-react";
import Header from "../../../components/Header/Header";
import { subscribeWakeSpaceBookings } from "../../../services/wakeSpaceServices.jsx";
import WakeSpaceCalendar from "../../../components/WakeSpaceCalendar/WakeSpaceCalendar.jsx";
import "../../Admin/UserManagement/UserManagement.css";
import "./Wakespace.css";

function WakeSpace() {
    const [activeView, setActiveView] = useState("calendar");
    const [bookings, setBookings] = useState([]);

    // ── Listen to Firestore wake_space collection ──
    useEffect(() => {
        const unsub = subscribeWakeSpaceBookings(setBookings);
        return () => unsub();
    }, []);

    const bookingsThisMonth = bookings.filter((b) => {
        if (!b.startDate) return false;
        const s = new Date(b.startDate);
        return s.getMonth() === new Date().getMonth() && s.getFullYear() === new Date().getFullYear();
    });

    return (
        <div>
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
                            <span className="um-kpi-value">{bookings.length}</span>
                        </div>
                        <span className="ws-kpi-sub">All wake records</span>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">ACTIVE VIGILS</span>
                            <span className="ws-kpi-icon-wrap green-icon"><Clock size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">
                                {bookings.filter((b) => b.status === "active").length}
                            </span>
                        </div>
                        <span className="ws-kpi-sub">Currently occupied spaces</span>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">UPCOMING</span>
                            <span className="ws-kpi-icon-wrap orange-icon"><Bell size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">
                                {bookings.filter((b) => b.status === "pending").length}
                            </span>
                        </div>
                        <span className="ws-kpi-sub">Reserved for future dates</span>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">COMPLETED</span>
                            <span className="ws-kpi-icon-wrap purple-icon"><CheckCircle size={16} /></span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">
                                {bookings.filter((b) => b.status === "completed").length}
                            </span>
                        </div>
                        <span className="ws-kpi-sub">Concluded services</span>
                    </div>
                </div>

                {/* Section Header */}
                <div className="ws-section-header">
                    <div className="ws-section-title-group">
                        <span className="ws-section-icon"><List size={16} /></span>
                        <span className="ws-section-title">Wake Space Bookings</span>
                        <span className="badge-count">{bookings.length} records</span>
                    </div>
                    <div className="ws-header-right">
                        <div className="ws-view-toggle">
                            <button
                                className={`ws-toggle-btn ${activeView === "calendar" ? "ws-toggle-active" : ""}`}
                                onClick={() => setActiveView("calendar")}
                            >
                                <Calendar size={14} />
                                Calendar View
                            </button>
                            <button
                                className={`ws-toggle-btn ${activeView === "list" ? "ws-toggle-active" : ""}`}
                                onClick={() => setActiveView("list")}
                            >
                                <List size={14} />
                                Table View
                            </button>
                        </div>
                    </div>
                </div>

                {/* ═══════ CALENDAR VIEW ═══════ */}
                {activeView === "calendar" && (
                    <WakeSpaceCalendar
                        bookings={bookings}
                    />
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
                                    placeholder="Search by ID (WB001), deceased, client, or space..."
                                />
                            </div>
                            <select className="filter-select"><option>All Spaces</option></select>
                            <select className="filter-select"><option>All Statuses</option></select>
                        </div>

                        <div className="table-wrapper">
                            <table className="ws-table">
                                <thead>
                                    <tr>
                                        <th>BOOKING ID</th>
                                        <th>START DATE</th>
                                        <th>END DATE</th>
                                        <th>NIGHTS</th>
                                        <th>STATUS</th>
                                        <th>CREATED AT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bookings.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="ws-empty-row">No bookings found.</td>
                                        </tr>
                                    ) : (
                                        bookings.map((b) => (
                                            <tr key={b.id}>
                                                <td className="ws-booking-id">{b.id.slice(0, 8).toUpperCase()}</td>
                                                <td>{b.startDate}</td>
                                                <td>{b.endDate}</td>
                                                <td>{b.days} night{b.days > 1 ? "s" : ""}</td>
                                                <td>
                                                    <span className={`ws-status-pill ws-status-${b.status}`}>
                                                        {b.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    {b.createdAt?.toDate
                                                        ? b.createdAt.toDate().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                                                        : "—"}
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
