import { useState, useEffect, useMemo } from "react";
import {
    Search,
    DollarSign,
    AlertTriangle,
    Clock,
    CreditCard,
    History,
    Info,
    CheckCircle,
    Calendar,
    Layers,
    Check,
    RefreshCw,
    Sparkles
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";
import Header from "../../../components/Header/Header";
import { getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import PaymentDetailModal from "./PaymentDetailModal";
import PaymentHistoryModal from "./PaymentHistoryModal";
import PayInstallmentModal from "./PayInstallmentModal";
import Pagination from "../../../components/Pagination/Pagination";
import "./Payments.css";

// ── Helper: Format date to friendly "Mon DD, YYYY" ──
function formatFriendlyDate(dateStr) {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    } catch {
        return dateStr;
    }
}

// ── Helper: Calculate or extract next payment due date ──
function getDueDate(payment, burial, lastHistory, allHistory = []) {
    if (Number(payment.balance || 0) <= 0 || (payment.payment_status || "").toLowerCase() === "paid") {
        return null;
    }
    if (payment.due_date) return payment.due_date;
    if (payment.next_due_date) return payment.next_due_date;

    // Fallback: If not explicitly saved on the document, calculate from start date
    // advancing by the number of installments already paid + 1
    const oldestHistory = allHistory.length > 0 ? allHistory[allHistory.length - 1] : null;
    let base = null;
    if (oldestHistory?.payment_date) {
        base = new Date(oldestHistory.payment_date);
    } else if (payment.created_at?.toDate) {
        base = payment.created_at.toDate();
    } else if (payment.createdAt) {
        base = new Date(payment.createdAt);
    } else if (burial?.date_buried) {
        base = new Date(burial.date_buried);
    } else if (lastHistory?.payment_date) {
        base = new Date(lastHistory.payment_date);
    }

    if (base && !isNaN(base.getTime())) {
        const d = new Date(base);
        const installmentsPaid = Math.max(0, allHistory.length - 1);
        d.setMonth(d.getMonth() + (installmentsPaid + 1));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }
    return null;
}

const ITEMS_PER_PAGE = 8;

export default function Payments() {
    // ── Firestore Collections Data ──
    const [payments, setPayments] = useState([]);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [plots, setPlots] = useState([]);
    const [clients, setClients] = useState([]);
    const [graveTypes, setGraveTypes] = useState([]);
    const [burials, setBurials] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── Active System Date (reacts to Admin Abuse simulation) ──
    const [todayStr, setTodayStr] = useState(getSystemDateISO());

    // ── Filters & Search ──
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all"); // "all", "installment", "interment"
    const [statusFilter, setStatusFilter] = useState("installment"); // Default: "installment" (only display installments, full payment when filtered)
    const [sortBy, setSortBy] = useState("due_asc"); // "due_asc", "balance_desc", "recent_payment", "client_name"

    // ── Pagination State (Max 8 per page) ──
    const [currentPage, setCurrentPage] = useState(1);

    // ── Modals State ──
    const [selectedAccountForDetail, setSelectedAccountForDetail] = useState(null);
    const [selectedAccountForHistory, setSelectedAccountForHistory] = useState(null);
    const [selectedAccountForPay, setSelectedAccountForPay] = useState(null);

    // ── Feedback Banner ──
    const [feedback, setFeedback] = useState(null);

    // ── Subscribe to active System Date ──
    useEffect(() => {
        const unsub = subscribeSystemDate((info) => {
            setTodayStr(info.activeDate);
        });
        return () => unsub();
    }, []);

    // ── Realtime listeners for Firestore Collections ──
    useEffect(() => {
        let paymentsReady = false;
        let plotsReady = false;

        const checkReady = () => {
            if (paymentsReady && plotsReady) {
                setLoading(false);
            }
        };

        const unsubPayments = onSnapshot(collection(db, "payments"), (snapshot) => {
            setPayments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            paymentsReady = true;
            checkReady();
        }, (err) => console.warn("Error listening to payments:", err));

        const unsubHistory = onSnapshot(collection(db, "payment_history"), (snapshot) => {
            setPaymentHistory(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to payment_history:", err));

        const unsubPlots = onSnapshot(collection(db, "plots"), (snapshot) => {
            setPlots(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            plotsReady = true;
            checkReady();
        }, (err) => console.warn("Error listening to plots:", err));

        const unsubClients = onSnapshot(collection(db, "clients"), (snapshot) => {
            setClients(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to clients:", err));

        const unsubGraveTypes = onSnapshot(collection(db, "grave_types"), (snapshot) => {
            setGraveTypes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to grave_types:", err));

        const unsubBurials = onSnapshot(collection(db, "burials"), (snapshot) => {
            setBurials(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to burials:", err));

        return () => {
            unsubPayments();
            unsubHistory();
            unsubPlots();
            unsubClients();
            unsubGraveTypes();
            unsubBurials();
        };
    }, []);

    // ── Combine & Map Payment Accounts ──
    const combinedAccounts = useMemo(() => {
        return payments.map((payment) => {
            // Find linked plot
            const plot = plots.find((p) => p.id === payment.plot_id);

            // Find linked burials
            const plotBurials = burials.filter(
                (b) => b.plot_id === payment.plot_id || b.id === payment.burial_id
            );

            // Find owner client
            const ownerId = payment.user_id || plot?.user_id || plotBurials[0]?.user_id;
            const client = clients.find(
                (c) => c.user_id === ownerId || c.id === ownerId
            );

            // Financials
            const total = Number(payment.total ?? graveType?.lot_price ?? 0);
            const balance = Number(payment.balance ?? 0);
            const paidAmount = Math.max(0, total - balance);
            const percentPaid = total > 0 ? Math.min(100, Math.round((paidAmount / total) * 100)) : 100;

            // Detect if this payment record is for a standalone Interment / Burial service or a Grave Lot purchase
            // Any account with balance > 0 is ALWAYS an active installment plan, never a one-time interment fee
            const isIntermentPayment = Boolean(
                balance <= 0 &&
                (
                    (payment.service_type && /interment/i.test(payment.service_type)) ||
                    (payment.interment_fee && Number(payment.interment_fee) > 0) ||
                    (payment.notes && /interment service/i.test(payment.notes))
                )
            );
            const transactionCategory = isIntermentPayment ? "interment" : "installment";

            // Find grave type
            const targetTypeId = String(plot?.grave_type_id || plot?.graveLotTypeID || plot?.graveType || plot?.type || "").trim().toLowerCase();
            const graveType = graveTypes.find((gt) => {
                const gtId = String(gt.id || gt.grave_type_id || "").trim().toLowerCase();
                const gtName = String(gt.grave_type || gt.name || "").trim().toLowerCase();
                return (gtId && gtId === targetTypeId) || (targetTypeId && gtName === targetTypeId);
            });

            // Robust grave type resolution:
            let resolvedGraveTypeName = graveType?.grave_type || graveType?.name || plot?.graveType || plot?.grave_type || "";
            if (!resolvedGraveTypeName) {
                const code = String(plot?.plotCode || plot?.id || payment.plot_id || "").trim().toUpperCase();
                if (code.startsWith("AP")) resolvedGraveTypeName = "Apartment";
                else if (code.startsWith("SN")) resolvedGraveTypeName = "Single Niche";
                else if (code.startsWith("MA") || code.startsWith("ML")) resolvedGraveTypeName = "Mausoleum";
                else if (code.startsWith("LG") || code.startsWith("FN")) resolvedGraveTypeName = "Lawn Grave";
                else resolvedGraveTypeName = "Single Niche";
            }

            // Find payment history entries for this payment
            const accountHistory = paymentHistory
                .filter((h) => h.pay_id === payment.id)
                .sort((a, b) => {
                    const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.payment_date || 0).getTime();
                    const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.payment_date || 0).getTime();
                    return timeB - timeA;
                });

            // Extract last payment date
            let lastPaymentDateRaw = null;
            if (accountHistory.length > 0 && accountHistory[0].payment_date) {
                lastPaymentDateRaw = accountHistory[0].payment_date;
            } else if (payment.last_payment_date) {
                lastPaymentDateRaw = payment.last_payment_date;
            } else if (payment.created_at?.toDate) {
                lastPaymentDateRaw = payment.created_at.toDate().toISOString().split("T")[0];
            }

            // Extract due date
            const dueDateRaw = getDueDate(payment, plotBurials[0], accountHistory[0], accountHistory);

            // Determine status
            const pStatus = (payment.payment_status || "").toLowerCase();
            let status = "active";

            if (balance <= 0 || pStatus === "paid") {
                status = "fully_paid";
            } else if (pStatus === "overdue" || (dueDateRaw && todayStr > dueDateRaw)) {
                status = "overdue";
            } else {
                status = "active";
            }

            // Days until due calculation (negative means overdue)
            let daysUntilDue = null;
            if (dueDateRaw && status !== "fully_paid") {
                const diffMs = new Date(dueDateRaw).getTime() - new Date(todayStr).getTime();
                daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            }

            // Client name
            let clientName = payment.client_name || "";
            if (!clientName && client) {
                clientName = `${client.first_name || ""} ${client.last_name || ""}`.trim();
            } else if (!clientName && plot?.owner) {
                clientName = plot.owner;
            } else if (!clientName && plotBurials.length > 0 && plotBurials[0].name) {
                clientName = `${plotBurials[0].name} (Family)`;
            } else if (!clientName) {
                clientName = isIntermentPayment ? "Interment Client" : "Reserved (Pre-Need)";
            }

            // Deceased name
            const deceasedName = payment.deceased_name || (plotBurials.length > 0 ? plotBurials[0].name : "");

            // Calculate monthly installment amount
            const duration = Number(graveType?.installment_duration || graveType?.installmentDuration || payment?.installment_duration || 12);
            let monthlyInstallment = Number(payment.monthly_amount || payment.monthly_installment || graveType?.monthly_payment || 0);
            if (!monthlyInstallment || monthlyInstallment <= 0) {
                if (duration > 0 && balance > 0) {
                    const pastInstallmentPaymentsCount = Math.max(0, accountHistory.length - 1);
                    const remainingMonths = Math.max(1, duration - pastInstallmentPaymentsCount);
                    monthlyInstallment = Math.round(balance / remainingMonths);
                } else if (duration > 0 && total > 0) {
                    monthlyInstallment = Math.round(total / duration);
                } else if (balance > 0) {
                    monthlyInstallment = Math.round(balance / 12);
                }
            }
            if (balance > 0 && monthlyInstallment > balance) {
                monthlyInstallment = balance;
            }

            return {
                ...payment,
                plot,
                client,
                graveType,
                burials: plotBurials,
                accountHistory,
                clientName,
                deceasedName,
                isIntermentPayment,
                transactionCategory,
                serviceType: payment.service_type || (isIntermentPayment ? "Interment & Burial Service" : "Grave Lot Purchase"),
                subtotal: Number(payment.subtotal ?? total),
                discountAmount: Number(payment.discount_amount ?? 0),
                discountType: payment.discount_type || null,
                plotCode: plot?.plotCode || plot?.id || payment.plot_id || "N/A",
                graveTypeName: resolvedGraveTypeName,
                total,
                balance,
                monthlyInstallment,
                paidAmount,
                percentPaid,
                status,
                dueDate: formatFriendlyDate(dueDateRaw),
                dueDateRaw,
                daysUntilDue,
                lastPaymentDate: formatFriendlyDate(lastPaymentDateRaw),
                lastPaymentDateRaw,
                duration,
                paymentsCount: accountHistory.length,
            };
        });
    }, [payments, plots, clients, graveTypes, burials, paymentHistory, todayStr]);

    // ── Calculate KPIs ──
    const totalOutstanding = useMemo(() => {
        return combinedAccounts
            .filter((acc) => acc.balance > 0)
            .reduce((sum, acc) => sum + acc.balance, 0);
    }, [combinedAccounts]);

    const overdueCount = useMemo(() => {
        return combinedAccounts.filter((acc) => acc.status === "overdue").length;
    }, [combinedAccounts]);

    const activeInstallmentsCount = useMemo(() => {
        return combinedAccounts.filter((acc) => acc.status === "active").length;
    }, [combinedAccounts]);

    // ── Filtered & Sorted Accounts (Ordered based on Due Date) ──
    const filteredAccounts = useMemo(() => {
        const filtered = combinedAccounts.filter((acc) => {
            // Category Filter
            if (categoryFilter === "installment") {
                if (acc.isIntermentPayment && acc.balance <= 0) return false;
            } else if (categoryFilter === "interment") {
                if (!acc.isIntermentPayment) return false;
            }

            // Search Query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = (acc.clientName || "").toLowerCase().includes(q);
                const matchCode = (acc.plotCode || "").toLowerCase().includes(q);
                const matchId = (acc.id || "").toLowerCase().includes(q);
                const matchDeceased = (acc.deceasedName || "").toLowerCase().includes(q) ||
                    acc.burials.some((b) => (b.name || "").toLowerCase().includes(q));
                if (!matchName && !matchCode && !matchId && !matchDeceased) return false;
            }

            // Status Filter
            // "installment" (Default): strictly displays installment accounts with unpaid balance (active/overdue)
            // "fully_paid": displays full payment / completed accounts
            // "overdue": displays overdue installments only
            // "all": displays both installments and full payments
            if (statusFilter === "installment") {
                if (acc.status === "fully_paid" || acc.balance <= 0) return false;
            } else if (statusFilter === "overdue") {
                if (acc.status !== "overdue") return false;
            } else if (statusFilter === "fully_paid") {
                if (acc.status !== "fully_paid" && acc.balance > 0) return false;
            }

            return true;
        });

        // ── Order Accounts: Default based on Due Date ──
        return filtered.sort((a, b) => {
            if (sortBy === "balance_desc") {
                return (b.balance || 0) - (a.balance || 0);
            }
            if (sortBy === "recent_payment") {
                const timeA = a.lastPaymentDateRaw ? new Date(a.lastPaymentDateRaw).getTime() : 0;
                const timeB = b.lastPaymentDateRaw ? new Date(b.lastPaymentDateRaw).getTime() : 0;
                return timeB - timeA;
            }
            if (sortBy === "client_name") {
                return (a.clientName || "").localeCompare(b.clientName || "");
            }

            // Default: "due_asc" (In order based on due date)
            const aIsPaid = a.status === "fully_paid" || a.balance <= 0;
            const bIsPaid = b.status === "fully_paid" || b.balance <= 0;

            // 1. Unpaid accounts with balance due always come before fully paid accounts
            if (aIsPaid && !bIsPaid) return 1;
            if (!aIsPaid && bIsPaid) return -1;

            // 2. Both are unpaid accounts:
            if (!aIsPaid && !bIsPaid) {
                // If both have due dates: sort chronological (most overdue -> due soonest -> due later)
                if (a.dueDateRaw && b.dueDateRaw) {
                    const timeA = new Date(a.dueDateRaw).getTime();
                    const timeB = new Date(b.dueDateRaw).getTime();
                    if (timeA !== timeB) return timeA - timeB;
                } else if (a.dueDateRaw && !b.dueDateRaw) {
                    return -1;
                } else if (!a.dueDateRaw && b.dueDateRaw) {
                    return 1;
                }

                // Overdue status priority tie-breaker
                if (a.status === "overdue" && b.status !== "overdue") return -1;
                if (b.status === "overdue" && a.status !== "overdue") return 1;

                // Higher balance first tie-breaker
                if ((b.balance || 0) !== (a.balance || 0)) {
                    return (b.balance || 0) - (a.balance || 0);
                }
            }

            // 3. Both are fully paid accounts: most recently paid first
            if (aIsPaid && bIsPaid) {
                const timeA = a.lastPaymentDateRaw ? new Date(a.lastPaymentDateRaw).getTime() : 0;
                const timeB = b.lastPaymentDateRaw ? new Date(b.lastPaymentDateRaw).getTime() : 0;
                if (timeA !== timeB) return timeB - timeA;
            }

            return (a.clientName || "").localeCompare(b.clientName || "");
        });
    }, [combinedAccounts, categoryFilter, searchQuery, statusFilter, sortBy]);

    // ── Pagination Calculation (Max 8 per page) ──
    const totalPages = Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE) || 1;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedAccounts = useMemo(() => {
        return filteredAccounts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredAccounts, startIndex]);

    // Reset to page 1 whenever search, filters, or sort change
    useEffect(() => {
        setCurrentPage(1);
    }, [categoryFilter, searchQuery, statusFilter, sortBy]);

    // Clamp page number if count shrinks
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    // Handle payment success feedback
    const handlePaymentRecorded = (info) => {
        setFeedback({
            type: "success",
            text: `Payment of ₱${info.amountPaid.toLocaleString()} for ${info.clientName} recorded successfully! Official Receipt: ${info.receipt}`
        });
        setTimeout(() => setFeedback(null), 6000);
    };

    return (
        <div className="user-management-page">
            <Header page="payments" />

            <div className="payments-page-container">

            {/* ── KPI Summary Cards ── */}
            <div className="pay-kpi-grid">
                <div className="pay-kpi-card">
                    <div className="pay-kpi-info">
                        <span className="pay-kpi-title">TOTAL OUTSTANDING</span>
                        <span className="pay-kpi-value">₱{totalOutstanding.toLocaleString()}</span>
                        <span className="pay-kpi-sub">Across all installment accounts</span>
                    </div>
                    <div className="pay-kpi-icon-box amber">
                        <DollarSign size={22} strokeWidth={2.4} />
                    </div>
                </div>

                <div className="pay-kpi-card">
                    <div className="pay-kpi-info">
                        <span className="pay-kpi-title">OVERDUE ACCOUNTS</span>
                        <span className="pay-kpi-value">{overdueCount}</span>
                        <span className="pay-kpi-sub">Payments past due date</span>
                    </div>
                    <div className="pay-kpi-icon-box red">
                        <AlertTriangle size={22} strokeWidth={2.4} />
                    </div>
                </div>

                <div className="pay-kpi-card">
                    <div className="pay-kpi-info">
                        <span className="pay-kpi-title">ACTIVE INSTALLMENTS</span>
                        <span className="pay-kpi-value">{activeInstallmentsCount}</span>
                        <span className="pay-kpi-sub">Currently on payment plan</span>
                    </div>
                    <div className="pay-kpi-icon-box blue">
                        <Clock size={22} strokeWidth={2.4} />
                    </div>
                </div>
            </div>

            {/* ── Filters & Search Toolbar ── */}
            <div className="pay-filter-bar">
                <div className="pay-search-wrap">
                    <Search size={16} className="pay-search-icon" />
                    <input
                        type="text"
                        className="pay-search-input"
                        placeholder="Search by client name, grave number, or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="pay-filters-group">
                    {/* Sort Order Dropdown */}
                    <select
                        className="pay-select pay-select-sort"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        title="Sort accounts"
                    >
                        <option value="due_asc">Sort: Nearest Due Date (Overdue First)</option>
                        <option value="balance_desc">Sort: Highest Balance</option>
                        <option value="recent_payment">Sort: Recently Paid</option>
                        <option value="client_name">Sort: Client Name (A-Z)</option>
                    </select>

                    {/* Status Dropdown (Default: Installments Only) */}
                    <select
                        className="pay-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        title="Filter payment status"
                    >
                        <option value="installment">Installments (Active & Due)</option>
                        <option value="overdue">Overdue Only</option>
                        <option value="fully_paid">Full Payment (Fully Paid)</option>
                        <option value="all">All Accounts (Inc. Full Payment)</option>
                    </select>

                    {/* Payment Category Dropdown */}
                    <select
                        className="pay-select"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        title="Filter payment category"
                    >
                        <option value="all">All Categories</option>
                        <option value="installment">Grave Lot Purchases</option>
                        <option value="interment">Interment Services</option>
                    </select>
                </div>
            </div>

            {/* ── Feedback Banner ── */}
            {feedback && (
                <div className={`pay-feedback-banner ${feedback.type}`}>
                    <CheckCircle size={16} />
                    <span>{feedback.text}</span>
                </div>
            )}

            {/* ── Accounts List Cards ── */}
            {loading ? (
                <div className="pay-empty-state">
                    <RefreshCw size={28} className="spinning" />
                    <p>Loading payment accounts and balances...</p>
                </div>
            ) : filteredAccounts.length === 0 ? (
                <div className="pay-empty-state">
                    <CreditCard size={38} strokeWidth={1.3} />
                    <h4>No Payment Accounts Found</h4>
                    <p>No records match your search criteria. Try clearing or changing your filters.</p>
                </div>
            ) : (
                <>
                    <div className="pay-accounts-list">
                        {paginatedAccounts.map((account) => {
                        const isOverdue = account.status === "overdue";
                        const isFullyPaid = account.status === "fully_paid";

                        return (
                            <div key={account.id} className="pay-account-card">
                                {/* Card Top Row */}
                                <div className="pay-card-top">
                                    {/* Left Info */}
                                    <div className="pay-card-main-info">
                                        <div className="pay-card-title-row">
                                            <span className="pay-client-name">{account.clientName}</span>

                                            <span className={`pay-status-pill status-${account.status}`}>
                                                <span className="pay-dot" />
                                                {isFullyPaid ? "Fully Paid" : isOverdue ? "Overdue" : "Active"}
                                            </span>

                                            {account.isIntermentPayment && (
                                                <span className="pay-service-pill">
                                                    <Sparkles size={12} /> Interment Service
                                                </span>
                                            )}

                                            <span className="pay-type-pill">
                                                {account.graveTypeName}
                                            </span>
                                        </div>

                                        <div className="pay-meta-row">
                                            <span className="pay-meta-lot">Lot {account.plotCode}</span>

                                            {account.deceasedName && (
                                                <span className="pay-meta-deceased">
                                                    Deceased: <strong>{account.deceasedName}</strong>
                                                </span>
                                            )}

                                            {account.discountAmount > 0 && (
                                                <span className="pay-meta-discount">
                                                    {account.discountType || "Senior/PWD"} (-₱{account.discountAmount.toLocaleString()})
                                                </span>
                                            )}

                                            {account.dueDate && !isFullyPaid && (
                                                <span
                                                    className={`pay-meta-due ${
                                                        isOverdue
                                                            ? "overdue-alert"
                                                            : account.daysUntilDue === 0
                                                            ? "due-today"
                                                            : account.daysUntilDue !== null && account.daysUntilDue <= 14
                                                            ? "due-soon"
                                                            : ""
                                                    }`}
                                                >
                                                    Due: {account.dueDate}
                                                    {account.daysUntilDue !== null && (
                                                        <span className="pay-due-relative">
                                                            {account.daysUntilDue < 0
                                                                ? ` (${Math.abs(account.daysUntilDue)}d overdue)`
                                                                : account.daysUntilDue === 0
                                                                ? ` (Due Today)`
                                                                : account.daysUntilDue === 1
                                                                ? ` (Due Tomorrow)`
                                                                : ` (in ${account.daysUntilDue}d)`}
                                                        </span>
                                                    )}
                                                </span>
                                            )}

                                            {account.lastPaymentDate && (
                                                <span className="pay-meta-last">
                                                    Last: {account.lastPaymentDate}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Amounts & Action Buttons */}
                                    <div className="pay-card-right-group">
                                        <div className="pay-card-amounts">
                                            <span className="pay-paid-label">
                                                Paid: ₱{account.paidAmount.toLocaleString()}
                                            </span>
                                            {isFullyPaid ? (
                                                <span className="pay-balance-val fully-paid">
                                                    Fully Paid
                                                </span>
                                            ) : (
                                                <span className={`pay-balance-val ${isOverdue ? "overdue" : ""}`}>
                                                    ₱{account.balance.toLocaleString()}
                                                </span>
                                            )}
                                        </div>

                                        <div className="pay-actions-wrap">
                                            <button
                                                type="button"
                                                className="pay-btn-details"
                                                onClick={() => setSelectedAccountForDetail(account)}
                                                title="View Account Details"
                                            >
                                                <Info size={14} /> Details
                                            </button>

                                            <button
                                                type="button"
                                                className="pay-btn-history"
                                                onClick={() => setSelectedAccountForHistory(account)}
                                                title="View Payment History & Receipts"
                                            >
                                                <History size={14} /> History
                                            </button>

                                            {!isFullyPaid && (
                                                <button
                                                    type="button"
                                                    className="pay-btn-pay"
                                                    onClick={() => setSelectedAccountForPay(account)}
                                                    title="Record Installment Payment"
                                                >
                                                    <CreditCard size={14} /> Pay
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Card Bottom Progress Bar */}
                                <div className="pay-card-bottom">
                                    <div className="pay-progress-track">
                                        <div
                                            className={`pay-progress-fill ${isFullyPaid ? "fill-green" : isOverdue ? "fill-red" : "fill-amber"}`}
                                            style={{ width: `${account.percentPaid}%` }}
                                        />
                                    </div>

                                    <div className="pay-progress-footer">
                                        <span>
                                            {account.isIntermentPayment
                                                ? "One-time service fee • 100% paid"
                                                : `${account.percentPaid}% paid`}
                                        </span>
                                        {isFullyPaid ? (
                                            <span className="pay-complete-tag">
                                                <Check size={13} strokeWidth={2.5} /> Complete
                                            </span>
                                        ) : (
                                            <span className="pay-remaining-tag">
                                                ₱{account.balance.toLocaleString()} remaining
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    </div>

                    {/* ── Pagination Bar (Max 8 accounts per page) ── */}
                    {filteredAccounts.length > 0 && (
                        <div className="pay-pagination-bar">
                            <span className="pay-showing-text">
                                Showing {filteredAccounts.length === 0 ? 0 : startIndex + 1} to{' '}
                                {Math.min(startIndex + ITEMS_PER_PAGE, filteredAccounts.length)} of{' '}
                                {filteredAccounts.length} accounts
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
                </>
            )}

            {/* ── Modal: Account Details ── */}
            <PaymentDetailModal
                isOpen={Boolean(selectedAccountForDetail)}
                account={selectedAccountForDetail}
                onClose={() => setSelectedAccountForDetail(null)}
                onOpenPay={(acc) => setSelectedAccountForPay(acc)}
            />

            {/* ── Modal: Payment History & Receipts ── */}
            <PaymentHistoryModal
                isOpen={Boolean(selectedAccountForHistory)}
                account={selectedAccountForHistory}
                onClose={() => setSelectedAccountForHistory(null)}
            />

            {/* ── Modal: Record Installment Payment ── */}
            <PayInstallmentModal
                isOpen={Boolean(selectedAccountForPay)}
                account={selectedAccountForPay}
                todayStr={todayStr}
                onClose={() => setSelectedAccountForPay(null)}
                onPaymentSuccess={handlePaymentRecorded}
            />
            </div>
        </div>
    );
}
