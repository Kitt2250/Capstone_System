import { useState, useEffect, useRef } from "react";
import "./Dashboard.css";
import Header from "../../../components/Header/Header";

// ── Static seed data (Empty for backend integration) ────────────────────────
const EXPIRING_INIT = [];
const OVERDUE_INIT = [];
const MONTHLY_BURIALS = [];
const GRAVE_TYPES = [];
const ACTIVITY_INIT = [];
const LOTS_INIT = [];
const SYSTEM_ALERTS_INIT = [];

// ── Toast component ──────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="da-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`da-toast da-toast-${t.type}`}>
          <span>{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="da-toast-close">×</button>
        </div>
      ))}
    </div>
  );
}

// ── Notification Bell Dropdown ───────────────────────────────────────────────
function NotificationDropdown({ alerts, onMarkRead, onMarkAllRead, onClose }) {
  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="da-notif-dropdown">
      <div className="da-notif-dropdown-header">
        <span className="da-notif-dropdown-title">System Alerts ({alerts.length})</span>
        <span className="da-notif-dropdown-unread">{unreadCount} unread</span>
      </div>

      <div className="da-notif-dropdown-list">
        {alerts.map(alert => (
          <div
            key={alert.id}
            className={`da-notif-dropdown-item${alert.read ? " read" : ""}`}
            onClick={() => onMarkRead(alert.id)}
          >
            {!alert.read && <span className="da-notif-unread-dot" />}
            <div className="da-notif-dropdown-item-content">
              <div className="da-notif-dropdown-item-title">{alert.title}</div>
              <div className="da-notif-dropdown-item-body">{alert.body}</div>
              <div className="da-notif-dropdown-item-time">{alert.time}</div>
            </div>
          </div>
        ))}
      </div>

      {unreadCount > 0 && (
        <div className="da-notif-dropdown-footer">
          <button className="da-notif-mark-all-btn" onClick={onMarkAllRead}>
            <i className="fas fa-check-double"></i> Mark all as read
          </button>
        </div>
      )}
    </div>
  );
}

// ── Reserve Modal ────────────────────────────────────────────────────────────
function ReserveModal({ lot, onClose, onConfirm }) {
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate]   = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !date) return;
    onConfirm({ lot, name, phone, date });
  };

  return (
    <div className="da-modal-overlay" onClick={onClose}>
      <div className="da-modal-box" onClick={e => e.stopPropagation()}>
        <div className="da-modal-header">
          <div>
            <h2 className="da-modal-title">Reserve Lot</h2>
            <p className="da-modal-sub">Fill in reservation details for <strong>{lot.id}</strong></p>
          </div>
          <button className="da-modal-close-btn" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="da-modal-form">
          <div className="da-modal-lot-badge">
            <span className="da-modal-lot-id">{lot.id}</span>
            <span className="da-modal-lot-type">{lot.type}</span>
          </div>
          <div className="da-modal-field">
            <label>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Juan Dela Cruz" required />
          </div>
          <div className="da-modal-field">
            <label>Contact Number</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 09XX-XXX-XXXX" required />
          </div>
          <div className="da-modal-field">
            <label>Reservation Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="da-modal-actions">
            <button type="button" className="da-modal-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="da-modal-confirm-btn">Confirm Reservation</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [expiring]                        = useState(EXPIRING_INIT);
  const [overdue]                         = useState(OVERDUE_INIT);
  const [lots, setLots]                   = useState(LOTS_INIT);
  const [activities]                      = useState(ACTIVITY_INIT);
  const [notifsRead, setNotifsRead]       = useState(false);
  const [sectionFilter, setSectionFilter] = useState("All Sections");
  const [reserveTarget, setReserveTarget] = useState(null);
  const [toasts, setToasts]               = useState([]);
  const [reminderSent, setReminderSent]   = useState({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [statusFilter, setStatusFilter]   = useState("All");

  const toastIdRef                        = useRef(0);

  // Auto-remove toasts
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts(prev => prev.slice(1)), 3500);
    return () => clearTimeout(t);
  }, [toasts]);

  const addToast = (message, type = "success") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleReminder = (kind, id) => {
    setReminderSent(prev => ({ ...prev, [`${kind}-${id}`]: true }));
    addToast("✓ Reminder sent successfully!", "success");
    setTimeout(() => {
      setReminderSent(prev => {
        const next = { ...prev };
        delete next[`${kind}-${id}`];
        return next;
      });
    }, 4000);
  };

  const handleMarkRead = () => {
    setNotifsRead(true);
    addToast("All notifications marked as read.", "info");
  };

  const handleLotClick = (lot) => {
    if (lot.status !== "Available") return;
    setReserveTarget(lot);
  };

  const handleReserveConfirm = ({ lot }) => {
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, status: "Reserved" } : l));
    setReserveTarget(null);
    addToast(`✓ ${lot.id} has been reserved!`, "success");
  };

  // Filter lots
  const filteredLots = lots.filter(l => {
    const sectionMatch = sectionFilter === "All Sections" || l.section === sectionFilter.replace("Section ", "");
    const statusMatch  = statusFilter === "All" || l.status === statusFilter;
    return sectionMatch && statusMatch;
  });

  const freeSlots = lots.filter(l => l.status === "Available").length;

  return (
    <div className="da-wrapper">
      <Header page="dashboard" />
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* ── Stats Grid ── */}
      <div className="da-stats-grid">
        {/* Total Users */}
        <div className="da-stat-card">
          <div className="da-stat-label">Total Users</div>
          <div className="da-stat-value">0</div>
          <div className="da-stat-change">
            <i className="fas fa-minus"></i> 0 this month
          </div>
          <div className="da-stat-sub">
            <i className="fas fa-info-circle"></i> 0% are active admins
          </div>
        </div>
        {/* Active Graves */}
        <div className="da-stat-card">
          <i className="fas fa-tshirt da-stat-icon"></i>
          <div className="da-stat-label">Active Graves</div>
          <div className="da-stat-value">0</div>
          <div className="da-stat-change">
            <i className="fas fa-minus"></i> 0 vs last month
          </div>
        </div>
        {/* Monthly Revenue */}
        <div className="da-stat-card">
          <i className="fas fa-coins da-stat-icon"></i>
          <div className="da-stat-label">Monthly Revenue</div>
          <div className="da-stat-value">₱0</div>
          <div className="da-stat-change">
            <i className="fas fa-minus"></i> 0% vs last month
          </div>
        </div>
        {/* Burials This Month */}
        <div className="da-stat-card">
          <i className="fas fa-cross da-stat-icon"></i>
          <div className="da-stat-label">Burials This Month</div>
          <div className="da-stat-value">0</div>
          <div className="da-stat-change">
            <i className="fas fa-minus"></i> 0 vs last month
          </div>
        </div>
      </div>

      {/* ── Important Notifications Section ── */}
      <div className="da-notifs-section">
        <div className="da-notifs-header">
          <h3 className="da-notifs-title">
            <i className="fas fa-bell" style={{ color: "#d4af37", marginRight: 10 }}></i>
            Important Notifications
            {!notifsRead && (expiring.length + overdue.length > 0) && (
              <span className="da-badge-new">{expiring.length + overdue.length} New</span>
            )}
          </h3>
          <div className="da-notifs-actions">
            {!notifsRead && (expiring.length + overdue.length > 0) && (
              <button className="da-mark-read-btn" onClick={handleMarkRead}>
                <i className="fas fa-check-double"></i> Mark all as read
              </button>
            )}
            <a href="#" className="da-view-all-gold">View all →</a>
          </div>
        </div>

        {notifsRead || (expiring.length === 0 && overdue.length === 0) ? (
          <div className="da-notifs-empty">
            <i className="fas fa-check-circle" style={{ color: "#27ae60", fontSize: "1.5rem" }}></i>
            <p>No new notifications.</p>
          </div>
        ) : (
          <div className="da-notifs-grid">
            {/* Expiring Contracts */}
            <div className="da-notif-card da-notif-card--warn">
              <div className="da-notif-card-header">
                <div className="da-notif-icon-wrap" style={{ background: "#fef9e7", color: "#f39c12" }}>
                  <i className="fas fa-clock"></i>
                </div>
                <div className="da-notif-card-info">
                  <div className="da-notif-card-title">Expiring Contracts</div>
                  <div className="da-notif-card-sub">Contracts ending in the next 30 days</div>
                </div>
                <span className="da-badge da-badge--warn">Urgent</span>
              </div>
              <div className="da-notif-items">
                {expiring.length === 0 ? (
                  <div className="da-lots-empty">No expiring contracts.</div>
                ) : (
                  expiring.map(c => (
                    <div className="da-notif-item da-notif-item--warn" key={c.id}>
                      <div>
                        <div className="da-notif-item-lot">{c.lot}</div>
                        <div className="da-notif-item-sub">{c.owner} · {c.type}</div>
                      </div>
                      <div className="da-notif-item-right">
                        <div className={`da-days-tag ${c.daysLeft <= 5 ? "da-days-tag--urgent" : "da-days-tag--warn"}`}>
                          <i className={`fas ${c.daysLeft <= 5 ? "fa-exclamation-triangle" : "fa-hourglass-half"}`}></i>
                          {" "}{c.daysLeft} days left
                        </div>
                        <button
                          className={`da-remind-btn${c.daysLeft <= 5 ? " da-remind-btn--red" : " da-remind-btn--gold"}${reminderSent[`exp-${c.id}`] ? " sent" : ""}`}
                          onClick={() => handleReminder("exp", c.id)}
                          disabled={reminderSent[`exp-${c.id}`]}
                        >
                          {reminderSent[`exp-${c.id}`] ? "✓ Sent" : "Send Reminder"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="da-notif-footer">
                <a href="#" className="da-view-link">View all expiring contracts →</a>
              </div>
            </div>

            {/* Overdue Payments */}
            <div className="da-notif-card da-notif-card--danger">
              <div className="da-notif-card-header">
                <div className="da-notif-icon-wrap" style={{ background: "#fdedec", color: "#c0392b" }}>
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div className="da-notif-card-info">
                  <div className="da-notif-card-title">Overdue Payments</div>
                  <div className="da-notif-card-sub">Payments past due date</div>
                </div>
                <span className="da-badge da-badge--danger">Critical</span>
              </div>
              <div className="da-notif-items">
                {overdue.length === 0 ? (
                  <div className="da-lots-empty">No overdue payments.</div>
                ) : (
                  overdue.map(p => (
                    <div className="da-notif-item da-notif-item--danger" key={p.id}>
                      <div>
                        <div className="da-notif-item-lot">{p.lot}</div>
                        <div className="da-notif-item-sub">Due: {p.amount} · {p.type}</div>
                      </div>
                      <div className="da-notif-item-right">
                        <div className="da-days-tag da-days-tag--overdue">
                          <i className="fas fa-clock"></i> {p.daysOverdue} days overdue
                        </div>
                        <button
                          className={`da-remind-btn da-remind-btn--red${reminderSent[`ov-${p.id}`] ? " sent" : ""}`}
                          onClick={() => handleReminder("ov", p.id)}
                          disabled={reminderSent[`ov-${p.id}`]}
                        >
                          {reminderSent[`ov-${p.id}`] ? "✓ Sent" : "Send Reminder"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="da-notif-footer">
                <a href="#" className="da-view-link">View all overdue payments →</a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Charts Row ── */}
      <div className="da-charts-row">
        {/* Monthly Burials Bar Chart */}
        <div className="da-chart-box">
          <div className="da-chart-header">
            <h3>
              <i className="fas fa-chart-bar" style={{ color: "#3670AF", marginRight: 6 }}></i>
              Monthly Burials
            </h3>
            <a href="#" className="da-view-link-gold">View all <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i></a>
          </div>
          <div className="da-bar-chart">
            {MONTHLY_BURIALS.length === 0 ? (
              <div className="da-lots-empty" style={{ width: "100%", height: "140px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                No burial records available.
              </div>
            ) : (
              MONTHLY_BURIALS.map((m, i) => (
                <div className="da-bar-item" key={i}>
                  <div className="da-bar" style={{ height: `${m.height}px` }}></div>
                  <span className="da-bar-label">{m.month}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Grave Types */}
        <div className="da-chart-box">
          <div className="da-chart-header">
            <h3>
              <i className="fas fa-chart-pie" style={{ color: "#3670AF", marginRight: 6 }}></i>
              Grave Types
            </h3>
            <a href="#" className="da-view-link-gold">Details <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i></a>
          </div>
          <div className="da-grave-types">
            {GRAVE_TYPES.length === 0 ? (
              <div className="da-lots-empty" style={{ padding: "1.5rem 0" }}>No grave type records available.</div>
            ) : (
              GRAVE_TYPES.map((g, i) => (
                <div className="da-grave-row" key={i}>
                  <span className="da-grave-dot" style={{ background: g.color, border: g.border }} />
                  <span className="da-grave-label">{g.label}</span>
                  <span className="da-grave-pct">{g.pct}%</span>
                  <div className="da-grave-track">
                    <div className="da-grave-fill" style={{ width: `${g.pct}%`, background: g.color, border: g.border }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="da-activity-section">
        <div className="da-activity-header">
          <h3>
            <i className="fas fa-clock" style={{ color: "#3670AF", marginRight: 8 }}></i>
            Recent Activity
          </h3>
          <a href="#" className="da-view-link-gold">View all <i className="fas fa-arrow-right" style={{ fontSize: "0.7rem" }}></i></a>
        </div>
        <div className="da-activity-list">
          {activities.length === 0 ? (
            <div className="da-lots-empty" style={{ padding: "1.5rem 0" }}>No recent activity records.</div>
          ) : (
            activities.map(act => (
              <div className="da-activity-item" key={act.id}>
                <div className={`da-act-icon da-act-icon--${act.icon}`}>
                  <i className={`fas ${act.iconClass}`}></i>
                </div>
                <div className="da-activity-content">
                  <div className="da-activity-action">
                    {act.title} <span>{act.detail}</span>
                  </div>
                  <div className="da-activity-meta">
                    <i className={`fas ${act.byIcon}`}></i> by {act.by} · {act.time}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Available Slots Map View ── */}
      <div className="da-map-section">
        <div className="da-map-header">
          <h3 className="da-map-title">
            <i className="fas fa-map-marked-alt" style={{ color: "#d4af37", marginRight: 10 }}></i>
            Available Slots Map View
          </h3>
          <div className="da-map-filters">
            <select
              className="da-section-select"
              value={sectionFilter}
              onChange={e => setSectionFilter(e.target.value)}
            >
              <option>All Sections</option>
              <option>Section A</option>
              <option>Section B</option>
              <option>Section C</option>
              <option>Section D</option>
            </select>
            <button
              className={`da-filter-btn${showFilterPanel ? " active" : ""}`}
              onClick={() => setShowFilterPanel(p => !p)}
            >
              <i className="fas fa-search"></i> Filter
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilterPanel && (
          <div className="da-filter-panel">
            <div className="da-filter-group">
              <label className="da-filter-label">Status</label>
              <div className="da-filter-chips">
                {["All", "Available", "Occupied", "Reserved"].map(s => (
                  <button
                    key={s}
                    className={`da-chip${statusFilter === s ? " active" : ""}`}
                    onClick={() => setStatusFilter(s)}
                  >{s}</button>
                ))}
              </div>
            </div>
            <button
              className="da-filter-clear"
              onClick={() => { setStatusFilter("All"); setSectionFilter("All Sections"); setShowFilterPanel(false); }}
            >
              Clear All Filters
            </button>
          </div>
        )}

        <div className="da-map-container">
          {filteredLots.length === 0 ? (
            <div className="da-lots-empty">No lots match the current filters.</div>
          ) : (
            <div className="da-map-grid">
              {filteredLots.map(lot => {
                const isAvailable = lot.status === "Available";
                const isOccupied  = lot.status === "Occupied";
                const isReserved  = lot.status === "Reserved";
                return (
                  <div
                    key={lot.id}
                    className={`da-lot-card da-lot-card--${lot.status.toLowerCase()}${isAvailable ? " clickable" : ""}`}
                    onClick={() => handleLotClick(lot)}
                    title={isAvailable ? "Click to reserve" : ""}
                  >
                    <div className="da-lot-icon">
                      {isAvailable && <i className="fas fa-check-circle" style={{ color: "#27ae60", fontSize: "1.5rem" }}></i>}
                      {isOccupied  && <i className="fas fa-times-circle" style={{ color: "#c0392b", fontSize: "1.5rem" }}></i>}
                      {isReserved  && <i className="fas fa-clock"        style={{ color: "#f39c12", fontSize: "1.5rem" }}></i>}
                    </div>
                    <div className="da-lot-id">{lot.id}</div>
                    <div className={`da-lot-status-label da-lot-status--${lot.status.toLowerCase()}`}>
                      {isAvailable ? "✓ Available" : isOccupied ? "✗ Occupied" : "⏳ Reserved"}
                    </div>
                    <div className="da-lot-type">{lot.type}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="da-map-legend">
            <div className="da-leg-item">
              <span className="da-leg-dot" style={{ background: "#27ae60" }}></span>
              <span>Available</span>
              <span className="da-leg-note">(Click to reserve)</span>
            </div>
            <div className="da-leg-item">
              <span className="da-leg-dot" style={{ background: "#c0392b" }}></span>
              <span>Occupied</span>
            </div>
            <div className="da-leg-item">
              <span className="da-leg-dot" style={{ background: "#f39c12" }}></span>
              <span>Reserved</span>
            </div>
            <div className="da-leg-total">
              <i className="fas fa-circle" style={{ color: "#27ae60" }}></i>
              {" "}Total Available: <strong style={{ color: "#1a3d5c" }}>{freeSlots}</strong>
            </div>
          </div>
        </div>
      </div>



      {/* ── Reserve Modal ── */}
      {reserveTarget && (
        <ReserveModal
          lot={reserveTarget}
          onClose={() => setReserveTarget(null)}
          onConfirm={handleReserveConfirm}
        />
      )}
    </div>
  );
}