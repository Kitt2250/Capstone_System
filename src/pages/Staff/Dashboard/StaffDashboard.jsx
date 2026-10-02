import { useState, useEffect, useRef } from "react";
import "./dashboards.css";
import Header from "../../../components/Header/Header";

const SCHEDULE_DATA = [
  { id: 1, time: '09:00 AM', event: 'Burial - Section A, Block 3, Lot 15', type: 'burial' },
  { id: 2, time: '10:30 AM', event: 'Installment payment - Single Niche Lot B-042', type: 'payment' },
  { id: 3, time: '01:00 PM', event: 'Burial - Section B, Block 1, Lot 8', type: 'burial' },
  { id: 4, time: '02:30 PM', event: 'Wake setup - Chapel A', type: 'wake' },
  { id: 5, time: '03:00 PM', event: 'New lot registration', type: 'registration' },
  { id: 6, time: '04:00 PM', event: 'Burial - Section A, Block 5, Lot 22', type: 'burial' },
];

const TRANSACTIONS = [
  { id: 1, name: 'Rosa Mendoza', or: 'OR-2026-0342', desc: 'Installation - Single Niche', icon: 'gold' },
  { id: 2, name: 'Pedro Garcia', or: 'OR-2026-0341', desc: 'Full Payment - Columbarium', icon: 'blue' },
  { id: 3, name: 'Elena Santos', or: 'OR-2026-0340', desc: 'Installment - Bonevault', icon: 'green' },
];

const PAYMENTS = [
  { id: 1, name: 'Rosa Mendoza', amount: '₱6,250', or: 'OR-2026-0342', desc: 'Single Niche - Monthly', time: '2 hours ago', avatar: 'RM', color: 'gold', installment: '6 of 12 payments' },
  { id: 2, name: 'Pedro Garcia', amount: '₱3,167', or: 'OR-2026-0341', desc: 'Columbarium - Monthly', time: '4 hours ago', avatar: 'PG', color: 'blue', installment: '3 of 12 payments' },
  { id: 3, name: 'Elena Santos', amount: '₱2,500', or: 'OR-2026-0340', desc: 'Bonevault - Monthly', time: 'Yesterday', avatar: 'ES', color: 'green', installment: '4 of 12 payments' },
];

// ── System alert notifications ───────────────────────────────────────────────
const SYSTEM_ALERTS_INIT = [
  {
    id: 1,
    title: "Payment Due Alert",
    body: "Elena Reyes installment OR-2026-0881 (₱3,250) is due on 2026-09-05.",
    time: "5:00:00 PM",
    read: false,
  },
  {
    id: 2,
    title: "Wake space Chapel B reserved",
    body: "Reservation confirmed for tomorrow 09:00 AM.",
    time: "7:45:00 PM",
    read: false,
  },
  {
    id: 3,
    title: "Contract Expiration",
    body: "3 contracts expiring this week.",
    time: "4:00:00 PM",
    read: false,
  },
];

// ── Toast component ──────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="ds-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`ds-toast ds-toast-${t.type}`}>
          <span>{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="ds-toast-close">×</button>
        </div>
      ))}
    </div>
  );
}

// ── Notification Bell Dropdown ───────────────────────────────────────────────
function NotificationDropdown({ alerts, onMarkRead, onMarkAllRead, onClose }) {
  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="ds-notif-dropdown">
      <div className="ds-notif-dropdown-header">
        <span className="ds-notif-dropdown-title">System Alerts ({alerts.length})</span>
        <span className="ds-notif-dropdown-unread">{unreadCount} unread</span>
      </div>

      <div className="ds-notif-dropdown-list">
        {alerts.map(alert => (
          <div
            key={alert.id}
            className={`ds-notif-dropdown-item${alert.read ? " read" : ""}`}
            onClick={() => onMarkRead(alert.id)}
          >
            {!alert.read && <span className="ds-notif-unread-dot" />}
            <div className="ds-notif-dropdown-item-content">
              <div className="ds-notif-dropdown-item-title">{alert.title}</div>
              <div className="ds-notif-dropdown-item-body">{alert.body}</div>
              <div className="ds-notif-dropdown-item-time">{alert.time}</div>
            </div>
          </div>
        ))}
      </div>

      {unreadCount > 0 && (
        <div className="ds-notif-dropdown-footer">
          <button className="ds-notif-mark-all-btn" onClick={onMarkAllRead}>
            <i className="fas fa-check-double"></i> Mark all as read
          </button>
        </div>
      )}
    </div>
  );
}

function StaffDashboard() {
  const [filter, setFilter] = useState('all');
  const [toasts, setToasts] = useState([]);

  const toastIdRef = useRef(0);

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

  const filteredSchedule = SCHEDULE_DATA.filter(item => filter === 'all' || item.type === filter);

  return (
    <div className="ds-wrapper">
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* ── Header ── */}
      <Header page="dashboard" />

      {/* ── Stats Grid ── */}
      <div className="ds-stats-grid">
        <div className="ds-stat-card">
          <div className="ds-stat-label">Burials Today</div>
          <div className="ds-stat-value">3</div>
          <div className="ds-stat-change up">
            <i className="fas fa-arrow-up"></i> +2 vs yesterday
          </div>
          <div className="ds-stat-sub">
            <i className="fas fa-info-circle"></i> 2 scheduled afternoon
          </div>
        </div>
        <div className="ds-stat-card">
          <i className="fas fa-tshirt ds-stat-icon"></i>
          <div className="ds-stat-label">Available Slots</div>
          <div className="ds-stat-value">240</div>
          <div className="ds-stat-change down">
            <i className="fas fa-arrow-down"></i> -8 this week
          </div>
        </div>
        <div className="ds-stat-card">
          <i className="fas fa-coins ds-stat-icon"></i>
          <div className="ds-stat-label">Pending Payments</div>
          <div className="ds-stat-value">12</div>
          <div className="ds-stat-change up">
            <i className="fas fa-arrow-up"></i> +3 vs last week
          </div>
        </div>
        <div className="ds-stat-card">
          <i className="fas fa-cross ds-stat-icon"></i>
          <div className="ds-stat-label">Wake Reservations</div>
          <div className="ds-stat-value">2</div>
          <div className="ds-stat-change up">
            <i className="fas fa-arrow-up"></i> +1 today
          </div>
        </div>
      </div>

      {/* ── Dashboard Grid ── */}
      <div className="ds-main-grid">

        {/* LEFT: Schedule */}
        <div className="ds-chart-box">
          <div className="ds-chart-header">
            <h3>
              <i className="fas fa-clock" style={{ color: "#d4af37", marginRight: 6 }}></i>
              Today's Schedule
            </h3>
            <a href="#" className="ds-view-link-gold">View all <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i></a>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px', flexWrap: 'wrap' }}>
            <button style={{ padding: '6px 12px', borderRadius: '20px', border: filter === 'all' ? '1px solid #1a3d5c' : '1px solid #e5e7eb', background: filter === 'all' ? '#1a3d5c' : 'white', color: filter === 'all' ? 'white' : '#6b7280', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setFilter('all')}>
              All ({SCHEDULE_DATA.length})
            </button>
            <button style={{ padding: '6px 12px', borderRadius: '20px', border: filter === 'burial' ? '1px solid #1a3d5c' : '1px solid #e5e7eb', background: filter === 'burial' ? '#1a3d5c' : 'white', color: filter === 'burial' ? 'white' : '#6b7280', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setFilter('burial')}>
              Burials
            </button>
            <button style={{ padding: '6px 12px', borderRadius: '20px', border: filter === 'payment' ? '1px solid #1a3d5c' : '1px solid #e5e7eb', background: filter === 'payment' ? '#1a3d5c' : 'white', color: filter === 'payment' ? 'white' : '#6b7280', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setFilter('payment')}>
              Payments
            </button>
            <button style={{ padding: '6px 12px', borderRadius: '20px', border: filter === 'wake' ? '1px solid #1a3d5c' : '1px solid #e5e7eb', background: filter === 'wake' ? '#1a3d5c' : 'white', color: filter === 'wake' ? 'white' : '#6b7280', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setFilter('wake')}>
              Wake
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSchedule.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#111827', minWidth: '72px', flexShrink: 0 }}>{item.time}</div>
                <div style={{ flex: 1, fontSize: '13px', color: '#374151', wordBreak: 'break-word', minWidth: 0 }}>{item.event}</div>
                <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: '#e5e7eb', textTransform: 'capitalize', flexShrink: 0 }}>{item.type}</span>
              </div>
            ))}
            {filteredSchedule.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>No items match filter.</div>
            )}
          </div>
        </div>

        {/* RIGHT: Transactions & Payments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <div className="ds-chart-box">
            <div className="ds-chart-header">
              <h3>
                <i className="fas fa-receipt" style={{ color: "#d4af37", marginRight: 6 }}></i>
                Recent Transactions
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {TRANSACTIONS.map(tx => (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: tx.icon === 'gold' ? '#fef9e7' : tx.icon === 'blue' ? '#faf3e0' : '#eafaf1', color: tx.icon === 'gold' ? '#f39c12' : tx.icon === 'blue' ? '#d4af37' : '#27ae60', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-check"></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{tx.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{tx.or} · {tx.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ds-chart-box">
            <div className="ds-chart-header">
              <h3>
                <i className="fas fa-coins" style={{ color: "#d4af37", marginRight: 6 }}></i>
                Installment Payments
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {PAYMENTS.map(pay => (
                <div key={pay.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#1a3d5c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                    {pay.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{pay.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{pay.installment} · {pay.amount}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>{pay.time}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default StaffDashboard;
