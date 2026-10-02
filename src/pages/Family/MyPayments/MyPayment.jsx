import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import Pagination from "../../../components/Pagination/Pagination";
import "./MyPayment.css";
import FamilyTopbar from "./FamilyTopbar";
import { findClientForUser } from "../../../services/clientServices";
import { resolveDueDate } from "../../../services/paymentServices";
import { getSystemDate, getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";

const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH");

// Helper to format date
const formatDisplayDate = (dateVal) => {
  if (!dateVal) return "—";
  try {
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateVal);
  }
};



function MyPayments() {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [userDoc, setUserDoc] = useState(null);

  const [rawPayments, setRawPayments] = useState([]);
  const [rawHistory, setRawHistory] = useState([]);
  const [rawPlots, setRawPlots] = useState([]);
  const [rawClients, setRawClients] = useState([]);
  const [rawBurials, setRawBurials] = useState([]);
  const [rawGraveTypes, setRawGraveTypes] = useState([]);

  // Legacy fallback states
  const [legacySummary, setLegacySummary] = useState(null);
  const [legacyHistory, setLegacyHistory] = useState([]);

  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [loading, setLoading] = useState(true);

  // Active simulated system date/time listener
  const [sysTimestamp, setSysTimestamp] = useState(() => getSystemDate().getTime());

  useEffect(() => {
    const unsubSys = subscribeSystemDate((info) => {
      setSysTimestamp(info.activeTimestamp || getSystemDate().getTime());
    });
    return () => unsubSys();
  }, []);

  // 1. Auth Listener & User profile fetch
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const uSnap = await getDoc(doc(db, "users", user.uid));
          if (uSnap.exists()) {
            setUserDoc(uSnap.data());
          }
        } catch (e) {
          console.warn("Could not load user profile:", e);
        }
      } else {
        setUserDoc(null);
      }
    });

    return () => unsubAuth();
  }, []);

  // 2. Realtime Subscriptions to Firestore collections
  useEffect(() => {
    let paymentsReady = false;
    let historyReady = false;

    const checkReady = () => {
      if (paymentsReady && historyReady) {
        setLoading(false);
      }
    };

    const unsubPayments = onSnapshot(
      collection(db, "payments"),
      (snap) => {
        setRawPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        paymentsReady = true;
        checkReady();
      },
      (err) => {
        console.warn("Error listening to payments:", err);
        paymentsReady = true;
        checkReady();
      }
    );

    const unsubHistory = onSnapshot(
      collection(db, "payment_history"),
      (snap) => {
        setRawHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        historyReady = true;
        checkReady();
      },
      (err) => {
        console.warn("Error listening to payment_history:", err);
        historyReady = true;
        checkReady();
      }
    );

    const unsubPlots = onSnapshot(
      collection(db, "plots"),
      (snap) => {
        setRawPlots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Error listening to plots:", err)
    );

    const unsubClients = onSnapshot(
      collection(db, "clients"),
      (snap) => {
        setRawClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Error listening to clients:", err)
    );

    const unsubBurials = onSnapshot(
      collection(db, "burials"),
      (snap) => {
        setRawBurials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Error listening to burials:", err)
    );

    const handleGraveTypeSnap = (snap) => {
      setRawGraveTypes((prev) => {
        const incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const map = new Map(prev.map((g) => [g.id, g]));
        incoming.forEach((g) => map.set(g.id, g));
        return Array.from(map.values());
      });
    };
    const unsubGraveTypes1 = onSnapshot(collection(db, "grave_types"), handleGraveTypeSnap, () => {});
    const unsubGraveTypes2 = onSnapshot(collection(db, "grave_type"), handleGraveTypeSnap, () => {});

    // Fallbacks to legacy collections if any exist
    const unsubLegacySummary = onSnapshot(
      collection(db, "family_payment_summary"),
      (snap) => {
        if (!snap.empty) {
          setLegacySummary(snap.docs[0].data());
        }
      },
      () => {}
    );

    const unsubLegacyHistory = onSnapshot(
      collection(db, "family_payments"),
      (snap) => {
        setLegacyHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => {}
    );

    return () => {
      unsubPayments();
      unsubHistory();
      unsubPlots();
      unsubClients();
      unsubBurials();
      unsubGraveTypes1();
      unsubGraveTypes2();
      unsubLegacySummary();
      unsubLegacyHistory();
    };
  }, []);

  // 3. Connect payments to the logged-in Family User
  const connectedPaymentData = useMemo(() => {
    if (!currentUser) {
      return {
        accounts: [],
        summary: null,
        history: [],
      };
    }

    const uid = currentUser.uid;
    const userEmail = (currentUser.email || userDoc?.email || "").toLowerCase().trim();
    const userName = (userDoc?.name || currentUser.displayName || "").toLowerCase().trim();

    // Step A: Find all client record IDs matching this user
    const matchedClient = findClientForUser(currentUser, userDoc, rawClients);
    const clientIds = new Set();
    if (matchedClient) {
      clientIds.add(matchedClient.id);
      if (matchedClient.user_id) clientIds.add(matchedClient.user_id);
    }
    rawClients.forEach((c) => {
      if (
        c.user_id === uid ||
        c.userId === uid ||
        c.uid === uid ||
        c.id === uid ||
        (userEmail && c.email && c.email.toLowerCase().trim() === userEmail)
      ) {
        clientIds.add(c.id);
        if (c.user_id) clientIds.add(c.user_id);
      }
    });

    // Step B: Find all plot IDs owned by or linked to this user/client
    const matchingPlotIds = new Set();
    rawPlots.forEach((p) => {
      const isPlotOwner =
        p.user_id === uid ||
        p.userId === uid ||
        (p.user_id && clientIds.has(p.user_id)) ||
        (userName && p.owner && p.owner.toLowerCase().trim() === userName);

      if (isPlotOwner) {
        matchingPlotIds.add(p.id);
      }
    });

    // Step C: Filter payments from the "payments" collection
    const userPayments = rawPayments.filter((pmt) => {
      // 1. Direct user_id match
      if (pmt.user_id === uid || pmt.userId === uid) return true;

      // 2. Client match
      if (pmt.user_id && clientIds.has(pmt.user_id)) return true;
      if (pmt.client_id && clientIds.has(pmt.client_id)) return true;

      // 3. Plot match
      if (pmt.plot_id && matchingPlotIds.has(pmt.plot_id)) return true;

      return false;
    });

    // Step D: Map each payment into a rich account structure
    const accounts = userPayments.map((pmt) => {
      const linkedPlot = rawPlots.find((p) => p.id === pmt.plot_id);
      const linkedBurial = rawBurials.find(
        (b) => b.id === pmt.burial_id || (linkedPlot && b.plot_id === linkedPlot.id)
      );

      const total = Number(pmt.total || 0);
      const balance = Number(pmt.balance ?? 0);
      const paid = Math.max(0, total - balance);

      const plotCode = linkedPlot?.plotCode || linkedPlot?.lotNumber || pmt.plot_id || "Grave Lot";

      const dueInfo = resolveDueDate(pmt, linkedBurial, rawHistory, new Date(sysTimestamp));
      const pStatus = (pmt.payment_status || "").toLowerCase();
      const isPaid = balance <= 0 || pStatus === "paid";
      const isOverdue = !isPaid && (Boolean(dueInfo?.isOverdue) || pStatus === "overdue");
      const nextDue = isPaid ? "Paid in Full" : (dueInfo?.formattedDate || "On Schedule");
      const dueBadge = isPaid ? "Settled" : isOverdue ? (dueInfo?.displayBadge?.includes("Overdue") ? dueInfo.displayBadge : "Overdue") : dueInfo?.displayBadge;

      // ── Fixed Monthly Installment Calculation ──
      // Must be a fixed schedule and NOT decrease when the user pays or pays in advance
      let fixedMonthly = Number(
        pmt.monthly_installment ||
        pmt.monthly_amount ||
        pmt.monthly ||
        pmt.fixed_monthly ||
        0
      );

      // Check linked grave type configuration
      const plotGraveTypeId = String(
        linkedPlot?.grave_type_id ||
        linkedPlot?.graveLotTypeID ||
        linkedPlot?.type ||
        ""
      ).trim().toLowerCase();

      const matchedGraveType = rawGraveTypes.find(
        (gt) =>
          gt.id?.toLowerCase() === plotGraveTypeId ||
          gt.grave_type?.toLowerCase() === plotGraveTypeId ||
          gt.name?.toLowerCase() === plotGraveTypeId
      );

      if (!fixedMonthly && matchedGraveType?.monthly_payment && Number(matchedGraveType.monthly_payment) > 0) {
        fixedMonthly = Number(matchedGraveType.monthly_payment);
      }

      // Check payment history entries for this payment to find established recurring installment amount
      const pmtHistory = rawHistory.filter(
        (h) => h.pay_id === pmt.id || (h.user_id === uid && h.plot_id === pmt.plot_id)
      );

      const sortedPmtHistory = [...pmtHistory].sort(
        (a, b) =>
          new Date(a.payment_date || a.paymentDate || a.created_at || 0).getTime() -
          new Date(b.payment_date || b.paymentDate || b.created_at || 0).getTime()
      );

      // If user has recorded installment payments, check for recurring installment amount
      if (!fixedMonthly && sortedPmtHistory.length > 1) {
        const installmentEntries = sortedPmtHistory.slice(1);
        const lastInstallmentAmount = Number(installmentEntries[installmentEntries.length - 1]?.amount || 0);
        if (lastInstallmentAmount > 0 && lastInstallmentAmount < total) {
          fixedMonthly = lastInstallmentAmount;
        }
      }

      // Stable calculation based on Initial Financed Principal (invariant when paying in advance)
      if (!fixedMonthly) {
        const duration = Number(
          pmt.installment_duration ||
          pmt.duration ||
          matchedGraveType?.installment_duration ||
          matchedGraveType?.installmentDuration ||
          12
        );

        let initialFinancedPrincipal = Number(pmt.initial_balance || 0);

        if (!initialFinancedPrincipal) {
          if (sortedPmtHistory.length > 1) {
            // Initial principal = remaining balance + sum of all installment payments already made
            const sumInstallmentsPaid = sortedPmtHistory
              .slice(1)
              .reduce((acc, h) => acc + Number(h.amount || 0), 0);
            initialFinancedPrincipal = balance + sumInstallmentsPaid;
          } else if (sortedPmtHistory.length === 1) {
            const downpayment = Number(sortedPmtHistory[0].amount || 0);
            if (total > downpayment) {
              initialFinancedPrincipal = total - downpayment;
            } else {
              initialFinancedPrincipal = balance;
            }
          } else if (total > 0 && balance > 0) {
            initialFinancedPrincipal = total > balance ? total * 0.5 : balance;
          } else {
            initialFinancedPrincipal = balance;
          }
        }

        if (initialFinancedPrincipal > 0 && duration > 0) {
          fixedMonthly = Math.round(initialFinancedPrincipal / duration);
        }
      }

      if (!fixedMonthly && balance > 0) {
        fixedMonthly = Math.round(total > 0 ? (total * 0.5) / 12 : balance / 12);
      }

      const monthly = isPaid ? 0 : fixedMonthly;

      const deceasedName = linkedBurial?.name || pmt.deceased_name || pmt.deceasedName || null;

      return {
        id: pmt.id,
        plotId: pmt.plot_id,
        plot: linkedPlot,
        burial: linkedBurial,
        lotCode: `Plot ${plotCode}`,
        deceasedName,
        total,
        balance,
        paid,
        nextDue,
        dueBadge,
        isOverdue,
        isPaid,
        daysUntilDue: dueInfo?.daysUntilDue,
        monthly,
        status: isPaid ? "paid" : isOverdue ? "overdue" : "active",
      };
    });

    // Step E: Collect transactions from "payment_history"
    const userPaymentIds = new Set(userPayments.map((p) => p.id));
    const matchedHistory = rawHistory
      .filter((h) => userPaymentIds.has(h.pay_id) || h.user_id === uid || h.userId === uid)
      .map((h) => {
        const parentPayment = userPayments.find((p) => p.id === h.pay_id);
        const parentPlot = rawPlots.find((p) => p.id === parentPayment?.plot_id);
        const parentDue = parentPayment ? resolveDueDate(parentPayment, null, rawHistory)?.formattedDate : null;

        const rawDate = h.payment_date || h.paymentDate || h.created_at;
        const rawDateMs = rawDate
          ? (rawDate.toDate ? rawDate.toDate() : new Date(rawDate)).getTime()
          : 0;

        return {
          id: h.id,
          receiptId: h.receipt || h.receiptId || h.receipt_number || "CHM-RECEIPT",
          date: formatDisplayDate(rawDate),
          rawDateMs,
          amount: Number(h.amount || 0),
          method: h.payment_method || h.method || "Cash",
          status: h.status || "Completed",
          currentBalance: parentPayment?.balance ?? null,
          nextDue: parentDue,
          plot: parentPlot,
          payId: h.pay_id,
        };
      })
      .sort((a, b) => b.rawDateMs - a.rawDateMs);

    // Step F: Calculate Summary (Combined or selected account)
    let activeSummary = null;

    if (accounts.length > 0) {
      if (selectedAccountId !== "all") {
        const sel = accounts.find((a) => a.id === selectedAccountId);
        if (sel) {
          activeSummary = {
            total: sel.total,
            paid: sel.paid,
            outstanding: sel.balance,
            nextDue: sel.nextDue,
            dueBadge: sel.dueBadge,
            isOverdue: sel.isOverdue,
            isPaid: sel.isPaid,
            monthly: sel.monthly,
            lot: sel.deceasedName || sel.lotCode,
          };
        }
      }

      if (!activeSummary) {
        const sumTotal = accounts.reduce((acc, a) => acc + a.total, 0);
        const sumBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
        const sumPaid = Math.max(0, sumTotal - sumBalance);
        const sumMonthly = accounts.reduce((acc, a) => acc + a.monthly, 0);

        const overdueAcc = accounts.find((a) => a.isOverdue);
        const unpaidAcc = accounts.find((a) => !a.isPaid);
        const targetAcc = overdueAcc || unpaidAcc;

        const nextDueDisplay = targetAcc ? targetAcc.nextDue : "Paid in Full";
        const dueBadgeDisplay = targetAcc ? targetAcc.dueBadge : "Settled";
        const isOverdueDisplay = Boolean(overdueAcc);
        const isPaidDisplay = sumBalance <= 0;

        const lotDisplay =
          accounts.length === 1
            ? accounts[0].deceasedName || accounts[0].lotCode
            : `${accounts.length} Active Accounts`;

        activeSummary = {
          total: sumTotal,
          paid: sumPaid,
          outstanding: sumBalance,
          nextDue: nextDueDisplay,
          dueBadge: dueBadgeDisplay,
          isOverdue: isOverdueDisplay,
          isPaid: isPaidDisplay,
          monthly: sumMonthly,
          lot: lotDisplay,
        };
      }
    } else if (legacySummary) {
      // Fallback legacy summary
      activeSummary = {
        total: Number(legacySummary.total || 0),
        paid: Number(legacySummary.paid || 0),
        outstanding: Number(legacySummary.outstanding || 0),
        nextDue: legacySummary.nextDue || "N/A",
        dueBadge: null,
        isOverdue: false,
        isPaid: Number(legacySummary.outstanding || 0) <= 0,
        monthly: Number(legacySummary.monthly || 0),
        lot: legacySummary.lot || "Family Lot",
      };
    }

    // Step G: Combine History rows
    let activeHistory = matchedHistory;
    if (selectedAccountId !== "all") {
      activeHistory = matchedHistory.filter((h) => h.payId === selectedAccountId);
    }
    if (activeHistory.length === 0 && legacyHistory.length > 0) {
      activeHistory = legacyHistory.map((lh) => ({
        id: lh.id,
        receiptId: lh.receiptId || "RECEIPT",
        date: lh.date || "—",
        amount: Number(lh.amount || 0),
        method: lh.method || "Cash",
        status: lh.status || "Completed",
        currentBalance: null,
      }));
    }

    return {
      accounts,
      summary: activeSummary,
      history: activeHistory,
      clientName: userDoc?.name || currentUser.displayName || "Family Account Holder",
    };
  }, [
    currentUser,
    userDoc,
    rawPayments,
    rawHistory,
    rawPlots,
    rawClients,
    rawBurials,
    rawGraveTypes,
    legacySummary,
    legacyHistory,
    selectedAccountId,
    sysTimestamp,
  ]);

  const { accounts, summary, history, clientName } = connectedPaymentData;

  // Pagination configuration (8 transactions per page)
  const ITEMS_PER_PAGE = 8;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedHistory = useMemo(() => {
    return history.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [history, startIndex]);

  // Reset to page 1 whenever selected account changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAccountId]);

  // Clamp current page if history shrinks
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const progress =
    summary && summary.total > 0
      ? Math.min(100, Math.round(((summary.paid || 0) / summary.total) * 100))
      : 0;

  return (
    <div className="fam-page-wrapper">
      {/* Top Bar */}
      <FamilyTopbar
        title="My Payments"
        greeting="View payment history, statements, and outstanding balances"
      />

      {loading ? (
        <div className="fam-container" style={{ padding: "3rem", textAlign: "center" }}>
          <p style={{ color: "#6a8aaa", fontSize: "1rem" }}>
            <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i> Loading payment data...
          </p>
        </div>
      ) : !summary && history.length === 0 ? (
        <div className="fam-container" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <i
            className="fas fa-wallet"
            style={{ fontSize: "2.8rem", color: "#cbd5e1", marginBottom: "1rem" }}
          ></i>
          <p style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1a3d5c", marginBottom: "0.4rem" }}>
            No payment records found.
          </p>
          <p style={{ color: "#64748b", fontSize: "0.92rem", maxWidth: 440, margin: "0 auto" }}>
            Payment history, installments, and receipts linked to your family account will automatically appear here once recorded.
          </p>
        </div>
      ) : (
        <div className="fmpay-grid">
          {/* Multiple Accounts Selector (if user owns more than 1 lot/account) */}
          {accounts.length > 1 && (
            <div
              className="fam-container"
              style={{
                padding: "1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fas fa-layer-group" style={{ color: "#d4af37" }}></i>
                <span style={{ fontWeight: 600, color: "#1a3d5c", fontSize: "0.95rem" }}>
                  Select Memorial Account:
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setSelectedAccountId("all")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "1px solid",
                    borderColor: selectedAccountId === "all" ? "#004d8c" : "#cbd5e1",
                    backgroundColor: selectedAccountId === "all" ? "#004d8c" : "#ffffff",
                    color: selectedAccountId === "all" ? "#ffffff" : "#475569",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  All Accounts ({accounts.length})
                </button>
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "8px",
                      border: "1px solid",
                      borderColor: selectedAccountId === acc.id ? "#004d8c" : "#cbd5e1",
                      backgroundColor: selectedAccountId === acc.id ? "#004d8c" : "#ffffff",
                      color: selectedAccountId === acc.id ? "#ffffff" : "#475569",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{acc.deceasedName || acc.lotCode}</span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        border:
                          selectedAccountId === acc.id
                            ? "none"
                            : acc.isOverdue
                            ? "1px solid #fecaca"
                            : "1px solid transparent",
                        backgroundColor:
                          selectedAccountId === acc.id
                            ? "rgba(255,255,255,0.25)"
                            : acc.isOverdue
                            ? "#fee2e2"
                            : acc.isPaid
                            ? "#dcfce7"
                            : "#f1f5f9",
                        color:
                          selectedAccountId === acc.id
                            ? "#ffffff"
                            : acc.isOverdue
                            ? "#dc2626"
                            : acc.isPaid
                            ? "#166534"
                            : "#475569",
                        fontWeight: acc.isOverdue ? 700 : 500,
                      }}
                    >
                      {acc.isPaid ? "Paid" : acc.isOverdue ? `Overdue (${acc.nextDue})` : `Due: ${acc.nextDue}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Payment Summary Card */}
          <div className="fam-container fmpay-summary-col">
            <div className="fmpay-section-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 className="fmpay-title" style={{ margin: 0 }}>
                  <i
                    className="fas fa-wallet"
                    style={{ color: "#d4af37", marginRight: "8px" }}
                  ></i>
                  Payment Summary
                </h2>
                {summary && (
                  <span className={`pay-status-pill status-${summary.isPaid ? "fully_paid" : summary.isOverdue ? "overdue" : "active"}`}>
                    <span className="pay-dot" />
                    {summary.isPaid ? "Fully Paid" : summary.isOverdue ? "Overdue" : "Active Installment"}
                  </span>
                )}
              </div>
              {summary?.lot && <span className="fmpay-lot-badge">{summary.lot}</span>}
            </div>

            <div className="fmpay-stats-grid">
              <div className="fmpay-stat-card">
                <span className="fmpay-stat-label">Total Contract Price</span>
                <span className="fmpay-stat-value">{peso(summary?.total)}</span>
              </div>
              <div className="fmpay-stat-card">
                <span className="fmpay-stat-label">Amount Paid</span>
                <span className="fmpay-stat-value" style={{ color: "#27ae60" }}>
                  {peso(summary?.paid)}
                </span>
              </div>
              <div
                className={`fmpay-stat-card ${
                  summary?.isOverdue ? "fmpay-stat-card--overdue" : Number(summary?.outstanding || 0) > 0 ? "fmpay-stat-card--active" : ""
                }`}
              >
                <span
                  className="fmpay-stat-label"
                  style={{ color: summary?.isOverdue ? "#dc2626" : undefined }}
                >
                  Outstanding Balance
                </span>
                <span
                  className="fmpay-stat-value"
                  style={{ color: summary?.isOverdue ? "#dc2626" : summary?.isPaid ? "#27ae60" : "#1a3d5c" }}
                >
                  {peso(summary?.outstanding)}
                </span>
              </div>
              <div
                className={`fmpay-stat-card ${
                  summary?.isOverdue ? "fmpay-stat-card--overdue" : ""
                }`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    className="fmpay-stat-label"
                    style={{ color: summary?.isOverdue ? "#dc2626" : undefined }}
                  >
                    Next Due Date
                  </span>
                  {summary?.dueBadge && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "12px",
                        border: summary?.isOverdue ? "1px solid #fecaca" : "none",
                        backgroundColor: summary?.isOverdue
                          ? "#fef2f2"
                          : summary?.isPaid
                          ? "rgba(39, 174, 96, 0.12)"
                          : "rgba(0, 77, 140, 0.1)",
                        color: summary?.isOverdue
                          ? "#dc2626"
                          : summary?.isPaid
                          ? "#27ae60"
                          : "#004d8c",
                      }}
                    >
                      {summary.dueBadge}
                    </span>
                  )}
                </div>
                <span
                  className="fmpay-stat-value"
                  style={{
                    fontSize: "1.2rem",
                    color: summary?.isOverdue ? "#dc2626" : "#1a3d5c",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <i
                    className="fas fa-calendar-alt"
                    style={{
                      fontSize: "1rem",
                      color: summary?.isOverdue ? "#dc2626" : "#d4af37",
                    }}
                  ></i>
                  {summary?.nextDue || "N/A"}
                </span>
              </div>
            </div>

            <div className="fmpay-progress-section">
              <div className="fmpay-progress-header">
                <span className="fmpay-progress-label">Payment Progress</span>
                <span
                  className="fmpay-progress-pct"
                  style={{
                    color: summary?.isPaid ? "#27ae60" : summary?.isOverdue ? "#dc2626" : "#d97706",
                  }}
                >
                  {progress}%
                </span>
              </div>
              <div className="fmpay-progress-track">
                <div
                  className={`fmpay-progress-fill ${
                    summary?.isPaid ? "fill-green" : summary?.isOverdue ? "fill-red" : "fill-amber"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="fmpay-progress-footer">
                <span>
                  <i
                    className="fas fa-calendar-check"
                    style={{ marginRight: 4, color: summary?.isOverdue ? "#dc2626" : "#d4af37" }}
                  ></i>{" "}
                  Next Due:{" "}
                  <strong style={{ color: summary?.isOverdue ? "#dc2626" : "#1a3d5c" }}>
                    {summary?.nextDue}
                  </strong>
                </span>
                <span>
                  <i className="fas fa-coins" style={{ marginRight: 4, color: "#6a8aaa" }}></i> Monthly:{" "}
                  <strong>{peso(summary?.monthly)}</strong>
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    color: progress === 100 ? "#27ae60" : summary?.isOverdue ? "#dc2626" : "#d97706",
                  }}
                >
                  {summary?.isOverdue && <i className="fas fa-exclamation-circle" style={{ fontSize: "0.85rem" }}></i>}
                  {progress === 100 ? "Settled" : summary?.isOverdue ? "Overdue" : "Installment Active"}
                </span>
              </div>
            </div>
          </div>

          {/* Payment History Card */}
          <div className="fam-container fmpay-history-col">
            <div className="fmpay-section-header">
              <h2 className="fmpay-title">
                <i
                  className="fas fa-history"
                  style={{ color: "#6a8aaa", marginRight: "8px" }}
                ></i>
                Payment History ({history.length})
              </h2>
            </div>

            <div className="fam-table-container">
              <table className="fam-table">
                <thead>
                  <tr>
                    <th>Receipt No.</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        style={{ textAlign: "center", padding: "2.5rem", color: "#6a8aaa" }}
                      >
                        No transaction receipts recorded for this account.
                      </td>
                    </tr>
                  ) : (
                    paginatedHistory.map((row) => (
                      <tr key={row.id}>
                        <td className="fam-td-bold" style={{ color: "#3670AF" }}>
                          {row.receiptId}
                        </td>
                        <td>{row.date}</td>
                        <td className="fam-td-bold">{peso(row.amount)}</td>
                        <td>{row.method}</td>
                        <td>
                          <span className="fam-badge fam-badge--success">
                            <i className="fas fa-check-circle" style={{ marginRight: 4 }}></i>{" "}
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (8 transactions per page) */}
            {history.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "1rem",
                  padding: "0.5rem 0.25rem",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "#6a8aaa", fontWeight: 500 }}>
                  Showing {history.length === 0 ? 0 : startIndex + 1} to{" "}
                  {Math.min(startIndex + ITEMS_PER_PAGE, history.length)} of{" "}
                  {history.length} transactions
                </span>
                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                )}
              </div>
            )}

            <div className="fmpay-footer-note">
              <i className="fas fa-headset" style={{ color: "#d4af37", marginRight: 6 }}></i>
              For billing questions or installment inquiries, please visit the administration office or call (044) 123-4567.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPayments;
