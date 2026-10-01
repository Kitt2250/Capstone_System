import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router";
import Header from "../../../components/Header/Header";
import Table from "../../../components/Table/Table";
import Pagination from "../../../components/Pagination/Pagination";
import Button from "../../../components/Buttons/Buttons";
import { getGraveTypes, getIntermentFees } from "../../../services/graveServices";
import { createGraveTypeController, updateGraveTypeController } from "../../../controller/graveController";
import { syncAllPlotsOccupancy } from "../../../services/plotServices";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";
import {
    Search,
    Settings,
    LayoutGrid,
    Pencil,
    Trash2,
    Eye,
    Plus,
    RefreshCw,
    Layers,
    CheckCircle,
    AlertCircle,
    Clock,
    Heart,
    User
} from "lucide-react";
import GraveUpdateModal from "../../../components/Modals/UpdateModal/GraveUpdateModal/GraveUpdateModal";
import GraveAddModal from "../../../components/Modals/AddModal/GraveAddModal/GraveAddModal";
import GraveLotDetailModal from "./GraveLotDetailModal";
import { getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import "./GraveManagement.css";

// ── Payment Due Date & Status Computation Helpers ──
export function getPaymentDueDate(payment, burial) {
    if (!payment) return null;
    if (payment.due_date) return payment.due_date;
    if (payment.next_due_date) return payment.next_due_date;

    let baseDate = null;
    if (payment.created_at?.toDate) {
        baseDate = payment.created_at.toDate();
    } else if (payment.createdAt) {
        baseDate = new Date(payment.createdAt);
    } else if (burial?.date_buried) {
        baseDate = new Date(burial.date_buried);
    }

    if (baseDate && !isNaN(baseDate.getTime())) {
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }
    return null;
}

export function computePaymentCategory(payment, plot, burial, systemDateStr) {
    if (!payment) {
        return (plot?.status || "").toLowerCase() === "available" ? "unsold" : "unpaid";
    }

    const pStatus = (payment.payment_status || "").toLowerCase();
    const balance = Number(payment.balance || 0);

    // 1. Paid in Full
    if (balance <= 0 || pStatus === "paid") {
        return "paid";
    }

    // 2. Overdue check against active Philippines System Date
    const dueDate = getPaymentDueDate(payment, burial);
    const today = systemDateStr || getSystemDateISO();

    if (pStatus === "overdue" || (dueDate && today > dueDate)) {
        return "overdue";
    }

    return "installment";
}

export default function GraveManagement({ isStaff: isStaffProp }) {
    const location = useLocation();
    const isStaff = isStaffProp ?? location.pathname.startsWith("/staff");

    const [activeTab, setActiveTab] = useState(isStaff ? "lot" : "config");

    useEffect(() => {
        if (isStaff) {
            setActiveTab("lot");
        }
    }, [isStaff]);

    // ── Grave Configuration states ──
    const [graveTypes, setGraveTypes] = useState([]);
    const [intermentFees, setIntermentFees] = useState([]);
    const [graveTypesLoading, setGraveTypesLoading] = useState(true);
    const [configSearch, setConfigSearch] = useState("");
    const [configPage, setConfigPage] = useState(1);
    const [selectedGrave, setSelectedGrave] = useState(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const configPerPage = 6;

    // ── Grave Lot & Burial states ──
    const [plots, setPlots] = useState([]);
    const [burials, setBurials] = useState([]);
    const [clients, setClients] = useState([]);
    const [payments, setPayments] = useState([]);
    const [plotsLoading, setPlotsLoading] = useState(true);
    const [lotSearch, setLotSearch] = useState("");
    const [lotFilterStatus, setLotFilterStatus] = useState("all");
    const [lotFilterPayment, setLotFilterPayment] = useState("all");
    const [lotFilterType, setLotFilterType] = useState("all");
    const [lotFilterSection, setLotFilterSection] = useState("all");
    const [lotPage, setLotPage] = useState(1);
    const [selectedPlotForDetail, setSelectedPlotForDetail] = useState(null);
    const [syncingAllLots, setSyncingAllLots] = useState(false);
    const [lotFeedback, setLotFeedback] = useState(null);
    const [todayStr, setTodayStr] = useState(getSystemDateISO());
    const lotPerPage = 8;

    async function loadData() {
        try {
            setGraveTypesLoading(true);
            const [types, fees] = await Promise.all([
                getGraveTypes(),
                getIntermentFees()
            ]);
            setGraveTypes(types);
            setIntermentFees(fees);
        } catch (err) {
            console.error(err);
        } finally {
            setGraveTypesLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    // ── Realtime listeners for Plots, Burials, Clients, and Payments ──
    useEffect(() => {
        const unsubPlots = onSnapshot(collection(db, "plots"), (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setPlots(list);
            setPlotsLoading(false);
        }, (err) => console.warn("Error listening to plots:", err));

        const unsubBurials = onSnapshot(collection(db, "burials"), (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setBurials(list);
        }, (err) => console.warn("Error listening to burials:", err));

        const unsubClients = onSnapshot(collection(db, "clients"), (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setClients(list);
        }, (err) => console.warn("Error listening to clients:", err));

        const unsubPayments = onSnapshot(collection(db, "payments"), (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setPayments(list);
        }, (err) => console.warn("Error listening to payments:", err));

        const unsubIntermentFees = onSnapshot(collection(db, "interment_fee"), (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setIntermentFees(list);
        }, (err) => console.warn("Error listening to interment_fee:", err));

        return () => {
            unsubPlots();
            unsubBurials();
            unsubClients();
            unsubPayments();
            unsubIntermentFees();
        };
    }, []);

    const handleEdit = (grave) => {
        setSelectedGrave(grave);
        setShowUpdateModal(true);
    };

    const handleUpdate = async (formData) => {
        await updateGraveTypeController(selectedGrave.id, formData);
        setShowUpdateModal(false);
        setSelectedGrave(null);
        await loadData();
    };

    const handleAdd = async (payload, stagedInterments = []) => {
        const createdId = await createGraveTypeController(payload, stagedInterments);
        setShowAddModal(false);
        await loadData();
        return createdId;
    };

    useEffect(() => {
        setConfigPage(1);
    }, [configSearch]);

    useEffect(() => {
        setLotPage(1);
    }, [lotSearch, lotFilterStatus, lotFilterPayment, lotFilterType, lotFilterSection]);

    // ── Subscribe to active System Date (PHT) for real-time overdue evaluation ──
    useEffect(() => {
        const unsub = subscribeSystemDate((info) => {
            setTodayStr(info.activeDate);
        });
        return () => unsub();
    }, []);

    // ── Helper: count interment fees for a grave type ID ──
    const getIntermentCount = (row) => {
        if (!row) return 0;
        const targetId = String(row.id || row.grave_type_id || "").trim().toLowerCase();
        const targetTypeId = String(row.grave_type_id || row.id || "").trim().toLowerCase();
        const targetName = String(row.grave_type || row.name || "").trim().toLowerCase();

        return intermentFees.filter((f) => {
            const fLotType = String(f.graveLot_type || f.grave_type_id || "").trim().toLowerCase();
            const fTypeId = String(f.grave_type_id || f.graveLot_type || "").trim().toLowerCase();
            const fTypeName = String(f.grave_type || "").trim().toLowerCase();

            if (targetId && (fLotType === targetId || fTypeId === targetId)) return true;
            if (targetTypeId && (fLotType === targetTypeId || fTypeId === targetTypeId)) return true;
            if (targetName && (fTypeName === targetName || fLotType === targetName)) return true;
            return false;
        }).length;
    };

    // ── Config filter & pagination ──
    const filteredGraveTypes = graveTypes.filter((gt) => {
        const query = configSearch.toLowerCase().trim();
        if (!query) return true;
        const name = (gt.grave_type || "").toLowerCase();
        return name.includes(query);
    });

    const configTotalPages = Math.ceil(filteredGraveTypes.length / configPerPage) || 1;
    const configStartIndex = (configPage - 1) * configPerPage;
    const paginatedGraveTypes = filteredGraveTypes.slice(configStartIndex, configStartIndex + configPerPage);

    // ── Config columns ──
    const configColumns = [
        {
            key: "grave_type_id",
            label: "#",
            render: (row, idx) => (
                <span className="config-index">{configStartIndex + idx + 1}</span>
            )
        },
        {
            key: "grave_type",
            label: "Grave Type",
            render: (row) => (
                <span className="config-type-name">
                    {row.grave_type || "—"}
                </span>
            )
        },
        {
            key: "lot_price",
            label: "Lot Price",
            render: (row) => (
                <span className="lot-price">
                    {row.lot_price != null ? `₱${Number(row.lot_price).toLocaleString()}` : "—"}
                </span>
            )
        },
        {
            key: "interment",
            label: "Interment",
            render: (row) => {
                const count = getIntermentCount(row);
                return (
                    <span className="interment-count">
                        {count}
                    </span>
                );
            }
        },
        {
            key: "installment",
            label: "Installment",
            render: (row) => {
                const hasInstallment = !!row.installment;
                return (
                    <span className={`installment-pill ${hasInstallment ? "installment-yes" : "installment-no"}`}>
                        {hasInstallment ? "Eligible" : "No"}
                    </span>
                );
            }
        },
        {
            key: "contract",
            label: "Ownership / Lease",
            render: (row) => (
                <span className={`config-contract ${!row.contract ? "contract-perpetual" : ""}`}>
                    {row.contract || "Perpetual"}
                </span>
            )
        },
        {
            key: "actions",
            label: "",
            render: (row) => (
                <div className="actions-cell">
                    <button
                        className="config-action-btn config-edit-btn"
                        onClick={() => handleEdit(row)}
                        title="Edit"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        className="config-action-btn config-delete-btn"
                        onClick={() => console.log("Delete grave type:", row)}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    // ─────────────────────────────────────────────────────────────────────────────
    // GRAVE LOT & BURIAL COMBINED DATA
    // ─────────────────────────────────────────────────────────────────────────────
    const combinedLots = useMemo(() => {
        return plots.map((plot) => {
            // Find burials belonging to this plot
            const plotBurials = burials.filter((b) => b.plot_id === plot.id);

            // Find client owner
            const ownerId = plot.user_id || plotBurials[0]?.user_id;
            const client = clients.find((c) => c.user_id === ownerId);

            // Find grave type
            const graveType = graveTypes.find(
                (gt) => (gt.id || gt.grave_type_id) === plot.grave_type_id
            );

            // Find payment record matching this plot
            const payment = payments.find((p) => p.plot_id === plot.id);

            const maxCap = Number(plot.maxCapacity ?? plot.capacity ?? graveType?.capacity ?? 1);
            const occupied = plotBurials.length > 0 ? plotBurials.length : Number(plot.occupiedCount ?? 0);

            // Normalized status
            let computedStatus = (plot.status || "available").toLowerCase();
            if (occupied >= maxCap && maxCap > 0) {
                computedStatus = "occupied";
            } else if (occupied > 0 && occupied < maxCap) {
                computedStatus = "partial";
            }

            // Payment category & due date computation
            const paymentCategory = computePaymentCategory(payment, plot, plotBurials[0], todayStr);
            const paymentDueDate = getPaymentDueDate(payment, plotBurials[0]);

            return {
                ...plot,
                plotBurials,
                client,
                payment,
                paymentCategory,
                paymentDueDate,
                ownerName: client ? `${client.first_name || ""} ${client.last_name || ""}`.trim() : (plot.owner || ""),
                ownerContact: client?.contact || "",
                graveTypeName: graveType?.grave_type || graveType?.name || plot.grave_type_id || "Single Niche",
                lotPrice: graveType?.lot_price,
                maxCap,
                occupied,
                status: computedStatus,
            };
        });
    }, [plots, burials, clients, graveTypes, payments, todayStr]);

    // Unique sections for filter dropdown
    const uniqueSections = useMemo(() => {
        const set = new Set();
        plots.forEach((p) => {
            if (p.section) set.add(p.section);
        });
        return Array.from(set).sort();
    }, [plots]);

    // Filtered Grave Lots
    const filteredLots = useMemo(() => {
        return combinedLots.filter((lot) => {
            // Search filter
            if (lotSearch.trim()) {
                const q = lotSearch.toLowerCase().trim();
                const matchCode = (lot.plotCode || lot.id || "").toLowerCase().includes(q);
                const matchSection = (lot.section || "").toLowerCase().includes(q);
                const matchOwner = (lot.ownerName || "").toLowerCase().includes(q);
                const matchBurial = (lot.plotBurials || []).some((b) =>
                    (b.name || "").toLowerCase().includes(q)
                );
                if (!matchCode && !matchSection && !matchOwner && !matchBurial) return false;
            }

            // Status filter
            if (lotFilterStatus !== "all") {
                if (lot.status !== lotFilterStatus) return false;
            }

            // Payment filter
            if (lotFilterPayment !== "all") {
                if (lot.paymentCategory !== lotFilterPayment) return false;
            }

            // Grave Type filter
            if (lotFilterType !== "all") {
                if (lot.grave_type_id !== lotFilterType) return false;
            }

            // Section filter
            if (lotFilterSection !== "all") {
                if (lot.section !== lotFilterSection) return false;
            }

            return true;
        });
    }, [combinedLots, lotSearch, lotFilterStatus, lotFilterPayment, lotFilterType, lotFilterSection]);

    const lotTotalPages = Math.ceil(filteredLots.length / lotPerPage) || 1;
    const lotStartIndex = (lotPage - 1) * lotPerPage;
    const paginatedLots = filteredLots.slice(lotStartIndex, lotStartIndex + lotPerPage);

    // KPI counts
    const availableLotsCount = combinedLots.filter((l) => l.status === "available").length;
    const partialLotsCount = combinedLots.filter((l) => l.status === "partial").length;
    const occupiedLotsCount = combinedLots.filter((l) => l.status === "occupied").length;
    const totalBurialsCount = burials.length;

    // Handle Sync All Occupancies
    const handleSyncAllOccupancies = async () => {
        try {
            setSyncingAllLots(true);
            const res = await syncAllPlotsOccupancy();
            const count = res?.updatedCount || 0;
            setLotFeedback({
                type: "success",
                text: count > 0
                    ? `Successfully synchronized ${count} plot occupancy status(es) with burial records!`
                    : "All plot occupancy statuses are fully up to date with burial records."
            });
            setTimeout(() => setLotFeedback(null), 5000);
        } catch (err) {
            setLotFeedback({
                type: "error",
                text: "Failed to sync occupancies: " + err.message
            });
            setTimeout(() => setLotFeedback(null), 5000);
        } finally {
            setSyncingAllLots(false);
        }
    };

    // Columns for Grave Lot & Burial Table
    const lotColumns = [
        {
            key: "index",
            label: "#",
            render: (row, idx) => (
                <span className="config-index">{lotStartIndex + idx + 1}</span>
            )
        },
        {
            key: "plotCode",
            label: "Plot & Section",
            render: (row) => (
                <div className="lot-code-cell">
                    <span className="lot-code-pill">{row.plotCode || row.id}</span>
                    <span className="lot-section-sub">Section {row.section || "—"}</span>
                </div>
            )
        },
        {
            key: "graveType",
            label: "Grave Type",
            render: (row) => (
                <div className="lot-type-cell">
                    <span className="lot-type-name">{row.graveTypeName}</span>
                    {row.lotPrice != null && (
                        <span className="lot-type-price">₱{Number(row.lotPrice).toLocaleString()}</span>
                    )}
                </div>
            )
        },
        {
            key: "status",
            label: "Status",
            render: (row) => {
                const s = (row.status || "").toLowerCase();
                let label = "Available";
                if (s === "partial") label = "Partially Occupied";
                if (s === "occupied") label = "Occupied";
                if (s === "reserved") label = "Reserved (Pre-Need)";

                return (
                    <span className={`lot-table-status-pill status-${s}`}>
                        <span className="lot-badge-dot" />
                        {label}
                    </span>
                );
            }
        },
        {
            key: "payment",
            label: "Payment",
            render: (row) => {
                const category = row.paymentCategory;
                const pay = row.payment;

                if (category === "unsold") {
                    return (
                        <div className="lot-payment-cell">
                            <span className="lot-payment-unpaid">Unsold</span>
                            {row.lotPrice != null && (
                                <span className="lot-payment-sub">₱{Number(row.lotPrice).toLocaleString()}</span>
                            )}
                        </div>
                    );
                }

                if (category === "paid") {
                    const total = Number(pay?.total ?? row.lotPrice ?? 0);
                    return (
                        <div className="lot-payment-cell">
                            <span className="lot-payment-pill payment-paid">
                                <CheckCircle size={11} /> Paid in Full
                            </span>
                            {total > 0 && (
                                <span className="lot-payment-sub">₱{total.toLocaleString()}</span>
                            )}
                        </div>
                    );
                }

                if (category === "overdue") {
                    const balance = Number(pay?.balance ?? 0);
                    return (
                        <div className="lot-payment-cell">
                            <span className="lot-payment-pill payment-overdue">
                                <AlertCircle size={11} /> Overdue
                            </span>
                            <span className="lot-payment-sub overdue-text">
                                Bal: ₱{balance.toLocaleString()}
                            </span>
                            {row.paymentDueDate && (
                                <span className="lot-payment-due-date overdue-due">
                                    Due: {row.paymentDueDate}
                                </span>
                            )}
                        </div>
                    );
                }

                if (category === "installment") {
                    const balance = Number(pay?.balance ?? 0);
                    return (
                        <div className="lot-payment-cell">
                            <span className="lot-payment-pill payment-partial">
                                <Clock size={11} /> Installment
                            </span>
                            <span className="lot-payment-sub balance-text">
                                Bal: ₱{balance.toLocaleString()}
                            </span>
                            {row.paymentDueDate && (
                                <span className="lot-payment-due-date">
                                    Due: {row.paymentDueDate}
                                </span>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="lot-payment-cell">
                        <span className="lot-payment-unpaid">No Payment Record</span>
                    </div>
                );
            }
        },
        {
            key: "occupancy",
            label: "Occupancy",
            render: (row) => {
                const occ = row.occupied;
                const cap = row.maxCap;
                const pct = Math.min(100, Math.round((occ / Math.max(1, cap)) * 100));
                return (
                    <div className="lot-table-occ-wrap">
                        <span className="lot-table-occ-text">
                            <strong>{occ}</strong> / {cap} slot{cap > 1 ? "s" : ""}
                        </span>
                        <div className="lot-mini-bar">
                            <div
                                className="lot-mini-bar-fill"
                                style={{
                                    width: `${pct}%`,
                                    backgroundColor: pct >= 100 ? "#ef4444" : pct > 0 ? "#f59e0b" : "#10b981"
                                }}
                            />
                        </div>
                    </div>
                );
            }
        },
        {
            key: "burials",
            label: "Buried Individual(s)",
            render: (row) => {
                const bList = row.plotBurials || [];
                if (bList.length === 0) {
                    return <span className="lot-table-vacant">— Vacant Lot —</span>;
                }
                return (
                    <div className="lot-table-burial-cell">
                        <div className="burial-name-row">
                            <span className="burial-person-name">{bList[0].name}</span>
                            {bList.length > 1 && (
                                <span className="burial-more-tag">+{bList.length - 1} more</span>
                            )}
                        </div>
                        <div className="burial-sub-meta">
                            {bList[0].interment_type && (
                                <span className="burial-type-micro">{bList[0].interment_type}</span>
                            )}
                            {bList[0].date_buried && (
                                <span className="burial-date-micro">Buried: {bList[0].date_buried}</span>
                            )}
                        </div>
                    </div>
                );
            }
        },
        {
            key: "owner",
            label: "Buyer / Owner",
            render: (row) => {
                if (!row.ownerName) {
                    return <span className="lot-table-unassigned">Available</span>;
                }
                return (
                    <div className="lot-table-client-cell">
                        <span className="client-main-name">{row.ownerName}</span>
                        {row.ownerContact && (
                            <span className="client-contact-sub">{row.ownerContact}</span>
                        )}
                    </div>
                );
            }
        },
        {
            key: "actions",
            label: "",
            render: (row) => (
                <div className="actions-cell">
                    <button
                        type="button"
                        className="config-action-btn config-view-btn"
                        onClick={() => setSelectedPlotForDetail(row)}
                        title="View Grave Lot & Burial Details"
                    >
                        <Eye size={15} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="grave-management-page">
            <Header page="grave" />

            <div className="grave-management-container">
                {/* ── Tab Switcher (Only visible to Admin) ── */}
                {!isStaff && (
                    <div className="gm-tab-bar">
                        <button
                            className={`gm-tab-btn ${activeTab === "config" ? "gm-tab-active" : ""}`}
                            onClick={() => setActiveTab("config")}
                        >
                            <Settings size={15} />
                            <span>Grave Configuration</span>
                        </button>
                        <button
                            className={`gm-tab-btn ${activeTab === "lot" ? "gm-tab-active" : ""}`}
                            onClick={() => setActiveTab("lot")}
                        >
                            <LayoutGrid size={15} />
                            <span>Grave Lot &amp; Burials</span>
                            {plots.length > 0 && (
                                <span className="gm-tab-counter">{plots.length}</span>
                            )}
                        </button>
                    </div>
                )}

                {/* ── TAB: Grave Configuration (Admin Only) ── */}
                {!isStaff && activeTab === "config" && (
                    <div className="gm-config-section">
                        <div className="page-title-bar">
                            <h2>Grave Type Configuration</h2>
                            <div className="page-actions-group">
                                <Button
                                    variant="create"
                                    onClick={() => setShowAddModal(true)}
                                    title="Add Type"
                                >
                                    Add Type
                                </Button>
                            </div>
                        </div>

                        <div className="filters-bar">
                            <div className="search-wrapper">
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search grave type..."
                                    value={configSearch}
                                    onChange={(e) => setConfigSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {graveTypesLoading ? (
                            <p>Loading grave types...</p>
                        ) : (
                            <>
                                <Table
                                    data={paginatedGraveTypes}
                                    columns={configColumns}
                                />
                                <div className="gm-pagination-bar">
                                    <span className="gm-showing-text">
                                        Showing {filteredGraveTypes.length === 0 ? 0 : configStartIndex + 1} to{' '}
                                        {Math.min(configStartIndex + configPerPage, filteredGraveTypes.length)} of{' '}
                                        {filteredGraveTypes.length} grave types
                                    </span>
                                    {configTotalPages > 1 && (
                                        <Pagination
                                            currentPage={configPage}
                                            totalPages={configTotalPages}
                                            onPageChange={setConfigPage}
                                        />
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── TAB: Grave Lot & Burials ── */}
                {(isStaff || activeTab === "lot") && (
                    <div className="gm-lot-section">
                        {/* KPI Cards Grid */}
                        <div className="gm-lot-kpi-grid">
                            <div className="gm-lot-kpi-card">
                                <div className="lot-kpi-header">
                                    <span className="lot-kpi-label">TOTAL GRAVE LOTS</span>
                                    <span className="lot-kpi-icon blue"><Layers size={16} /></span>
                                </div>
                                <div className="lot-kpi-body">
                                    <span className="lot-kpi-value">{plots.length}</span>
                                </div>
                                <span className="lot-kpi-sub">Total physical cemetery lots</span>
                            </div>

                            <div className="gm-lot-kpi-card">
                                <div className="lot-kpi-header">
                                    <span className="lot-kpi-label">AVAILABLE (VACANT)</span>
                                    <span className="lot-kpi-icon green"><CheckCircle size={16} /></span>
                                </div>
                                <div className="lot-kpi-body">
                                    <span className="lot-kpi-value">{availableLotsCount}</span>
                                </div>
                                <span className="lot-kpi-sub">Ready for sale &amp; interments</span>
                            </div>

                            <div className="gm-lot-kpi-card">
                                <div className="lot-kpi-header">
                                    <span className="lot-kpi-label">OCCUPIED / PARTIAL</span>
                                    <span className="lot-kpi-icon amber"><AlertCircle size={16} /></span>
                                </div>
                                <div className="lot-kpi-body">
                                    <span className="lot-kpi-value">{occupiedLotsCount + partialLotsCount}</span>
                                </div>
                                <span className="lot-kpi-sub">
                                    {occupiedLotsCount} fully occupied &bull; {partialLotsCount} partial
                                </span>
                            </div>

                            <div className="gm-lot-kpi-card">
                                <div className="lot-kpi-header">
                                    <span className="lot-kpi-label">BURIED DECEASED</span>
                                    <span className="lot-kpi-icon red"><Heart size={16} /></span>
                                </div>
                                <div className="lot-kpi-body">
                                    <span className="lot-kpi-value">{totalBurialsCount}</span>
                                </div>
                                <span className="lot-kpi-sub">Total registered interments</span>
                            </div>
                        </div>

                        {/* Title Bar & Actions */}
                        <div className="page-title-bar">
                            <div>
                                <h2>Grave Lots &amp; Burial Inventory</h2>
                                <p className="gm-page-subtitle">
                                    Manage individual cemetery plots, track burial records, and view owner assignments.
                                </p>
                            </div>
                            <div className="page-actions-group">
                                <button
                                    type="button"
                                    className="gm-outline-btn"
                                    onClick={handleSyncAllOccupancies}
                                    disabled={syncingAllLots}
                                    title="Audit and synchronize plot occupied statuses against burial records in Firestore"
                                >
                                    <RefreshCw size={14} className={syncingAllLots ? "spinning" : ""} />
                                    {syncingAllLots ? "Syncing..." : "Sync All Occupancy"}
                                </button>
                            </div>
                        </div>

                        {/* Filters Bar */}
                        <div className="filters-bar">
                            <div className="search-wrapper" style={{ width: "320px" }}>
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search plot code, deceased, client..."
                                    value={lotSearch}
                                    onChange={(e) => {
                                        setLotSearch(e.target.value);
                                        setLotPage(1);
                                    }}
                                />
                            </div>

                            {/* Status Filter */}
                            <select
                                className="gm-select-filter"
                                value={lotFilterStatus}
                                onChange={(e) => {
                                    setLotFilterStatus(e.target.value);
                                    setLotPage(1);
                                }}
                            >
                                <option value="all">All Statuses</option>
                                <option value="available">Available</option>
                                <option value="partial">Partially Occupied</option>
                                <option value="occupied">Fully Occupied</option>
                                <option value="reserved">Reserved (Pre-Need)</option>
                            </select>

                            {/* Payment Status Filter */}
                            <select
                                className="gm-select-filter"
                                value={lotFilterPayment}
                                onChange={(e) => {
                                    setLotFilterPayment(e.target.value);
                                    setLotPage(1);
                                }}
                            >
                                <option value="all">All Payments</option>
                                <option value="paid">Paid in Full</option>
                                <option value="installment">Installment</option>
                                <option value="overdue">Overdue</option>
                                <option value="unsold">Unsold</option>
                            </select>

                            {/* Grave Type Filter */}
                            <select
                                className="gm-select-filter"
                                value={lotFilterType}
                                onChange={(e) => {
                                    setLotFilterType(e.target.value);
                                    setLotPage(1);
                                }}
                            >
                                <option value="all">All Grave Types</option>
                                {graveTypes.map((gt) => (
                                    <option key={gt.id || gt.grave_type_id} value={gt.id || gt.grave_type_id}>
                                        {gt.grave_type || gt.name}
                                    </option>
                                ))}
                            </select>

                            {/* Section Filter */}
                            {uniqueSections.length > 0 && (
                                <select
                                    className="gm-select-filter"
                                    value={lotFilterSection}
                                    onChange={(e) => {
                                        setLotFilterSection(e.target.value);
                                        setLotPage(1);
                                    }}
                                >
                                    <option value="all">All Sections</option>
                                    {uniqueSections.map((sec) => (
                                        <option key={sec} value={sec}>
                                            Section {sec}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Feedback Banner */}
                        {lotFeedback && (
                            <div className={`lot-feedback-box ${lotFeedback.type}`} style={{ margin: "0 0 16px 0" }}>
                                {lotFeedback.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                                <span>{lotFeedback.text}</span>
                            </div>
                        )}

                        {/* Table */}
                        {plotsLoading ? (
                            <p>Loading grave lots and burial data...</p>
                        ) : filteredLots.length === 0 ? (
                            <div className="gm-lot-empty">
                                <LayoutGrid size={38} strokeWidth={1.3} />
                                <p>No grave lots found matching the filters.</p>
                            </div>
                        ) : (
                            <>
                                <Table
                                    data={paginatedLots}
                                    columns={lotColumns}
                                />
                                <div className="gm-pagination-bar">
                                    <span className="gm-showing-text">
                                        Showing {filteredLots.length === 0 ? 0 : lotStartIndex + 1} to{' '}
                                        {Math.min(lotStartIndex + lotPerPage, filteredLots.length)} of{' '}
                                        {filteredLots.length} grave lots
                                    </span>
                                    {lotTotalPages > 1 && (
                                        <Pagination
                                            currentPage={lotPage}
                                            totalPages={lotTotalPages}
                                            onPageChange={setLotPage}
                                        />
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ── Grave Update Modal (Admin Only) ── */}
            {!isStaff && (
                <GraveUpdateModal
                    isOpen={showUpdateModal}
                    grave={selectedGrave}
                    intermentFees={intermentFees}
                    onClose={() => {
                        setShowUpdateModal(false);
                        setSelectedGrave(null);
                    }}
                    onUpdate={handleUpdate}
                />
            )}

            {/* ── Grave Add Modal (Admin Only) ── */}
            {!isStaff && (
                <GraveAddModal
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onAdd={handleAdd}
                />
            )}

            {/* ── Grave Lot Detail Modal (Burial & Plot Inspector) ── */}
            <GraveLotDetailModal
                isOpen={Boolean(selectedPlotForDetail)}
                plot={selectedPlotForDetail}
                onClose={() => setSelectedPlotForDetail(null)}
                onRefresh={async () => {
                    // Update selected plot with fresh data
                    if (selectedPlotForDetail) {
                        const updated = combinedLots.find((l) => l.id === selectedPlotForDetail.id);
                        if (updated) setSelectedPlotForDetail(updated);
                    }
                }}
            />
        </div>
    );
}