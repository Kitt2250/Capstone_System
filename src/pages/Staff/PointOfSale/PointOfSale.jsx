import React, { useState, useEffect, useMemo } from "react";
import Header from "../../../components/Header/Header";
import Button from "../../../components/Buttons/Buttons";
import { subscribeGraveTypes, subscribeIntermentFees } from "../../../services/graveServices";
import { subscribePlots } from "../../../services/plotServices";
import {
    Wallet,
    Bed,
    ShoppingCart,
    User,
    Calendar,
    FileText,
    Receipt,
    CheckCircle,
    Info,
    Layers,
    Heart,
    UserX,
    Clock
} from "lucide-react";
import "./PointOfSale.css";
import WakeSpaceModal from "../../../components/WakeSpaceModal/WakeSpaceModal.jsx";
import GraveLotsModal from "../../../components/GraveLotsModal/GraveLotsModal.jsx";
import {
    createWakeSpaceBooking,
    subscribeWakeSpaceBookings,
    subscribeWakeSpaces
} from "../../../services/wakeSpaceServices.jsx";
import { processPOSController, calculateIntermentFeeController } from "../../../controller/posController.jsx";
import { generateReceiptNumber } from "../../../services/paymentServices.jsx";
import { getSystemDate, getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import { createWakeSpaceBookingController } from "../../../controller/wakeSpaceController.jsx";

const DEFAULT_WAKE_SPACES = [
    { id: "WAS-001", wake: "A", price: 8500, status: "active" },
    { id: "WAS-002", wake: "B", price: 8500, status: "active" },
    { id: "WAS-003", wake: "C", price: 8500, status: "active" },
];

function PointOfSale() {
    // Dynamic Firestore data states for Grave Lots and Plot Availability
    const [rawGraveTypes, setRawGraveTypes] = useState([]);
    const [rawIntermentFees, setRawIntermentFees] = useState([]);
    const [plots, setPlots] = useState([]);
    const [loadingGraveLots, setLoadingGraveLots] = useState(true);

    // Interment staged selection state (linked to selected grave lot)
    const [selectedInterment, setSelectedInterment] = useState(null);

    // WakeSpace staged reservation state (not recorded until Process Payment)
    const [wakeSpaces, setWakeSpaces] = useState(DEFAULT_WAKE_SPACES);
    const [wakeSpaceItem, setWakeSpaceItem] = useState(null);
    const [showWakeModal, setShowWakeModal] = useState(false);
    const [selectedWakeSpaceForModal, setSelectedWakeSpaceForModal] = useState(null);
    const [wakeBookings, setWakeBookings] = useState([]);

    // GraveLots modal state
    const [showGraveLotsModal, setShowGraveLotsModal] = useState(false);
    const [selectedGraveType, setSelectedGraveType] = useState(null);
    const [selectedGravePlot, setSelectedGravePlot] = useState(null);

    // Transaction & client states
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [address, setAddress] = useState("");
    const [contactNumber, setContactNumber] = useState("");
    const [email, setEmail] = useState("");
    const [relationship, setRelationship] = useState("");
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentFeedback, setPaymentFeedback] = useState("");

    // Deceased information states
    const [deceasedFirstName, setDeceasedFirstName] = useState("");
    const [deceasedLastName, setDeceasedLastName] = useState("");
    const [deceasedDOB, setDeceasedDOB] = useState("");
    const [deceasedDOD, setDeceasedDOD] = useState("");
    const [deceasedDateBuried, setDeceasedDateBuried] = useState("");

    // Static UI state without business logic (as requested: "dont add function yet")
    const [needType, setNeedType] = useState("actual");
    const [discountType, setDiscountType] = useState("None");
    const [paymentPlan, setPaymentPlan] = useState("On the Spot Cash");
    const [burialDate, setBurialDate] = useState(getSystemDateISO());
    const [amountTendered, setAmountTendered] = useState("");

    // Document checklist UI state
    const [documents, setDocuments] = useState([
        { id: 1, name: "Death Certificate", checked: false, required: false },
        { id: 2, name: "Burial/Transfer of Cadaver Permit", checked: false, required: false },
        { id: 3, name: "Transfer Permit for Bone Transfer", checked: false, required: false },
        { id: 4, name: "Certificate of Ownership (lot owners)", checked: false, required: false },
        { id: 5, name: "Valid ID of Payor", checked: false, required: true },
        { id: 6, name: "Signed Purchase Agreement", checked: false, required: true }
    ]);

    const toggleDocument = (id) => {
        setDocuments((prev) =>
            prev.map((doc) => (doc.id === id ? { ...doc, checked: !doc.checked } : doc))
        );
    };

    // Real-time listener for grave types (gravelot_type / grave_type) and plots
    useEffect(() => {
        let isMounted = true;

        const unsubTypes = subscribeGraveTypes(
            (types) => {
                if (isMounted) {
                    setRawGraveTypes(types || []);
                    setLoadingGraveLots(false);
                }
            },
            (err) => {
                console.error("Failed to load grave types:", err);
                if (isMounted) setLoadingGraveLots(false);
            }
        );

        const unsubInterment = subscribeIntermentFees(
            (feesList) => {
                if (isMounted) {
                    setRawIntermentFees(feesList || []);
                }
            },
            (err) => {
                console.error("Failed to load interment fees:", err);
            }
        );

        const unsubPlots = subscribePlots(
            (plotList) => {
                if (isMounted) {
                    setPlots(plotList || []);
                }
            },
            (err) => {
                console.error("Failed to load plots:", err);
            }
        );

        const unsubWake = subscribeWakeSpaceBookings(
            (bookingsList) => {
                if (isMounted) {
                    setWakeBookings(bookingsList || []);
                }
            },
            (err) => {
                console.error("Failed to load wake space bookings:", err);
            }
        );

        const unsubWakeSpaces = subscribeWakeSpaces(
            (spaces) => {
                if (isMounted) {
                    if (spaces && spaces.length > 0) {
                        const sorted = [...spaces].sort((a, b) => {
                            const order = { A: 1, B: 2, C: 3 };
                            return (order[a.wake] || 99) - (order[b.wake] || 99);
                        });
                        setWakeSpaces(sorted);
                    } else {
                        setWakeSpaces(DEFAULT_WAKE_SPACES);
                    }
                }
            },
            (err) => {
                console.error("Failed to load wake spaces:", err);
                if (isMounted) setWakeSpaces(DEFAULT_WAKE_SPACES);
            }
        );

        return () => {
            isMounted = false;
            if (unsubTypes) unsubTypes();
            if (unsubInterment) unsubInterment();
            if (unsubPlots) unsubPlots();
            if (unsubWake) unsubWake();
            if (unsubWakeSpaces) unsubWakeSpaces();
        };
    }, []);

    // Helper: calculate real-time availability and next vacant date for a specific Wake Space facility
    const getSpaceAvailability = (space) => {
        const today = getSystemDate();
        today.setHours(0, 0, 0, 0);

        const formatDateISO = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        };

        const todayStr = formatDateISO(today);

        const spaceBookings = (wakeBookings || []).filter(
            (b) =>
                (b.spaceId === space.id || b.spaceId === space.wake) &&
                b.startDate &&
                b.endDate &&
                b.status !== "cancelled" &&
                b.status !== "completed"
        );

        const isOccupiedToday = spaceBookings.some(
            (b) => todayStr >= b.startDate && todayStr <= b.endDate
        );

        let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        for (let i = 0; i < 365; i++) {
            const checkStr = formatDateISO(checkDate);
            const isBooked = spaceBookings.some(
                (b) => checkStr >= b.startDate && checkStr <= b.endDate
            );
            if (!isBooked) break;
            checkDate.setDate(checkDate.getDate() + 1);
        }

        const nextVacantFormatted = checkDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });

        return {
            isOccupiedToday,
            nextVacantDate: checkDate,
            nextVacantFormatted,
        };
    };

    const handleOpenWakeModal = (space) => {
        setSelectedWakeSpaceForModal(space);
        setShowWakeModal(true);
    };

    const handlePlotSelected = (plot) => {
        if (!plot) return;

        const status = String(plot.status || "available").trim().toLowerCase();
        if (status !== "available" && status !== "vacant" && status !== "open") {
            return;
        }

        const matchingType = displayedGraveLots.find((gt) => {
            const typeId = String(gt.id || "").trim().toLowerCase();
            const typeName = String(gt.name || "").trim().toLowerCase();
            const plotTypeId = String(plot.grave_type_id || plot.graveLotTypeID || "").trim().toLowerCase();
            const plotTypeName = String(plot.grave_type || plot.graveType || "").trim().toLowerCase();

            if (typeId && (typeId === plotTypeId || typeId === plotTypeName)) return true;
            if (typeName && (typeName === plotTypeName || typeName === plotTypeId)) return true;
            if (typeName && plotTypeName && (typeName.includes(plotTypeName) || plotTypeName.includes(typeName))) return true;
            return false;
        });

        const price = matchingType ? matchingType.rawPrice : (selectedGraveType?.rawPrice || Number(plot.price || plot.lot_price || 0));
        const graveTypeName = matchingType ? matchingType.name : (selectedGraveType?.name || plot.grave_type || plot.graveType || "Grave Lot");
        const plotCode = plot.plotCode || plot.name || `Lot ${plot.id}`;

        setSelectedGravePlot({
            id: plot.id,
            lotId: matchingType ? matchingType.id : selectedGraveType?.id,
            plotCode,
            section: plot.section || "A",
            graveType: graveTypeName,
            price: price,
            rawPlot: plot,
            matchingType: matchingType || selectedGraveType
        });
        setSelectedInterment(null); // Reset interment selection when new plot is selected
        setShowGraveLotsModal(false);
    };

    // Combine grave types with real-time available plot counts
    const displayedGraveLots = rawGraveTypes.map((gt) => {
        const typeId = String(gt.grave_type_id || gt.id || "").trim().toLowerCase();
        const typeName = String(gt.grave_type || gt.name || gt.graveType || "").trim().toLowerCase();

        // Calculate available plots matching this grave lot type
        const matchingAvailablePlots = plots.filter((p) => {
            const plotTypeId = String(p.grave_type_id || p.graveLotTypeID || "").trim().toLowerCase();
            const plotTypeName = String(p.grave_type || p.graveType || "").trim().toLowerCase();

            const isTypeMatch =
                (plotTypeId && (plotTypeId === typeId || plotTypeId === typeName)) ||
                (plotTypeName && (plotTypeName === typeName || plotTypeName === typeId));

            if (!isTypeMatch) return false;

            const status = String(p.status || "available").trim().toLowerCase();
            const isAvailableStatus = status === "available" || status === "vacant";

            // If capacity tracking is present on plot
            const hasCapacity =
                p.maxCapacity != null && p.occupiedCount != null
                    ? Number(p.occupiedCount) < Number(p.maxCapacity)
                    : true;

            return isAvailableStatus && hasCapacity;
        });

        const availableCount = matchingAvailablePlots.length;
        const rawPrice = Number(gt.lot_price || gt.price || 0);
        const displayName = gt.grave_type || gt.name || gt.graveType || "Grave Lot";

        return {
            id: gt.id || gt.grave_type_id || displayName,
            name: displayName,
            price: rawPrice > 0 ? `₱${rawPrice.toLocaleString()}` : "₱0",
            rawPrice,
            available: availableCount,
            isSoldOut: availableCount === 0,
            installment: gt.installment,
            installment_duration: gt.installment_duration || gt.installmentDuration || 12,
            downpayment: gt.downpayment != null ? Number(gt.downpayment) : null,
            monthly_payment: gt.monthly_payment != null ? Number(gt.monthly_payment) : null,
            rawGraveType: gt
        };
    });

    const completedDocsCount = documents.filter((d) => d.checked).length;

    // Filter matching interment fees for the given selected grave lot
    const matchingIntermentFees = useMemo(() => {
        if (!selectedGravePlot) return [];

        const targetId = String(selectedGravePlot.lotId || "").trim().toLowerCase();
        const targetName = String(selectedGravePlot.graveType || "").trim().toLowerCase();

        const matched = rawIntermentFees.filter((f) => {
            const fLotType = String(f.graveLot_type || f.grave_type_id || "").trim().toLowerCase();
            const fTypeName = String(f.grave_type || f.interment_type || "").trim().toLowerCase();

            if (targetId && (fLotType === targetId || fTypeName === targetId)) return true;
            if (targetName && (fLotType === targetName || fTypeName === targetName)) return true;
            if (targetName && fLotType && (targetName.includes(fLotType) || fLotType.includes(targetName))) return true;
            return false;
        });

        if (matched.length > 0) return matched;

        // Fallback standard options if not specifically defined in DB yet
        return [
            {
                id: `DEFAULT_STD_${targetId || "lot"}`,
                interment_type: "Standard Burial / Interment",
                fee: 5000,
                graveLot_type: selectedGravePlot.lotId,
            },
            {
                id: `DEFAULT_BONE_${targetId || "lot"}`,
                interment_type: "Bone Transfer / Relocation",
                fee: 3500,
                graveLot_type: selectedGravePlot.lotId,
            },
            {
                id: `DEFAULT_CREM_${targetId || "lot"}`,
                interment_type: "Cremation Vault Burial",
                fee: 4000,
                graveLot_type: selectedGravePlot.lotId,
            }
        ];
    }, [selectedGravePlot, rawIntermentFees]);

    // Reset whole transaction
    const handleResetForm = () => {
        setSelectedGravePlot(null);
        setSelectedGraveType(null);
        setSelectedInterment(null);
        setWakeSpaceItem(null);
        setFirstName("");
        setLastName("");
        setAddress("");
        setContactNumber("");
        setEmail("");
        setRelationship("");
        setNeedType("actual");
        setDiscountType("None");
        setPaymentPlan("Full Payment (On the Spot)");
        setBurialDate(getSystemDateISO());
        setAmountTendered("");
        setPaymentFeedback("");
        setDocuments((prev) => prev.map((d) => ({ ...d, checked: false })));
        setDeceasedFirstName("");
        setDeceasedLastName("");
        setDeceasedDOB("");
        setDeceasedDOD("");
        setDeceasedDateBuried("");
    };

    const effectiveBurialDate = deceasedDateBuried || burialDate || getSystemDateISO();

    // Interment calculation via controller (applies weekend +₱3,000 surcharge for Mausoleum & Single Niche Fresh Burial)
    const intermentCalculation = useMemo(() => {
        if (!selectedInterment) {
            return {
                baseFee: 0,
                finalFee: 0,
                weekendSurcharge: 0,
                isWeekendRateApplied: false,
                rateNote: ""
            };
        }
        return calculateIntermentFeeController({
            baseFee: selectedInterment.baseFee != null ? selectedInterment.baseFee : selectedInterment.fee,
            plotOrGraveType: selectedGravePlot,
            intermentServiceOrType: selectedInterment.type || selectedInterment.interment_type,
            burialDate: effectiveBurialDate
        });
    }, [selectedInterment, selectedGravePlot, effectiveBurialDate]);

    // Total price calculations
    const gravePrice = selectedGravePlot ? Number(selectedGravePlot.price || 0) : 0;
    const intermentFee = intermentCalculation.finalFee;
    const wakePrice = wakeSpaceItem ? Number(wakeSpaceItem.totalPrice || 0) : 0;

    const subtotal = gravePrice + intermentFee + wakePrice;

    const isDiscountEligible = discountType === "Senior" || discountType === "PWD";
    const discountAmount = isDiscountEligible ? Math.round(subtotal * 0.2) : 0;

    const totalDue = Math.max(0, subtotal - discountAmount);

    // Resolve active grave lot type configuration
    const activeGraveTypeConfig = useMemo(() => {
        if (!selectedGravePlot) return null;
        if (selectedGravePlot.matchingType?.rawGraveType) {
            return selectedGravePlot.matchingType.rawGraveType;
        }
        const targetId = String(selectedGravePlot.lotId || "").trim().toLowerCase();
        const targetName = String(selectedGravePlot.graveType || "").trim().toLowerCase();
        const plotTypeId = String(selectedGravePlot.rawPlot?.grave_type_id || selectedGravePlot.rawPlot?.graveLotTypeID || "").trim().toLowerCase();

        return rawGraveTypes.find((gt) => {
            const gtId = String(gt.id || gt.grave_type_id || "").trim().toLowerCase();
            const gtName = String(gt.grave_type || gt.name || gt.graveType || "").trim().toLowerCase();
            if (targetId && (gtId === targetId || gtName === targetId)) return true;
            if (plotTypeId && (gtId === plotTypeId || gtName === plotTypeId)) return true;
            if (targetName && (gtName === targetName || gtId === targetName)) return true;
            return false;
        });
    }, [selectedGravePlot, rawGraveTypes]);

    const isLotInstallmentEligible = useMemo(() => {
        if (!selectedGravePlot || !activeGraveTypeConfig) return false;
        const inst = activeGraveTypeConfig.installment;
        if (inst === true || inst === "true" || inst === "Eligible") return true;
        if (inst === false || inst === "false" || inst === "No" || !inst) return false;
        return Boolean(inst);
    }, [selectedGravePlot, activeGraveTypeConfig]);

    const lotInstallmentDuration = useMemo(() => {
        if (!activeGraveTypeConfig) return 12;
        const d = Number(activeGraveTypeConfig.installment_duration || activeGraveTypeConfig.installmentDuration);
        return d > 0 ? d : 12;
    }, [activeGraveTypeConfig]);

    // Reset payment plan to on the spot cash if newly selected lot does not support installment
    useEffect(() => {
        if (!isLotInstallmentEligible && paymentPlan.includes("Installment")) {
            setPaymentPlan("On the Spot Cash");
        }
    }, [isLotInstallmentEligible, paymentPlan]);

    // Down payment calculation based on selected grave lot
    const lotDownpayment = useMemo(() => {
        if (!selectedGravePlot || !isLotInstallmentEligible) return 0;
        if (activeGraveTypeConfig?.downpayment != null && !isNaN(Number(activeGraveTypeConfig.downpayment)) && Number(activeGraveTypeConfig.downpayment) > 0) {
            return Number(activeGraveTypeConfig.downpayment);
        }
        return Math.round(gravePrice * 0.5);
    }, [selectedGravePlot, isLotInstallmentEligible, activeGraveTypeConfig, gravePrice]);

    const isInstallment = paymentPlan.includes("Installment") && isLotInstallmentEligible;

    // Down payment is allotted ONLY to the graveLot
    const dpRequired = isInstallment ? lotDownpayment : 0;

    // Other services are separate from DP and must be paid cash on the spot
    const otherServicesTotal = intermentFee + wakePrice;

    // Remaining lot balance (only the graveLot is placed on installment)
    const remainingLotBalance = isInstallment ? Math.max(0, gravePrice - dpRequired) : 0;

    // Total Cash to be paid today (Downpayment + other services - discount)
    const totalCash = isInstallment
        ? Math.max(0, dpRequired + otherServicesTotal - discountAmount)
        : totalDue;

    const installmentMonths = isInstallment ? lotInstallmentDuration : 0;
    const monthlyStaggered = installmentMonths > 0 ? Math.round(remainingLotBalance / installmentMonths) : 0;

    // Next installment payment due date (advanced by 1 month)
    const nextDueDate = useMemo(() => {
        const base = burialDate ? new Date(burialDate) : new Date();
        const d = isNaN(base.getTime()) ? new Date() : new Date(base);
        d.setMonth(d.getMonth() + 1);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }, [burialDate]);

    const tenderedNum = parseFloat(amountTendered) || 0;
    const changeAmount = amountTendered !== "" && !isNaN(tenderedNum) && tenderedNum >= totalCash
        ? tenderedNum - totalCash
        : 0;

    const cartCount = (selectedGravePlot ? 1 : 0) + (selectedInterment ? 1 : 0) + (wakeSpaceItem ? 1 : 0);

    return (
        <div className="user-management-page">
            <Header page="pos" />

            <div className="user-management-container pos-page-container">
                {/* Title Bar matching UserManagement */}
                <div className="page-title-bar pos-title-bar">
                    <div className="pos-title-left">
                        <h2>
                            <Wallet className="page-title-icon" size={22} />
                            New Transaction
                        </h2>
                        <p className="pos-subtitle">
                            Select products below, then complete payment details on the right
                        </p>
                    </div>

                    <div className="page-actions-group">
                        <Button variant="reset" title="Reset form" onClick={handleResetForm}>
                            Reset
                        </Button>
                    </div>
                </div>

                {/* Two-Column Grid */}
                <div className="pos-main-grid">
                    {/* ── LEFT COLUMN ── */}
                    <div className="pos-column">
                        {/* Grave Lots Table Card (Dynamic from Firestore) */}
                        <div className="pos-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <Layers className="pos-card-icon" size={17} />
                                    Grave Lots
                                </h3>
                                <span className="badge-count">
                                    {loadingGraveLots
                                        ? "Loading..."
                                        : `${displayedGraveLots.length} Type${displayedGraveLots.length === 1 ? "" : "s"}`}
                                </span>
                            </div>

                            <div className="table-wrapper pos-table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Price</th>
                                            <th>Availability</th>
                                            <th style={{ textAlign: "right", paddingRight: "16px" }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingGraveLots ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    style={{ textAlign: "center", padding: "28px", color: "#64748b" }}
                                                >
                                                    Loading grave lot types & availability...
                                                </td>
                                            </tr>
                                        ) : displayedGraveLots.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    style={{ textAlign: "center", padding: "28px", color: "#64748b" }}
                                                >
                                                    No grave lot types found. Please configure them in Grave Management.
                                                </td>
                                            </tr>
                                        ) : (
                                            displayedGraveLots.map((lot) => (
                                                <tr key={lot.id}>
                                                    <td>
                                                        <span className="pos-product-name">{lot.name}</span>
                                                    </td>
                                                    <td>
                                                        <span className="pos-price-text">{lot.price}</span>
                                                    </td>
                                                    <td>
                                                        {lot.isSoldOut ? (
                                                            <span className="status-pill status-inactive">
                                                                <span className="status-dot"></span>
                                                                Sold Out
                                                            </span>
                                                        ) : (
                                                            <span className="status-pill status-active">
                                                                <span className="status-dot"></span>
                                                                {lot.available}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                        {selectedGravePlot && (
                                                            selectedGravePlot.lotId === lot.id ||
                                                            selectedGravePlot.graveType?.toLowerCase() === lot.name?.toLowerCase() ||
                                                            lot.name?.toLowerCase().includes(String(selectedGravePlot.graveType || "").toLowerCase()) ||
                                                            String(selectedGravePlot.graveType || "").toLowerCase().includes(lot.name?.toLowerCase())
                                                        ) ? (
                                                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                                                <span className="wake-space-selected-badge">
                                                                    {selectedGravePlot.plotCode}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="pos-btn-edit"
                                                                    onClick={() => {
                                                                        setSelectedGraveType(lot);
                                                                        setShowGraveLotsModal(true);
                                                                    }}
                                                                >
                                                                    Change
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="pos-btn-add"
                                                                disabled={lot.isSoldOut}
                                                                onClick={() => {
                                                                    setSelectedGraveType(lot);
                                                                    setShowGraveLotsModal(true);
                                                                }}
                                                            >
                                                                + Add
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ── Interment Section (Shown for the selected grave lot) ── */}
                        {needType === "pre-need" ? (
                            <div className="pos-card pos-card-dimmed">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <Heart className="pos-card-icon" size={17} />
                                        Interment Services
                                    </h3>
                                    <span className="um-kpi-pill gray">Not Applicable</span>
                                </div>
                                <div className="pos-interment-empty-box">
                                    <Info size={15} className="pos-empty-icon-subtle" />
                                    <span>Interment services are not applicable for Pre-Need purchases.</span>
                                </div>
                            </div>
                        ) : selectedGravePlot ? (
                            <div className="pos-card pos-interment-card">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <Heart className="pos-card-icon" size={17} />
                                        Interment Services
                                    </h3>
                                    <span className="pos-interment-badge">
                                        For {selectedGravePlot.graveType} ({selectedGravePlot.plotCode})
                                    </span>
                                </div>

                                <div className="table-wrapper pos-table-wrapper">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Service / Type</th>
                                                <th>Fee</th>
                                                <th style={{ textAlign: "right", paddingRight: "16px" }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {matchingIntermentFees.map((feeItem) => {
                                                const isSelected = selectedInterment && selectedInterment.id === feeItem.id;
                                                const feeCalc = calculateIntermentFeeController({
                                                    baseFee: feeItem.fee,
                                                    plotOrGraveType: selectedGravePlot,
                                                    intermentServiceOrType: feeItem.interment_type,
                                                    burialDate: effectiveBurialDate
                                                });
                                                return (
                                                    <tr key={feeItem.id} className={isSelected ? "pos-row-selected" : ""}>
                                                        <td>
                                                            <span className="pos-product-name">{feeItem.interment_type}</span>
                                                            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                                                                Applicable to {selectedGravePlot.plotCode} (Section {selectedGravePlot.section})
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                                <span className="pos-price-text">₱{feeCalc.finalFee.toLocaleString()}</span>
                                                                {feeCalc.isWeekendRateApplied && (
                                                                    <span style={{
                                                                        display: "inline-block",
                                                                        fontSize: "0.68rem",
                                                                        fontWeight: 700,
                                                                        color: "#b45309",
                                                                        background: "#fef3c7",
                                                                        border: "1px solid #fde68a",
                                                                        borderRadius: "4px",
                                                                        padding: "1px 6px",
                                                                        width: "fit-content"
                                                                    }}>
                                                                        +₱3,000 Weekend Rate
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                            {isSelected ? (
                                                                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                                                    <span className="wake-space-selected-badge">
                                                                        Selected
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        className="pos-btn-remove"
                                                                        onClick={() => setSelectedInterment(null)}
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="pos-btn-add"
                                                                    onClick={() => {
                                                                        setSelectedInterment({
                                                                            id: feeItem.id,
                                                                            type: feeItem.interment_type,
                                                                            baseFee: Number(feeItem.fee),
                                                                            fee: feeCalc.finalFee,
                                                                            plotCode: selectedGravePlot.plotCode,
                                                                            graveType: selectedGravePlot.graveType
                                                                        });
                                                                    }}
                                                                >
                                                                    + Add
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="pos-info-footnote" style={{ marginTop: "12px" }}>
                                    <Info size={13} />
                                    <span>
                                        {selectedInterment
                                            ? `Added ${selectedInterment.type} (₱${intermentFee.toLocaleString()}) to transaction.${intermentCalculation.isWeekendRateApplied ? " (Includes +₱3,000 Weekend Rate)" : ""}`
                                            : `Select an interment service for ${selectedGravePlot.plotCode}.`}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="pos-card pos-card-dimmed">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <Heart className="pos-card-icon" size={17} />
                                        Interment Services
                                    </h3>
                                    <span className="um-kpi-pill gray">Requires Grave Lot</span>
                                </div>
                                <div className="pos-interment-empty-box">
                                    <Info size={15} className="pos-empty-icon-subtle" />
                                    <span>Select a grave lot above to configure and add available interment services.</span>
                                </div>
                            </div>
                        )}

                        {/* Wake Space (Optional) Card */}
                        {needType === "pre-need" ? (
                            <div className="pos-card pos-card-dimmed">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <Bed className="pos-card-icon" size={17} />
                                        Wake Space
                                    </h3>
                                    <span className="um-kpi-pill gray">Not Applicable</span>
                                </div>
                                <div className="pos-interment-empty-box">
                                    <Info size={15} className="pos-empty-icon-subtle" />
                                    <span>Wake space rental is not applicable for Pre-Need purchases.</span>
                                </div>
                            </div>
                        ) : (
                            <div className="pos-card">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <Bed className="pos-card-icon" size={17} />
                                        Wake Space Facilities
                                    </h3>
                                    <span className="badge-count">
                                        {wakeSpaces.length} Spaces
                                    </span>
                                </div>

                                <div className="table-wrapper pos-table-wrapper">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Facility</th>
                                                <th>Rate</th>
                                                <th>Availability</th>
                                                <th style={{ textAlign: "right", paddingRight: "16px" }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {wakeSpaces.map((ws) => {
                                                const isSelected =
                                                    wakeSpaceItem &&
                                                    (wakeSpaceItem.spaceId === ws.id || wakeSpaceItem.wake === ws.wake);
                                                const isInactive = ws.status === "inactive";
                                                const avail = getSpaceAvailability(ws);

                                                return (
                                                    <tr key={ws.id} className={isSelected ? "pos-row-selected" : ""}>
                                                        <td>
                                                            <span className="pos-product-name">Wake Space {ws.wake}</span>
                                                            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                                                                ID: {ws.id}
                                                            </div>
                                                            {isSelected && (
                                                                <div className="wake-space-dates-sub" style={{ marginTop: "4px" }}>
                                                                    <div>StartDate: {wakeSpaceItem.startDate}</div>
                                                                    <div>EndDate: {wakeSpaceItem.endDate}</div>
                                                                    <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: "normal", marginTop: "1px" }}>
                                                                        Duration: {wakeSpaceItem.days} night{wakeSpaceItem.days > 1 ? "s" : ""}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className="pos-price-text">
                                                                ₱{Number(ws.price || 8500).toLocaleString()}
                                                            </span>
                                                            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                                                per night
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {isInactive ? (
                                                                <span className="status-pill status-inactive">
                                                                    <span className="status-dot"></span>
                                                                    Inactive
                                                                </span>
                                                            ) : avail.isOccupiedToday ? (
                                                                <span
                                                                    className="status-pill status-pending"
                                                                    title={`Occupied today. Next vacant: ${avail.nextVacantFormatted}`}
                                                                >
                                                                    <span className="status-dot"></span>
                                                                    Next: {avail.nextVacantFormatted}
                                                                </span>
                                                            ) : (
                                                                <span className="status-pill status-active">
                                                                    <span className="status-dot"></span>
                                                                    Available
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                            {isSelected ? (
                                                                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                                                    <button
                                                                        type="button"
                                                                        className="pos-btn-edit"
                                                                        onClick={() => handleOpenWakeModal(ws)}
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="pos-btn-remove"
                                                                        onClick={() => setWakeSpaceItem(null)}
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="pos-btn-add"
                                                                    disabled={isInactive}
                                                                    onClick={() => handleOpenWakeModal(ws)}
                                                                >
                                                                    + Book
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Cart Card */}
                        <div className="pos-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <ShoppingCart className="pos-card-icon" size={17} />
                                    Cart
                                </h3>
                                <span className="badge-count">
                                    {cartCount} Item{cartCount === 1 ? "" : "s"}
                                </span>
                            </div>

                            <div className="table-wrapper pos-table-wrapper">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Qty</th>
                                            <th>Total</th>
                                            <th style={{ textAlign: "right", paddingRight: "16px" }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Selected Grave Plot Row */}
                                        {selectedGravePlot && (
                                            <tr>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: "#0f172a" }}>
                                                        {selectedGravePlot.graveType} ({selectedGravePlot.plotCode})
                                                    </div>
                                                    <div style={{ fontSize: "0.775rem", color: "#64748b", marginTop: "3px" }}>
                                                        Section: {selectedGravePlot.section}
                                                    </div>
                                                </td>
                                                <td>1</td>
                                                <td style={{ fontWeight: 600, color: "#059669" }}>
                                                    ₱{selectedGravePlot.price.toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                    <button
                                                        type="button"
                                                        className="pos-cart-remove-btn"
                                                        onClick={() => {
                                                            setSelectedGravePlot(null);
                                                            setSelectedInterment(null);
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        )}

                                        {/* Selected Interment Row */}
                                        {selectedInterment && (
                                            <tr>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: "#0f172a" }}>
                                                        Interment: {selectedInterment.type}
                                                    </div>
                                                    <div style={{ fontSize: "0.775rem", color: "#64748b", marginTop: "3px" }}>
                                                        For {selectedGravePlot?.graveType} ({selectedGravePlot?.plotCode})
                                                    </div>
                                                </td>
                                                <td>1</td>
                                                <td style={{ fontWeight: 600, color: "#059669" }}>
                                                    ₱{selectedInterment.fee.toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                    <button
                                                        type="button"
                                                        className="pos-cart-remove-btn"
                                                        onClick={() => setSelectedInterment(null)}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        )}

                                        {/* Wake Space Item Row */}
                                        {wakeSpaceItem && (
                                            <tr>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: "#0f172a" }}>
                                                        {wakeSpaceItem.spaceName || `Wake Space ${wakeSpaceItem.wake || "A"}`}
                                                        <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400, marginLeft: "6px" }}>
                                                            ({wakeSpaceItem.spaceId || "WAS-001"})
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: "0.775rem", color: "#64748b", marginTop: "3px", lineHeight: "1.4" }}>
                                                        <div style={{ fontWeight: 600, color: "#2563eb" }}>StartDate: {wakeSpaceItem.startDate}</div>
                                                        <div style={{ fontWeight: 600, color: "#2563eb" }}>EndDate: {wakeSpaceItem.endDate}</div>
                                                        <div>Duration: {wakeSpaceItem.days} night{wakeSpaceItem.days > 1 ? "s" : ""} @ ₱{Number(wakeSpaceItem.pricePerNight || 8500).toLocaleString()}/night</div>
                                                    </div>
                                                </td>
                                                <td>1</td>
                                                <td style={{ fontWeight: 600, color: "#059669" }}>
                                                    ₱{Number(wakeSpaceItem.totalPrice || 0).toLocaleString()}
                                                </td>
                                                <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                    <button
                                                        type="button"
                                                        className="pos-cart-remove-btn"
                                                        onClick={() => setWakeSpaceItem(null)}
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        )}

                                        {/* Empty Cart State */}
                                        {!selectedGravePlot && !selectedInterment && !wakeSpaceItem && (
                                            <tr>
                                                <td colSpan={4}>
                                                    <div className="pos-cart-empty">
                                                        <ShoppingCart size={26} className="pos-empty-icon" />
                                                        <p>No items added yet</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT COLUMN ── */}
                    <div className="pos-column">
                        {/* Burial Need Type Card */}
                        <div className="pos-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <Clock className="pos-card-icon" size={17} />
                                    Burial Need Type
                                </h3>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                <div className="pos-form-group">
                                    <div className="pos-radio-group" style={{ marginTop: "2px" }}>
                                        <label className="pos-radio-label">
                                            <input
                                                type="radio"
                                                name="burialNeed"
                                                value="actual"
                                                checked={needType === "actual"}
                                                onChange={() => setNeedType("actual")}
                                            />
                                            <span>
                                                Actual Burial <span className="pos-badge-subtext">(Ililibing na)</span>
                                            </span>
                                        </label>
                                        <label className="pos-radio-label">
                                            <input
                                                type="radio"
                                                name="burialNeed"
                                                value="pre-need"
                                                checked={needType === "pre-need"}
                                                onChange={() => {
                                                    setNeedType("pre-need");
                                                    setSelectedInterment(null);
                                                    setWakeSpaceItem(null);
                                                    setRelationship("");
                                                }}
                                            />
                                            <span>
                                                Pre-Need <span className="pos-badge-subtext">(Advance Purchase)</span>
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                {/* Burial Date: only shown if client picks actual */}
                                {needType === "actual" && (
                                    <div className="pos-form-group">
                                        <label className="pos-form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Calendar size={14} className="pos-form-icon" />
                                            Burial Date (for actual burial)
                                        </label>
                                        <input
                                            type="date"
                                            className="pos-input-control"
                                            value={burialDate}
                                            onChange={(e) => setBurialDate(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Client Information Form */}
                        <div className="pos-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <User className="pos-card-icon" size={17} />
                                    Client Information
                                </h3>
                                <span className="um-kpi-pill blue">New</span>
                            </div>

                            <div className="pos-form-grid-2">
                                <div className="pos-form-group">
                                    <label className="pos-form-label">First Name</label>
                                    <input
                                        type="text"
                                        className="pos-input-control"
                                        placeholder="Enter first name"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                </div>

                                <div className="pos-form-group">
                                    <label className="pos-form-label">Last Name</label>
                                    <input
                                        type="text"
                                        className="pos-input-control"
                                        placeholder="Enter last name"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                </div>

                                <div className="pos-form-group">
                                    <label className="pos-form-label">Contact Number</label>
                                    <input
                                        type="tel"
                                        className="pos-input-control"
                                        placeholder="09123456789"
                                        value={contactNumber}
                                        maxLength={11}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "");
                                            if (val.length <= 11) setContactNumber(val);
                                        }}
                                    />
                                </div>

                                <div className="pos-form-group">
                                    <label className="pos-form-label">Email Address</label>
                                    <input
                                        type="email"
                                        className="pos-input-control"
                                        placeholder="client@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>

                                <div className="pos-form-group pos-form-group-full">
                                    <label className="pos-form-label">Address</label>
                                    <input
                                        type="text"
                                        className="pos-input-control"
                                        placeholder="House / Unit No., Street, Barangay, City, Province"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </div>

                                {needType === "actual" && (
                                    <div className="pos-form-group pos-form-group-full">
                                        <label className="pos-form-label">Relationship to Deceased</label>
                                        <select
                                            className="pos-input-control"
                                            value={relationship}
                                            onChange={(e) => setRelationship(e.target.value)}
                                        >
                                            <option value="" disabled>Select relationship...</option>
                                            <option value="Spouse">Spouse</option>
                                            <option value="Child">Child</option>
                                            <option value="Parent">Parent</option>
                                            <option value="Sibling">Sibling</option>
                                            <option value="Relative">Relative</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                )}

                            </div>
                        </div>

                        {/* Deceased Information */}
                        {needType === "actual" ? (
                            <div className="pos-card">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <UserX className="pos-card-icon" size={17} />
                                        Deceased Information
                                    </h3>
                                </div>

                                <div className="pos-form-grid-2">
                                    <div className="pos-form-group">
                                        <label className="pos-form-label">First Name</label>
                                        <input
                                            type="text"
                                            className="pos-input-control"
                                            placeholder="Enter first name"
                                            value={deceasedFirstName}
                                            onChange={(e) => setDeceasedFirstName(e.target.value)}
                                        />
                                    </div>

                                    <div className="pos-form-group">
                                        <label className="pos-form-label">Last Name</label>
                                        <input
                                            type="text"
                                            className="pos-input-control"
                                            placeholder="Enter last name"
                                            value={deceasedLastName}
                                            onChange={(e) => setDeceasedLastName(e.target.value)}
                                        />
                                    </div>

                                    <div className="pos-form-group">
                                        <label className="pos-form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Calendar size={13} className="pos-form-icon" />
                                            Date of Birth
                                        </label>
                                        <input
                                            type="date"
                                            className="pos-input-control"
                                            value={deceasedDOB}
                                            onChange={(e) => setDeceasedDOB(e.target.value)}
                                        />
                                    </div>

                                    <div className="pos-form-group">
                                        <label className="pos-form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Calendar size={13} className="pos-form-icon" />
                                            Date of Death
                                        </label>
                                        <input
                                            type="date"
                                            className="pos-input-control"
                                            value={deceasedDOD}
                                            onChange={(e) => setDeceasedDOD(e.target.value)}
                                        />
                                    </div>

                                    <div className="pos-form-group pos-form-group-full">
                                        <label className="pos-form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <Calendar size={13} className="pos-form-icon" />
                                            Date Buried
                                        </label>
                                        <input
                                            type="date"
                                            className="pos-input-control"
                                            value={deceasedDateBuried}
                                            onChange={(e) => {
                                                setDeceasedDateBuried(e.target.value);
                                                setBurialDate(e.target.value);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="pos-card pos-card-dimmed">
                                <div className="pos-card-header">
                                    <h3 className="pos-card-title">
                                        <UserX className="pos-card-icon" size={17} />
                                        Deceased Information
                                    </h3>
                                    <span className="um-kpi-pill gray">Not Applicable</span>
                                </div>
                                <div className="pos-interment-empty-box">
                                    <Info size={15} className="pos-empty-icon-subtle" />
                                    <span>Deceased information is not required for Pre-Need purchases.</span>
                                </div>
                            </div>
                        )}

                        {/* Document Requirements */}
                        <div className="pos-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <FileText className="pos-card-icon" size={17} />
                                    Document Requirements
                                </h3>
                                <span className="pos-badge-subtext">(Check when complete)</span>
                            </div>

                            <div className="pos-doc-grid">
                                {documents.map((doc) => (
                                    <label key={doc.id} className="pos-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={doc.checked}
                                            onChange={() => toggleDocument(doc.id)}
                                        />
                                        <span>
                                            {doc.name}{doc.required && <span className="pos-required-star"> *</span>}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            <div className="pos-doc-counter">
                                {completedDocsCount} of {documents.length} completed
                            </div>
                        </div>

                        {/* Discount & Payment Plan */}
                        <div className="pos-card">
                            <div className="pos-form-grid-2">
                                <div className="pos-form-group">
                                    <label className="pos-form-label">Discount Type</label>
                                    <select
                                        className="pos-input-control"
                                        value={discountType}
                                        onChange={(e) => setDiscountType(e.target.value)}
                                    >
                                        <option value="None">None</option>
                                        <option value="Senior">Senior Citizen (20%)</option>
                                        <option value="PWD">PWD (20%)</option>
                                    </select>
                                </div>

                                <div className="pos-form-group">
                                    <label className="pos-form-label">Payment Plan</label>
                                    <select
                                        className="pos-input-control"
                                        value={paymentPlan}
                                        onChange={(e) => setPaymentPlan(e.target.value)}
                                        disabled={!selectedGravePlot || !isLotInstallmentEligible}
                                    >
                                        <option value="On the Spot Cash">On the Spot Cash</option>
                                        {isLotInstallmentEligible && (
                                            <option value={`Installment (${lotInstallmentDuration} Months)`}>
                                                Installment ({lotInstallmentDuration} Months)
                                            </option>
                                        )}
                                    </select>
                                    {selectedGravePlot ? (
                                        !isLotInstallmentEligible && (
                                            <div style={{ fontSize: "0.725rem", color: "#64748b", marginTop: "4px" }}>
                                                On the spot cash only (installment not available)
                                            </div>
                                        )
                                    ) : (
                                        <div style={{ fontSize: "0.725rem", color: "#94a3b8", marginTop: "4px" }}>
                                            Select a grave lot to view payment plans
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Payment Summary Card */}
                        <div className="pos-card pos-summary-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <Receipt className="pos-card-icon" size={17} />
                                    Payment Summary
                                </h3>
                            </div>

                            <div className="pos-summary-rows">
                                {gravePrice > 0 && (
                                    <div className="pos-summary-row">
                                        <span>Grave Lot {selectedGravePlot?.plotNumber ? `(${selectedGravePlot.plotNumber})` : ""}</span>
                                        <span className="summary-val">₱{gravePrice.toLocaleString()}</span>
                                    </div>
                                )}
                                {intermentFee > 0 && (
                                    <div className="pos-summary-row">
                                        <span>
                                            Interment Fee
                                            {intermentCalculation.isWeekendRateApplied && (
                                                <span style={{ fontSize: "0.72rem", color: "#b45309", marginLeft: "6px", fontWeight: 700 }}>
                                                    (+₱3k Weekend)
                                                </span>
                                            )}
                                        </span>
                                        <span className="summary-val purple">
                                            ₱{intermentFee.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {intermentCalculation.isWeekendRateApplied && (
                                    <div style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: "0.725rem",
                                        color: "#b45309",
                                        padding: "0 0 4px 10px",
                                        marginTop: "-6px"
                                    }}>
                                        <span>↳ Weekend Surcharge ({selectedGravePlot?.graveType || "Lot"})</span>
                                        <span style={{ fontWeight: 700 }}>+₱3,000</span>
                                    </div>
                                )}
                                {wakePrice > 0 && (
                                    <div className="pos-summary-row">
                                        <span>Wake Space</span>
                                        <span className="summary-val blue">
                                            ₱{wakePrice.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {discountAmount > 0 && (
                                    <div className="pos-summary-row">
                                        <span>Discount (20%)</span>
                                        <span className="summary-val green">
                                            -₱{discountAmount.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {isInstallment && (
                                    <>
                                        <div className="pos-summary-row">
                                            <span>Downpayment</span>
                                            <span className="summary-val orange" style={{ fontWeight: 700 }}>
                                                ₱{dpRequired.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="pos-summary-row">
                                            <span>Installment</span>
                                            <span className="summary-val blue" style={{ fontWeight: 700 }}>
                                                ₱{monthlyStaggered.toLocaleString()}/mo ({installmentMonths} mos)
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="pos-summary-divider"></div>

                            <div className="pos-total-row">
                                <span className="pos-total-label">Total Cash</span>
                                <span className="pos-total-amount">
                                    ₱{totalCash.toLocaleString()}
                                </span>
                            </div>

                            {/* Total Cash Breakdown */}
                            {isInstallment && (
                                <div style={{
                                    margin: '6px 0 10px 0',
                                    padding: '8px 10px',
                                    backgroundColor: '#f8fafc',
                                    borderRadius: '6px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                        <span>• Downpayment</span>
                                        <strong style={{ color: '#d97706' }}>₱{dpRequired.toLocaleString()}</strong>
                                    </div>
                                    {intermentFee > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                            <span>• Services (Interment)</span>
                                            <strong style={{ color: '#7c3aed' }}>₱{intermentFee.toLocaleString()}</strong>
                                        </div>
                                    )}
                                    {wakePrice > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                            <span>• Services (Wake Space)</span>
                                            <strong style={{ color: '#2563eb' }}>₱{wakePrice.toLocaleString()}</strong>
                                        </div>
                                    )}
                                    {discountAmount > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                                            <span>• Discount</span>
                                            <strong>-₱{discountAmount.toLocaleString()}</strong>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Next Due Date for Installment (1 Month in Advance) */}
                            {isInstallment && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 10px',
                                    backgroundColor: '#eff6ff',
                                    borderRadius: '6px',
                                    border: '1px solid #bfdbfe',
                                    marginBottom: '8px',
                                    fontSize: '0.75rem'
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 600, color: '#1e40af', display: 'block' }}>Next Due Date</span>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>1st Monthly Due</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <strong style={{ color: '#1d4ed8', fontSize: '0.8rem', display: 'block' }}>{nextDueDate}</strong>
                                        <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600 }}>₱{monthlyStaggered.toLocaleString()}/mo</span>
                                    </div>
                                </div>
                            )}

                            {isInstallment && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '2px', marginBottom: '8px' }}>
                                    <span>Total Contract Price:</span>
                                    <strong>₱{totalDue.toLocaleString()}</strong>
                                </div>
                            )}

                            <div className="pos-tendered-group">
                                <label className="pos-form-label">Amount Tendered (Cash)</label>
                                <input
                                    type="text"
                                    className="pos-input-control"
                                    placeholder="0.00"
                                    value={amountTendered}
                                    onChange={(e) => setAmountTendered(e.target.value)}
                                />
                            </div>

                            <div className="pos-tendered-group">
                                <label className="pos-form-label">Change</label>
                                <div className="pos-change-display">
                                    ₱{changeAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            {paymentFeedback && (
                                <div
                                    style={{
                                        fontSize: "0.8rem",
                                        fontWeight: 600,
                                        padding: "8px 12px",
                                        borderRadius: "6px",
                                        marginBottom: "8px",
                                        backgroundColor: paymentFeedback.includes("successfully") ? "#ecfdf5" : "#fef2f2",
                                        color: paymentFeedback.includes("successfully") ? "#059669" : "#dc2626",
                                        border: `1px solid ${paymentFeedback.includes("successfully") ? "#a7f3d0" : "#fecaca"}`
                                    }}
                                >
                                    {paymentFeedback}
                                </div>
                            )}

                            <button
                                type="button"
                                className="pos-btn-process"
                                disabled={processingPayment}
                                onClick={async () => {
                                    const hasItemsInCart = selectedGravePlot || selectedInterment || wakeSpaceItem;
                                    if (!hasItemsInCart) {
                                        setPaymentFeedback("Please add an item to the cart first.");
                                        setTimeout(() => setPaymentFeedback(""), 3500);
                                        return;
                                    }

                                    setProcessingPayment(true);
                                    setPaymentFeedback("");

                                    try {
                                        const clientFullName = `${firstName} ${lastName}`.trim() || "Walk-in Client";

                                        // ── Checked documents list ──
                                        const checkedDocs = documents
                                            .filter((d) => d.checked)
                                            .map((d) => d.name);

                                        // ── Build the full transaction payload ──
                                        await processPOSController({
                                            clientData: {
                                                firstName,
                                                lastName,
                                                email,
                                                contactNumber,
                                                address,
                                                relationship: needType === "actual" ? relationship : "",
                                            },
                                            burialData: {
                                                deceasedFirstName,
                                                deceasedLastName,
                                                deceasedDOB,
                                                deceasedDOD,
                                                deceasedDateBuried,
                                                intermentType: selectedInterment?.type ?? "",
                                                intermentFee: intermentFee,
                                                weekendSurcharge: intermentCalculation.weekendSurcharge,
                                                documents: checkedDocs,
                                            },
                                            plotId: selectedGravePlot?.id ?? "",
                                            needType,
                                            paymentData: {
                                                total: totalDue,
                                                totalCash,
                                                amountTendered: amountTendered !== "" ? Number(amountTendered) : null,
                                                balance: isInstallment ? remainingLotBalance : 0,
                                                paymentStatus: isInstallment ? "partial" : "paid",
                                            },
                                            historyData: {
                                                receipt: generateReceiptNumber(),
                                                amount: totalCash,
                                                paymentDate: burialDate || getSystemDateISO(),
                                            },
                                        });

                                        // ── Wake space booking (only created after transaction validates & succeeds) ──
                                        if (wakeSpaceItem) {
                                            await createWakeSpaceBookingController({
                                                spaceId: wakeSpaceItem.spaceId || "WAS-001",
                                                spaceName: wakeSpaceItem.spaceName || `Wake Space ${wakeSpaceItem.wake || "A"}`,
                                                wake: wakeSpaceItem.wake || "A",
                                                startDate: wakeSpaceItem.startDate,
                                                endDate: wakeSpaceItem.endDate,
                                                days: wakeSpaceItem.days,
                                                totalPrice: wakeSpaceItem.totalPrice,
                                                client: clientFullName,
                                                deceased: `${deceasedFirstName} ${deceasedLastName}`.trim(),
                                            });
                                        }

                                        // ── Reset form on success ──
                                        handleResetForm();
                                        setPaymentFeedback("Transaction recorded successfully!");
                                        setTimeout(() => setPaymentFeedback(""), 4500);

                                    } catch (err) {
                                        console.error("Failed to process transaction:", err);
                                        setPaymentFeedback(err.message || "Error processing transaction. Please try again.");
                                    } finally {
                                        setProcessingPayment(false);
                                    }
                                }}
                            >
                                <CheckCircle size={18} />
                                <span>{processingPayment ? "Processing…" : "Process Payment"}</span>
                            </button>

                            <div className="pos-footer-note">
                                <Info size={13} />
                                <span>Cash only. Receipt will be generated.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Wake Space Booking Modal */}
            <WakeSpaceModal
                isOpen={showWakeModal}
                onClose={() => {
                    setShowWakeModal(false);
                    setSelectedWakeSpaceForModal(null);
                }}
                space={selectedWakeSpaceForModal}
                wakeSpaces={wakeSpaces}
                onSave={(data) => {
                    setWakeSpaceItem(data);
                    setShowWakeModal(false);
                }}
                initialStartDate={
                    wakeSpaceItem && (wakeSpaceItem.spaceId === selectedWakeSpaceForModal?.id || wakeSpaceItem.wake === selectedWakeSpaceForModal?.wake)
                        ? new Date(wakeSpaceItem.startDate.replace(/-/g, "/"))
                        : null
                }
                initialDays={
                    wakeSpaceItem && (wakeSpaceItem.spaceId === selectedWakeSpaceForModal?.id || wakeSpaceItem.wake === selectedWakeSpaceForModal?.wake)
                        ? wakeSpaceItem.days
                        : 1
                }
                bookings={wakeBookings}
                confirmText="Add to Order"
            />

            {/* Grave Lots Map Modal */}
            <GraveLotsModal
                isOpen={showGraveLotsModal}
                onClose={() => {
                    setShowGraveLotsModal(false);
                    setSelectedGraveType(null);
                }}
                plots={plots}
                selectedGraveType={selectedGraveType}
                graveTypes={displayedGraveLots}
                selectedPlotId={selectedGravePlot?.id}
                onSelectPlot={handlePlotSelected}
            />
        </div>
    );
}

export default PointOfSale;
