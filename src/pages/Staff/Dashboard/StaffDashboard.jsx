import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { getSystemDate, getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import Header from "../../../components/Header/Header";
import "./dashboards.css";

// ── Toast component ──────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="ds-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`ds-toast ds-toast-${t.type}`}>
          <span>{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="ds-toast-close">×</button>
        </div>
      ))}
    </div>
  );
}

// ── Helper to resolve client name from related records ──────────────────────
function resolveClientName(item, paymentsList = [], clientsList = [], plotsList = [], burialsList = []) {
  if (item.client_name?.trim()) return item.client_name.trim();
  if (item.clientName?.trim()) return item.clientName.trim();
  if (item.client?.trim()) return item.client.trim();

  let pay = item;
  if (item.pay_id) {
    pay = paymentsList.find((p) => p.id === item.pay_id) || {};
  }
  if (pay.client_name?.trim()) return pay.client_name.trim();
  if (pay.clientName?.trim()) return pay.clientName.trim();

  const uid = item.user_id || pay.user_id;
  if (uid) {
    const client = clientsList.find((c) => c.user_id === uid || c.id === uid);
    if (client) {
      const first = client.first_name || client.firstName || "";
      const last = client.last_name || client.lastName || "";
      const full = `${first} ${last}`.trim();
      if (full) return full;
      if (client.name?.trim()) return client.name.trim();
    }
  }

  const pid = item.plot_id || pay.plot_id;
  if (pid) {
    const plot = plotsList.find((p) => p.id === pid);
    if (plot?.owner?.trim()) return plot.owner.trim();
  }

  if (item.burial_id || pay.burial_id || pid) {
    const burial = burialsList.find((b) => b.id === (item.burial_id || pay.burial_id) || b.plot_id === pid);
    if (burial?.name?.trim()) return `${burial.name.trim()} (Family)`;
  }

  return "Client Account";
}

// ── Helper for initials ─────────────────────────────────────────────────────
function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StaffDashboard() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // Real-time backend collections
  const [burials, setBurials] = useState([]);
  const [plots, setPlots] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [wakeBookings, setWakeBookings] = useState([]);
  const [clients, setClients] = useState([]);
  const [sysDateState, setSysDateState] = useState(() => ({
    iso: getSystemDateISO(),
    date: getSystemDate(),
  }));

  // Toast cleanup
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((prev) => prev.slice(1)), 3500);
    return () => clearTimeout(t);
  }, [toasts]);

  const addToast = (message, type = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ── Real-Time Subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const unsubBurials = onSnapshot(collection(db, "burials"), (snap) => {
      if (!isMounted) return;
      setBurials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Burials listener error:", err));

    const unsubPlots = onSnapshot(collection(db, "plots"), (snap) => {
      if (!isMounted) return;
      setPlots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Plots listener error:", err));

    const unsubPayments = onSnapshot(collection(db, "payments"), (snap) => {
      if (!isMounted) return;
      setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Payments listener error:", err));

    const unsubHistory = onSnapshot(collection(db, "payment_history"), (snap) => {
      if (!isMounted) return;
      setPaymentHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("History listener error:", err));

    const unsubWake = onSnapshot(collection(db, "wakeSpaceRental"), (snap) => {
      if (!isMounted) return;
      setWakeBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Wake listener error:", err));

    const unsubClients = onSnapshot(collection(db, "clients"), (snap) => {
      if (!isMounted) return;
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Clients listener error:", err));

    const unsubDate = subscribeSystemDate(() => {
      if (!isMounted) return;
      setSysDateState({
        iso: getSystemDateISO(),
        date: getSystemDate(),
      });
    });

    return () => {
      isMounted = false;
      unsubBurials();
      unsubPlots();
      unsubPayments();
      unsubHistory();
      unsubWake();
      unsubClients();
      unsubDate();
    };
  }, []);

  const todayStr = sysDateState.iso;

  // ── 1. Burials Registered Today ────────────────────────────────────────────
  const burialsRegisteredToday = useMemo(() => {
    return burials.filter((b) => {
      let regDate = "";
      if (b.created_at?.toDate) {
        try { regDate = b.created_at.toDate().toISOString().split("T")[0]; } catch {}
      } else if (typeof b.created_at === "string") {
        regDate = b.created_at.split("T")[0];
      }
      const buriedDate = b.date_buried ? String(b.date_buried).split("T")[0] : "";
      return regDate === todayStr || buriedDate === todayStr;
    });
  }, [burials, todayStr]);

  // ── 2. Available Slots (read plot available) ───────────────────────────────
  const availableSlots = useMemo(() => {
    return plots.filter((p) => (p.status || "").toLowerCase().trim() === "available");
  }, [plots]);

  // ── 3. Pending Payments (means installment with pending balance) ───────────
  const pendingInstallments = useMemo(() => {
    return payments.filter((p) => {
      const balance = Number(p.balance || 0);
      const status = (p.payment_status || "").toLowerCase().trim();
      return balance > 0 && status !== "paid";
    });
  }, [payments]);

  // ── 4. Wake Reservations for a Month ───────────────────────────────────────
  const wakeReservationsMonth = useMemo(() => {
    const currentYearMonth = todayStr.slice(0, 7); // "YYYY-MM"
    return wakeBookings.filter((b) => {
      if (b.status === "cancelled") return false;
      const sYM = b.startDate ? String(b.startDate).slice(0, 7) : "";
      const eYM = b.endDate ? String(b.endDate).slice(0, 7) : "";
      let cYM = "";
      if (b.createdAt?.toDate) {
        try { cYM = b.createdAt.toDate().toISOString().slice(0, 7); } catch {}
      } else if (typeof b.createdAt === "string") {
        cYM = b.createdAt.slice(0, 7);
      }
      return sYM === currentYearMonth || eYM === currentYearMonth || cYM === currentYearMonth;
    });
  }, [wakeBookings, todayStr]);

  const currentMonthLabel = useMemo(() => {
    try {
      const [y, m] = todayStr.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleString("en-US", { month: "long", year: "numeric" });
    } catch {
      return "This Month";
    }
  }, [todayStr]);

  // ── 5. Recent Transactions in Payment History ──────────────────────────────
  const recentTransactions = useMemo(() => {
    const sorted = [...paymentHistory].sort((a, b) => {
      const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.payment_date || 0).getTime();
      const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.payment_date || 0).getTime();
      return timeB - timeA;
    });

    return sorted.slice(0, 5).map((tx) => {
      const linkedPayment = payments.find((p) => p.id === tx.pay_id) || {};
      const clientName = resolveClientName(tx, payments, clients, plots, burials);
      const plot = plots.find((p) => p.id === linkedPayment.plot_id);
      const lotTag = plot?.plotCode ? `Lot ${plot.plotCode}` : "";
      const method = tx.payment_method || "Cash";
      const desc = tx.notes || (lotTag ? `${method} · ${lotTag}` : method);

      let iconColor = "gold";
      const mLower = method.toLowerCase();
      if (mLower.includes("gcash") || mLower.includes("online") || mLower.includes("bank")) {
        iconColor = "blue";
      } else if (mLower.includes("cash")) {
        iconColor = "gold";
      } else {
        iconColor = "green";
      }

      return {
        id: tx.id,
        name: clientName,
        or: tx.receipt || "Receipt",
        desc: `${desc} · ₱${Number(tx.amount || 0).toLocaleString()}`,
        icon: iconColor,
        date: tx.payment_date || "",
      };
    });
  }, [paymentHistory, payments, clients, plots, burials]);

  // ── 7. Installment Payments ────────────────────────────────────────────────
  const installmentAccounts = useMemo(() => {
    return pendingInstallments.slice(0, 5).map((pay) => {
      const clientName = resolveClientName(pay, payments, clients, plots, burials);
      const plot = plots.find((plt) => plt.id === pay.plot_id);
      const lotTag = plot?.plotCode ? `Lot ${plot.plotCode}` : "";

      let monthlyAmt = Number(pay.monthly_installment || pay.monthly_amount || 0);
      const balance = Number(pay.balance || 0);
      if (!monthlyAmt || monthlyAmt <= 0) {
        if (pay.total && Number(pay.total) > 0) {
          monthlyAmt = Math.round(Number(pay.total) / 12);
        } else if (balance > 0) {
          monthlyAmt = Math.round(balance / 6);
        }
      }
      if (balance > 0 && monthlyAmt > balance) {
        monthlyAmt = balance;
      }

      const planDesc = pay.installment_duration ? `${pay.installment_duration} Plan` : (lotTag ? `Installment (${lotTag})` : "Monthly Installment");
      const dueDate = pay.due_date || pay.next_due_date || "";

      const sysHour = sysDateState.date.getHours();
      const isPastCutoff = sysHour >= 18;
      const isOverdue = (dueDate && dueDate < todayStr) || (dueDate && dueDate === todayStr && isPastCutoff) || pay.payment_status === "overdue";
      const isDueToday = (dueDate && dueDate === todayStr && !isPastCutoff);

      let timeLabel = dueDate ? `Due: ${dueDate}` : "Active";
      let timeColor = "#9ca3af";
      if (isOverdue) {
        timeLabel = "Overdue";
        timeColor = "#c0392b";
      } else if (isDueToday) {
        timeLabel = "Due Today";
        timeColor = "#d97706";
      }

      return {
        id: pay.id,
        avatar: getInitials(clientName),
        name: clientName,
        installment: planDesc,
        amount: `₱${monthlyAmt.toLocaleString()}`,
        time: timeLabel,
        timeColor,
      };
    });
  }, [pendingInstallments, payments, clients, plots, burials, todayStr, sysDateState]);

  return (
    <div className="ds-wrapper">
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* ── Header ── */}
      <Header page="dashboard" />

      {/* ── Stats Grid ── */}
      <div className="ds-stats-grid">
        {/* 1. Burials Registered Today */}
        <div className="ds-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/staff/burials")}>
          <i className="fas fa-cross ds-stat-icon"></i>
          <div className="ds-stat-label">Burials Today</div>
          <div className="ds-stat-value">{burialsRegisteredToday.length}</div>
          <div className="ds-stat-change up">
            <i className="fas fa-calendar-check"></i> {todayStr}
          </div>
          <div className="ds-stat-sub">
            <i className="fas fa-info-circle"></i> {burialsRegisteredToday.length === 1 ? "1 burial registered/scheduled" : `${burialsRegisteredToday.length} burials registered/scheduled`}
          </div>
        </div>

        {/* 2. Available Slots (read plot available) */}
        <div className="ds-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/staff/plots")}>
          <i className="fas fa-th-large ds-stat-icon"></i>
          <div className="ds-stat-label">Available Slots</div>
          <div className="ds-stat-value">{availableSlots.length}</div>
          <div className="ds-stat-change up">
            <i className="fas fa-check-circle"></i> Available plots
          </div>
          <div className="ds-stat-sub">
            <i className="fas fa-layer-group"></i> Out of {plots.length} total plots
          </div>
        </div>

        {/* 3. Pending Payments (means installment) */}
        <div className="ds-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/staff/payments")}>
          <i className="fas fa-coins ds-stat-icon"></i>
          <div className="ds-stat-label">Pending Payments</div>
          <div className="ds-stat-value">{pendingInstallments.length}</div>
          <div className="ds-stat-change down">
            <i className="fas fa-clock"></i> Installments
          </div>
          <div className="ds-stat-sub">
            <i className="fas fa-file-invoice-dollar"></i> Active installment plans
          </div>
        </div>

        {/* 4. Wake Reservations for a month */}
        <div className="ds-stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/staff/wake-spaces")}>
          <i className="fas fa-church ds-stat-icon"></i>
          <div className="ds-stat-label">Wake Reservations</div>
          <div className="ds-stat-value">{wakeReservationsMonth.length}</div>
          <div className="ds-stat-change up">
            <i className="fas fa-calendar-alt"></i> This Month
          </div>
          <div className="ds-stat-sub">
            <i className="fas fa-door-open"></i> {currentMonthLabel}
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="ds-main-grid">

        {/* 1. Recent Transactions from Payment History */}
        <div className="ds-chart-box">
          <div className="ds-chart-header">
            <h3>
              <i className="fas fa-receipt" style={{ color: "#d4af37", marginRight: 6 }}></i>
              Recent Transactions
            </h3>
            <button
              onClick={() => navigate("/staff/payments")}
              className="ds-view-link-gold"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
            >
              View all <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i>
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {recentTransactions.map((tx) => (
              <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: tx.icon === "gold" ? "#fef9e7" : tx.icon === "blue" ? "#faf3e0" : "#eafaf1", color: tx.icon === "gold" ? "#f39c12" : tx.icon === "blue" ? "#d4af37" : "#27ae60", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className="fas fa-check"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.or} · {tx.desc}</div>
                </div>
                {tx.date && <div style={{ fontSize: "11px", color: "#9ca3af", flexShrink: 0 }}>{tx.date}</div>}
              </div>
            ))}
            {recentTransactions.length === 0 && (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
                No recent payment transactions recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* 2. Installment Payments */}
        <div className="ds-chart-box">
          <div className="ds-chart-header">
            <h3>
              <i className="fas fa-coins" style={{ color: "#d4af37", marginRight: 6 }}></i>
              Installment Payments
            </h3>
            <button
              onClick={() => navigate("/staff/payments")}
              className="ds-view-link-gold"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
            >
              View all <i className="fas fa-chevron-right" style={{ fontSize: "0.6rem" }}></i>
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {installmentAccounts.map((pay) => (
              <div key={pay.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1a3d5c", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold", flexShrink: 0 }}>
                  {pay.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pay.name}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pay.installment} · {pay.amount}</div>
                </div>
                <div style={{ fontSize: "12px", color: pay.timeColor, fontWeight: 500, flexShrink: 0 }}>{pay.time}</div>
              </div>
            ))}
            {installmentAccounts.length === 0 && (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
                No active installment payment plans.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaffDashboard;
