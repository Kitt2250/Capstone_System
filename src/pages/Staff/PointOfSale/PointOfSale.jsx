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
    Heart
} from "lucide-react";
import "./PointOfSale.css";
import WakeSpaceModal from "../../../components/WakeSpaceModal/WakeSpaceModal.jsx";
import GraveLotsModal from "../../../components/GraveLotsModal/GraveLotsModal.jsx";
import {
    createWakeSpaceBooking,
    subscribeWakeSpaceBookings
} from "../../../services/wakeSpaceServices.jsx";

function PointOfSale() {
    // Dynamic Firestore data states for Grave Lots and Plot Availability
    const [rawGraveTypes, setRawGraveTypes] = useState([]);
    const [rawIntermentFees, setRawIntermentFees] = useState([]);
    const [plots, setPlots] = useState([]);
    const [loadingGraveLots, setLoadingGraveLots] = useState(true);

    // Interment staged selection state (linked to selected grave lot)
    const [selectedInterment, setSelectedInterment] = useState(null);

    // WakeSpace staged reservation state (not recorded until Process Payment)
    const [wakeSpaceItem, setWakeSpaceItem] = useState(null);
    const [showWakeModal, setShowWakeModal] = useState(false);
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

    // Static UI state without business logic (as requested: "dont add function yet")
    const [needType, setNeedType] = useState("actual");
    const [discountType, setDiscountType] = useState("None");
    const [paymentPlan, setPaymentPlan] = useState("Full Payment (On the Spot)");
    const [burialDate, setBurialDate] = useState("2026-09-23");
    const [amountTendered, setAmountTendered] = useState("");

    // Document checklist UI state
    const [documents, setDocuments] = useState([
        { id: 1, name: "Death Certificate", checked: false },
        { id: 2, name: "Burial/Transfer of Cadaver Permit", checked: false },
        { id: 3, name: "Transfer Permit for Bone Transfer", checked: false },
        { id: 4, name: "Certificate of Ownership (lot owners)", checked: false },
        { id: 5, name: "Valid ID of Payor", checked: false },
        { id: 6, name: "Signed Purchase Agreement", checked: false }
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

        return () => {
            isMounted = false;
            if (unsubTypes) unsubTypes();
            if (unsubInterment) unsubInterment();
            if (unsubPlots) unsubPlots();
            if (unsubWake) unsubWake();
        };
    }, []);

    // Determine the next available/vacant start date for Wake Space
    const getNextVacantStartDate = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const formatDateISO = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        };

        const activeBookings = (wakeBookings || []).filter(
            (b) => b.startDate && b.endDate && b.status !== "cancelled" && b.status !== "completed"
        );

        let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        for (let i = 0; i < 365; i++) {
            const checkStr = formatDateISO(checkDate);
            const isBooked = activeBookings.some(
                (b) => checkStr >= b.startDate && checkStr <= b.endDate
            );

            if (!isBooked) {
                return checkDate;
            }

            checkDate.setDate(checkDate.getDate() + 1);
        }

        return today;
    };

    const vacantStartDate = getNextVacantStartDate();
    const formattedVacantStartDate = vacantStartDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });

    const handlePlotSelected = (plot) => {
        if (!plot) return;

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
            rawPlot: plot
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
            isSoldOut: availableCount === 0
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
        setBurialDate("2026-09-23");
        setAmountTendered("");
        setPaymentFeedback("");
        setDocuments((prev) => prev.map((d) => ({ ...d, checked: false })));
    };

    // Total price calculations
    const gravePrice = selectedGravePlot ? Number(selectedGravePlot.price || 0) : 0;
    const intermentFee = selectedInterment ? Number(selectedInterment.fee || 0) : 0;
    const wakePrice = wakeSpaceItem ? Number(wakeSpaceItem.totalPrice || 0) : 0;

    const subtotal = gravePrice + intermentFee + wakePrice;

    const isDiscountEligible = discountType === "Senior" || discountType === "PWD";
    const discountAmount = isDiscountEligible ? Math.round(subtotal * 0.2) : 0;

    const totalDue = Math.max(0, subtotal - discountAmount);

    const isInstallment = paymentPlan.includes("Installment");
    const dpRequired = isInstallment ? Math.round(totalDue * 0.5) : 0;

    const installmentMonths = paymentPlan.includes("6 Months") ? 6 : paymentPlan.includes("12 Months") ? 12 : 0;
    const monthlyStaggered = installmentMonths > 0 ? Math.round((totalDue - dpRequired) / installmentMonths) : 0;

    const tenderedNum = parseFloat(amountTendered) || 0;
    const changeAmount = amountTendered !== "" && !isNaN(tenderedNum) && tenderedNum >= totalDue
        ? tenderedNum - totalDue
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
                        {selectedGravePlot ? (
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
                                                return (
                                                    <tr key={feeItem.id} className={isSelected ? "pos-row-selected" : ""}>
                                                        <td>
                                                            <span className="pos-product-name">{feeItem.interment_type}</span>
                                                            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                                                                Applicable to {selectedGravePlot.plotCode} (Section {selectedGravePlot.section})
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className="pos-price-text">₱{Number(feeItem.fee).toLocaleString()}</span>
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
                                                                            fee: Number(feeItem.fee),
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
                                            ? `Added ${selectedInterment.type} (₱${selectedInterment.fee.toLocaleString()}) to transaction.`
                                            : `Select an interment service for ${selectedGravePlot.plotCode} (optional).`}
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
                        <div className="pos-card">
                            <div className="pos-card-header">
                                <h3 className="pos-card-title">
                                    <Bed className="pos-card-icon" size={17} />
                                    Wake Space (Optional)
                                </h3>
                                <span className="um-kpi-pill blue">Optional</span>
                            </div>

                            <div className="wake-space-box">
                                <div className="wake-space-info">
                                    <div>
                                        <div className="wake-space-title">
                                            Wake Space Rental
                                            {wakeSpaceItem ? ` (${wakeSpaceItem.days} night${wakeSpaceItem.days > 1 ? "s" : ""})` : ""}
                                        </div>
                                        {wakeSpaceItem ? (
                                            <div className="wake-space-dates-sub">
                                                <div>Start: {wakeSpaceItem.startDate}</div>
                                                <div>End: {wakeSpaceItem.endDate}</div>
                                            </div>
                                        ) : null}
                                        <div className="wake-space-price">
                                            {wakeSpaceItem
                                                ? `₱${wakeSpaceItem.totalPrice.toLocaleString()}`
                                                : "₱1,500 / night"}
                                        </div>
                                    </div>
                                </div>

                                <div className="wake-space-action">
                                    {wakeSpaceItem ? (
                                        <>
                                            <span className="wake-space-selected-badge">
                                                Selected
                                            </span>
                                            <button
                                                type="button"
                                                className="pos-btn-edit"
                                                onClick={() => setShowWakeModal(true)}
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
                                        </>
                                    ) : (
                                        <>
                                            <span className="status-pill status-active">
                                                <span className="status-dot"></span>
                                                {formattedVacantStartDate}
                                            </span>
                                            <button
                                                type="button"
                                                className="pos-btn-book"
                                                onClick={() => setShowWakeModal(true)}
                                            >
                                                Book
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="pos-info-footnote">
                                <Info size={13} />
                                <span>
                                    {wakeSpaceItem
                                        ? "Wake space staged in cart. Will be saved to records upon payment."
                                        : 'Click "Book" to select check-in/out dates'}
                                </span>
                            </div>
                        </div>

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
                                                        Wake Space Rental
                                                    </div>
                                                    <div style={{ fontSize: "0.775rem", color: "#64748b", marginTop: "3px", lineHeight: "1.4" }}>
                                                        <div>Start: {wakeSpaceItem.startDate}</div>
                                                        <div>End: {wakeSpaceItem.endDate}</div>
                                                        <div>Nights: {wakeSpaceItem.days}</div>
                                                    </div>
                                                </td>
                                                <td>1</td>
                                                <td style={{ fontWeight: 600, color: "#059669" }}>
                                                    ₱{wakeSpaceItem.totalPrice.toLocaleString()}
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
                                        type="text"
                                        className="pos-input-control"
                                        placeholder="0917-123-4567"
                                        value={contactNumber}
                                        onChange={(e) => setContactNumber(e.target.value)}
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
                            </div>
                        </div>

                        {/* Burial Need Type & Date */}
                        <div className="pos-card">
                            <div className="pos-need-type-wrapper">
                                <div className="pos-radio-group">
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
                                            onChange={() => setNeedType("pre-need")}
                                        />
                                        <span>
                                            Pre-Need <span className="pos-badge-subtext">(Advance Purchase)</span>
                                        </span>
                                    </label>
                                </div>

                                <div className="pos-pre-need-note">
                                    <Info size={13} />
                                    <span>Heroes Buried only available for Pre-Need</span>
                                </div>
                            </div>

                            <div className="pos-form-group" style={{ marginTop: "16px" }}>
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

                            <div className="pos-info-alert">
                                <Info size={15} />
                                <span>Add items to cart to see payment eligibility</span>
                            </div>
                        </div>

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
                                            {doc.name} <span className="pos-required-star">*</span>
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
                                    >
                                        <option value="Full Payment (On the Spot)">Full Payment (On the Spot)</option>
                                        <option value="Installment (6 Months)">Installment (6 Months)</option>
                                        <option value="Installment (12 Months)">Installment (12 Months)</option>
                                    </select>
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
                                <div className="pos-summary-row">
                                    <span>Subtotal</span>
                                    <span className="summary-val">₱{subtotal.toLocaleString()}</span>
                                </div>
                                <div className="pos-summary-row">
                                    <span>Interment Fee</span>
                                    <span className="summary-val purple">
                                        {intermentFee > 0 ? `₱${intermentFee.toLocaleString()}` : "₱0.00"}
                                    </span>
                                </div>
                                <div className="pos-summary-row">
                                    <span>Wake Space</span>
                                    <span className="summary-val blue">
                                        {wakePrice > 0 ? `₱${wakePrice.toLocaleString()}` : "₱0.00"}
                                    </span>
                                </div>
                                <div className="pos-summary-row">
                                    <span>Discount (20%)</span>
                                    <span className="summary-val green">
                                        {discountAmount > 0 ? `-₱${discountAmount.toLocaleString()}` : "₱0.00"}
                                    </span>
                                </div>
                                <div className="pos-summary-row">
                                    <span>DP Required</span>
                                    <span className="summary-val orange">
                                        {dpRequired > 0 ? `₱${dpRequired.toLocaleString()}` : "₱0.00"}
                                    </span>
                                </div>
                                <div className="pos-summary-row">
                                    <span>Monthly (if staggered)</span>
                                    <span className="summary-val blue">
                                        {monthlyStaggered > 0 ? `₱${monthlyStaggered.toLocaleString()}` : "₱0.00"}
                                    </span>
                                </div>
                            </div>

                            <div className="pos-summary-divider"></div>

                            <div className="pos-total-row">
                                <span className="pos-total-label">Total Due</span>
                                <span className="pos-total-amount">
                                    ₱{totalDue.toLocaleString()}
                                </span>
                            </div>

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
                                        backgroundColor: paymentFeedback.startsWith("✓") ? "#ecfdf5" : "#fef2f2",
                                        color: paymentFeedback.startsWith("✓") ? "#059669" : "#dc2626",
                                        border: `1px solid ${paymentFeedback.startsWith("✓") ? "#a7f3d0" : "#fecaca"}`
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
                                        if (wakeSpaceItem) {
                                            await createWakeSpaceBooking({
                                                startDate: wakeSpaceItem.startDate,
                                                endDate: wakeSpaceItem.endDate,
                                                days: wakeSpaceItem.days,
                                                totalPrice: wakeSpaceItem.totalPrice,
                                                status: "pending",
                                                client: clientFullName,
                                            });
                                        }

                                        setSelectedGravePlot(null);
                                        setSelectedInterment(null);
                                        setWakeSpaceItem(null);
                                        setFirstName("");
                                        setLastName("");
                                        setAddress("");
                                        setContactNumber("");
                                        setEmail("");
                                        setRelationship("");
                                        setAmountTendered("");
                                        setPaymentFeedback("✓ Payment processed and transaction recorded successfully!");
                                        setTimeout(() => setPaymentFeedback(""), 4500);
                                    } catch (err) {
                                        console.error("Failed to process transaction:", err);
                                        setPaymentFeedback("Error processing transaction. Please try again.");
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
                onClose={() => setShowWakeModal(false)}
                onSave={(data) => {
                    setWakeSpaceItem(data);
                    setShowWakeModal(false);
                }}
                initialStartDate={
                    wakeSpaceItem
                        ? new Date(wakeSpaceItem.startDate.replace(/-/g, "/"))
                        : vacantStartDate
                }
                initialDays={wakeSpaceItem ? wakeSpaceItem.days : 1}
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
