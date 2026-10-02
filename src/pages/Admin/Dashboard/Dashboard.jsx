import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { getSystemDate, getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";

import Header from "../../../components/Header/Header";
import "./Dashboard.css";

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



// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();

  // Backend collections
  const [users, setUsers] = useState([]);
  const [plots, setPlots] = useState([]);
  const [burials, setBurials] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sysDateState, setSysDateState] = useState(() => ({
    iso: getSystemDateISO(),
    date: getSystemDate(),
  }));

  const [toasts, setToasts] = useState([]);
  const [reminderSent, setReminderSent] = useState({});

  const toastIdRef = useRef(0);

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

  // ── Real-time Firestore Subscriptions ──────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      if (!isMounted) return;
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Users listener error:", err));

    const unsubPlots = onSnapshot(collection(db, "plots"), (snap) => {
      if (!isMounted) return;
      setPlots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Plots listener error:", err));

    const unsubBurials = onSnapshot(collection(db, "burials"), (snap) => {
      if (!isMounted) return;
      setBurials(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Burials listener error:", err));

    const unsubPayments = onSnapshot(collection(db, "payments"), (snap) => {
      if (!isMounted) return;
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Payments listener error:", err));

    const unsubHistory = onSnapshot(collection(db, "payment_history"), (snap) => {
      if (!isMounted) return;
      setPaymentHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Payment history listener error:", err));

    const unsubAudit = onSnapshot(collection(db, "auditLogs"), (snap) => {
      if (!isMounted) return;
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Audit logs listener error:", err));

    const unsubDate = subscribeSystemDate(() => {
      if (!isMounted) return;
      setSysDateState({
        iso: getSystemDateISO(),
        date: getSystemDate(),
      });
    });

    return () => {
      isMounted = false;
      unsubUsers();
      unsubPlots();
      unsubBurials();
      unsubPayments();
      unsubHistory();
      unsubAudit();
      unsubDate();
    };
  }, []);

  const todayStr = sysDateState.iso;
  const currentYearMonth = todayStr.slice(0, 7); // e.g. "2026-10"

  const currentMonthLabel = useMemo(() => {
    try {
      const [y, m] = todayStr.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleString("en-US", { month: "long", year: "numeric" });
    } catch {
      return "This Month";
    }
  }, [todayStr]);

  // ── Stat 1: Total Users & Admins ───────────────────────────────────────────
  const totalUsersCount = users.length;
  const activeAdmins = useMemo(() => {
    return users.filter(u => u.role === "admin" && (u.status === "active" || u.isActivate !== false));
  }, [users]);
  const newUsersThisMonth = useMemo(() => {
    return users.filter((u) => {
      let d = "";
      if (u.createdAt?.toDate) {
        try { d = u.createdAt.toDate().toISOString().split("T")[0]; } catch {}
      } else if (u.created_at?.toDate) {
        try { d = u.created_at.toDate().toISOString().split("T")[0]; } catch {}
      } else if (typeof u.createdAt === "string") {
        d = u.createdAt.split("T")[0];
      } else if (typeof u.created_at === "string") {
        d = u.created_at.split("T")[0];
      }
      return d && d.startsWith(currentYearMonth);
    }).length;
  }, [users, currentYearMonth]);
  const adminPct = totalUsersCount > 0 ? Math.round((activeAdmins.length / totalUsersCount) * 100) : 0;

  // ── Stat 2: Active Graves (Occupied plots) ──────────────────────────────────
  const occupiedPlotsCount = useMemo(() => {
    return plots.filter((p) => {
      const status = (p.status || "").toLowerCase().trim();
      return status === "occupied" || status === "partial" || Number(p.occupiedCount || 0) > 0;
    }).length;
  }, [plots]);

  const availableSlotsCount = useMemo(() => {
    return plots.filter((p) => (p.status || "").toLowerCase().trim() === "available").length;
  }, [plots]);

  // ── Stat 3: Monthly Revenue ────────────────────────────────────────────────
  const monthlyRevenue = useMemo(() => {
    const thisMonthPayments = paymentHistory.filter((h) => {
      const d = h.payment_date || (h.created_at?.toDate ? h.created_at.toDate().toISOString().split("T")[0] : "");
      return d && d.startsWith(currentYearMonth);
    });
    return thisMonthPayments.reduce((sum, h) => sum + Number(h.amount || 0), 0);
  }, [paymentHistory, currentYearMonth]);

  const thisMonthTxCount = useMemo(() => {
    return paymentHistory.filter((h) => {
      const d = h.payment_date || (h.created_at?.toDate ? h.created_at.toDate().toISOString().split("T")[0] : "");
      return d && d.startsWith(currentYearMonth);
    }).length;
  }, [paymentHistory, currentYearMonth]);

  // ── Stat 4: Burials This Month ─────────────────────────────────────────────
  const burialsThisMonthCount = useMemo(() => {
    return burials.filter((b) => {
      const buried = b.date_buried ? String(b.date_buried).split("T")[0] : "";
      let created = "";
      if (b.created_at?.toDate) {
        try { created = b.created_at.toDate().toISOString().split("T")[0]; } catch {}
      } else if (typeof b.created_at === "string") {
        created = b.created_at.split("T")[0];
      }
      return (buried && buried.startsWith(currentYearMonth)) || (created && created.startsWith(currentYearMonth));
    }).length;
  }, [burials, currentYearMonth]);

  // ── Notifications: Expiring Contracts (Next 30 days) ───────────────────────
  const expiring = useMemo(() => {
    if (plots.length === 0) return [];
    const list = [];
    plots.forEach((plot) => {
      const isPerpetual = plot.contract === "Perpetual" || plot.contract_type === "Perpetual" || plot.is_perpetual === true;
      if (isPerpetual) return;

      const code = String(plot.plotCode || plot.name || plot.id || "").toUpperCase();
      const isLeasePlot = code.startsWith("AP") || code.startsWith("SN") || String(plot.graveType || plot.grave_type || "").toLowerCase().includes("apartment") || String(plot.graveType || plot.grave_type || "").toLowerCase().includes("single niche");
      if (!isLeasePlot && !plot.contract_expiration_date) return;

      let expDate = plot.contract_expiration_date;
      if (!expDate && plot.contract_start_date) {
        const years = Number(plot.contract_years || 7);
        const d = new Date(plot.contract_start_date);
        if (!isNaN(d.getTime())) {
          d.setFullYear(d.getFullYear() + years);
          expDate = d.toISOString().split("T")[0];
        }
      }

      if (expDate) {
        const diffTime = new Date(expDate) - new Date(todayStr);
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0 && daysLeft <= 30) {
          list.push({
            id: plot.id,
            lot: plot.plotCode || `Plot ${plot.id}`,
            owner: plot.owner || "Grave Lot Holder",
            type: plot.graveType || plot.grave_type || (code.startsWith("AP") ? "Apartment" : "Single Niche"),
            daysLeft,
            expirationDate: expDate
          });
        }
      }
    });
    return list.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }, [plots, todayStr]);

  // ── Notifications: Overdue Payments ────────────────────────────────────────
  const overdue = useMemo(() => {
    if (payments.length === 0) return [];
    const list = [];
    payments.forEach((pay) => {
      const balance = Number(pay.balance || 0);
      const status = String(pay.payment_status || "").toLowerCase().trim();
      if (balance <= 0 || status === "paid") return;

      const dueDate = pay.due_date || pay.next_due_date;
      const isOverdue = (dueDate && dueDate < todayStr) || status === "overdue";
      if (isOverdue) {
        const linkedPlot = plots.find((p) => p.id === pay.plot_id);
        const lotTag = linkedPlot?.plotCode ? `Lot ${linkedPlot.plotCode}` : (pay.plot_id ? `Lot ${pay.plot_id}` : "Account");
        const daysOverdue = dueDate
          ? Math.max(1, Math.floor((new Date(todayStr) - new Date(dueDate)) / (1000 * 60 * 60 * 24)))
          : 1;

        const mAmount = Number(pay.monthly_installment || pay.monthly_amount || balance);
        list.push({
          id: pay.id,
          lot: lotTag,
          amount: `₱${mAmount.toLocaleString()}`,
          type: pay.installment_duration ? `${pay.installment_duration} Mo. Plan` : "Installment Plan",
          daysOverdue
        });
      }
    });
    return list.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
  }, [payments, plots, todayStr]);

  // ── Monthly Burials Bar Chart (Past 6 Months) ──────────────────────────────
  const monthlyBurials = useMemo(() => {
    if (burials.length === 0) return [];

    const months = [];
    const now = sysDateState.date;
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const key = `${y}-${m}`;
      const label = d.toLocaleString("en-US", { month: "short" });
      months.push({ key, month: label, count: 0 });
    }

    burials.forEach((b) => {
      const buried = b.date_buried ? String(b.date_buried).split("T")[0] : "";
      let created = "";
      if (b.created_at?.toDate) {
        try { created = b.created_at.toDate().toISOString().split("T")[0]; } catch {}
      } else if (typeof b.created_at === "string") {
        created = b.created_at.split("T")[0];
      }
      const dateVal = buried || created;
      if (!dateVal) return;
      const ym = dateVal.slice(0, 7);
      const found = months.find((m) => m.key === ym);
      if (found) found.count++;
    });

    const totalInWindow = months.reduce((sum, m) => sum + m.count, 0);
    if (totalInWindow === 0) return [];

    const maxCount = Math.max(...months.map((m) => m.count), 1);
    return months.map((m) => ({
      month: m.month,
      count: m.count,
      height: Math.max(10, Math.round((m.count / maxCount) * 120))
    }));
  }, [burials, sysDateState]);

  // ── Grave Types Distribution ───────────────────────────────────────────────
  const graveTypes = useMemo(() => {
    if (plots.length === 0) return [];

    const typeMap = {};
    plots.forEach((p) => {
      let typeName = p.graveType || p.grave_type || "";
      if (!typeName) {
        const code = String(p.plotCode || p.id || "").toUpperCase();
        if (code.startsWith("AP")) typeName = "Apartment";
        else if (code.startsWith("SN")) typeName = "Single Niche";
        else if (code.startsWith("MA") || code.startsWith("ML")) typeName = "Mausoleum";
        else if (code.startsWith("LG") || code.startsWith("FN")) typeName = "Lawn Grave";
        else typeName = "Ground Grave";
      }
      typeName = typeName.trim();
      if (!typeMap[typeName]) typeMap[typeName] = 0;
      typeMap[typeName]++;
    });

    const totalPlots = plots.length;
    const colors = {
      "Lawn Grave": { color: "#27ae60", border: "1px solid #1e8449" },
      "Ground Grave": { color: "#27ae60", border: "1px solid #1e8449" },
      "Single Niche": { color: "#3670AF", border: "1px solid #285a8e" },
      "Apartment": { color: "#8e44ad", border: "1px solid #71368a" },
      "Mausoleum": { color: "#d4af37", border: "1px solid #b8942e" },
      "Bone Vault": { color: "#e67e22", border: "1px solid #d35400" },
      "Columbarium": { color: "#16a085", border: "1px solid #117a65" },
    };

    return Object.entries(typeMap).map(([label, count], idx) => {
      const pct = totalPlots > 0 ? Math.round((count / totalPlots) * 100) : 0;
      const paletteKeys = Object.keys(colors);
      const matched = colors[label] || colors[paletteKeys[idx % paletteKeys.length]];
      return {
        label,
        count,
        pct,
        color: matched.color,
        border: matched.border
      };
    }).sort((a, b) => b.count - a.count);
  }, [plots]);

  // ── Recent Activity (from Audit Logs) ──────────────────────────────────────
  const activities = useMemo(() => {
    if (auditLogs.length === 0) return [];

    const sorted = [...auditLogs].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.timestampISO ? new Date(a.timestampISO).getTime() : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.timestampISO ? new Date(b.timestampISO).getTime() : 0);
      return timeB - timeA;
    });

    return sorted.slice(0, 5).map((log) => {
      let icon = "silver";
      let iconClass = "fa-info-circle";
      const mod = String(log.module || log.action || "").toLowerCase();
      if (mod.includes("user") || mod.includes("account")) {
        icon = "blue";
        iconClass = "fa-user-check";
      } else if (mod.includes("pay") || mod.includes("pos")) {
        icon = "gold";
        iconClass = "fa-receipt";
      } else if (mod.includes("plot") || mod.includes("map") || mod.includes("grave")) {
        icon = "green";
        iconClass = "fa-th-large";
      } else if (mod.includes("burial") || mod.includes("interment")) {
        icon = "purple";
        iconClass = "fa-cross";
      }

      let timeStr = "";
      if (log.createdAt?.toDate) {
        try {
          const d = log.createdAt.toDate();
          timeStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {}
      } else if (log.timestampISO) {
        try {
          const d = new Date(log.timestampISO);
          timeStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {}
      }

      return {
        id: log.id,
        title: log.action || "System Action",
        detail: log.description || "",
        by: log.userEmail?.split("@")[0] || log.userEmail || "System",
        byIcon: "fa-user",
        time: timeStr || "Recent",
        icon,
        iconClass
      };
    });
  }, [auditLogs]);

  // Handlers
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

  return (
    <div className="da-wrapper">
      <Header page="dashboard" />
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* ── Stats Grid ── */}
      <div className="da-stats-grid">
        {/* Total Users */}
        <div className="da-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/users-management")}>
          <i className="fas fa-users da-stat-icon"></i>
          <div className="da-stat-label">Total Users</div>
          <div className="da-stat-value">{totalUsersCount}</div>
          <div className="da-stat-change">
            <i className="fas fa-user-plus"></i> {newUsersThisMonth} new this month
          </div>
          <div className="da-stat-sub">
            <i className="fas fa-info-circle"></i> {activeAdmins.length} active admin{activeAdmins.length === 1 ? "" : "s"} ({adminPct}%)
          </div>
        </div>

        {/* Active Graves */}
        <div className="da-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/grave-management")}>
          <i className="fas fa-monument da-stat-icon"></i>
          <div className="da-stat-label">Active Graves</div>
          <div className="da-stat-value">{occupiedPlotsCount}</div>
          <div className="da-stat-change">
            <i className="fas fa-check-circle"></i> {availableSlotsCount} available slots
          </div>
          <div className="da-stat-sub">
            <i className="fas fa-layer-group"></i> Out of {plots.length} total plots
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="da-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/reports")}>
          <i className="fas fa-coins da-stat-icon"></i>
          <div className="da-stat-label">Monthly Revenue</div>
          <div className="da-stat-value">₱{monthlyRevenue.toLocaleString()}</div>
          <div className="da-stat-change">
            <i className="fas fa-receipt"></i> {thisMonthTxCount} transaction{thisMonthTxCount === 1 ? "" : "s"}
          </div>
          <div className="da-stat-sub">
            <i className="fas fa-calendar-alt"></i> Revenue for {currentMonthLabel}
          </div>
        </div>

        {/* Burials This Month */}
        <div className="da-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/reports")}>
          <i className="fas fa-cross da-stat-icon"></i>
          <div className="da-stat-label">Burials This Month</div>
          <div className="da-stat-value">{burialsThisMonthCount}</div>
          <div className="da-stat-change">
            <i className="fas fa-calendar-check"></i> {currentMonthLabel}
          </div>
          <div className="da-stat-sub">
            <i className="fas fa-cross"></i> {burials.length} total recorded interments
          </div>
        </div>
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
            <button
              onClick={() => navigate("/admin/reports")}
              className="da-view-link-gold"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
            >
              View all <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i>
            </button>
          </div>
          <div className="da-bar-chart">
            {monthlyBurials.length === 0 ? (
              <div className="da-lots-empty" style={{ width: "100%", height: "140px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                No burial records available.
              </div>
            ) : (
              monthlyBurials.map((m, i) => (
                <div className="da-bar-item" key={i} title={`${m.month}: ${m.count} burial${m.count === 1 ? '' : 's'}`}>
                  <div className="da-bar" style={{ height: `${m.height}px` }}></div>
                  <span className="da-bar-label">{m.month}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Grave Types Distribution */}
        <div className="da-chart-box">
          <div className="da-chart-header">
            <h3>
              <i className="fas fa-chart-pie" style={{ color: "#3670AF", marginRight: 6 }}></i>
              Grave Types
            </h3>
            <button
              onClick={() => navigate("/admin/reports")}
              className="da-view-link-gold"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
            >
              Details <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i>
            </button>
          </div>
          <div className="da-grave-types">
            {graveTypes.length === 0 ? (
              <div className="da-lots-empty" style={{ padding: "1.5rem 0" }}>No grave type records available.</div>
            ) : (
              graveTypes.map((g, i) => (
                <div className="da-grave-row" key={i}>
                  <span className="da-grave-dot" style={{ background: g.color, border: g.border }} />
                  <span className="da-grave-label">{g.label} ({g.count})</span>
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

      {/* ── Recent Activity (from Audit Logs) ── */}
      <div className="da-activity-section">
        <div className="da-activity-header">
          <h3>
            <i className="fas fa-clock" style={{ color: "#3670AF", marginRight: 8 }}></i>
            Recent Activity
          </h3>
          <button
            onClick={() => navigate("/admin/audit-log")}
            className="da-view-link-gold"
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
          >
            View all <i className="fas fa-arrow-right" style={{ fontSize: "0.7rem" }}></i>
          </button>
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


    </div>
  );
}