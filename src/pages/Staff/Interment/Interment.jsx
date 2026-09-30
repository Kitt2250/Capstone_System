import React, { useState, useEffect, useMemo } from "react";
import Header from "../../../components/Header/Header";
import {
    UserX,
    Calendar,
    FileText,
    Bed,
    Receipt,
    CheckCircle,
    RotateCcw,
    Landmark,
    ShieldCheck,
    Info,
    Cross,
    Tag
} from "lucide-react";
import "./Interment.css";
import WakeSpaceModal from "../../../components/WakeSpaceModal/WakeSpaceModal.jsx";
import OwnedPlotsModal from "../../../components/OwnedPlotsModal/OwnedPlotsModal.jsx";
import IntermentReceiptModal from "../../../components/IntermentReceiptModal/IntermentReceiptModal.jsx";
import { subscribeIntermentFees } from "../../../services/graveServices";
import { subscribePlots } from "../../../services/plotServices";
import {
    subscribeWakeSpaceBookings,
    subscribeWakeSpaces
} from "../../../services/wakeSpaceServices.jsx";
import { createWakeSpaceBookingController } from "../../../controller/wakeSpaceController.jsx";
import { processIntermentBookingController, calculateIntermentFeeController } from "../../../controller/intermentController.jsx";
import { generateReceiptNumber } from "../../../services/paymentServices.jsx";
import { getSystemDate, getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";

const DEFAULT_WAKE_SPACES = [
    { id: "WAS-001", wake: "A", price: 8500, status: "active" },
    { id: "WAS-002", wake: "B", price: 8500, status: "active" },
    { id: "WAS-003", wake: "C", price: 8500, status: "active" },
];

const DEFAULT_INTERMENT_SERVICES = [
    {
        id: "INT-STD",
        interment_type: "Standard Burial / Interment",
        fee: 15000,
        description: "Full ground burial service with committal & grave preparation on owned plot"
    },
    {
        id: "INT-BONE",
        interment_type: "Bone Transfer / Relocation",
        fee: 10000,
        description: "Transfer & interment of skeletal remains into owned family grave lot"
    },
    {
        id: "INT-CREM",
        interment_type: "Cremation Vault Burial",
        fee: 8000,
        description: "Inurnment ceremony and placement into owned cremation vault"
    }
];

const DEFAULT_DOCUMENTS = [
    { id: 1, name: "Death Certificate", checked: false, required: true },
    { id: 2, name: "Burial/Transfer of Cadaver Permit", checked: false, required: true },
    { id: 3, name: "Valid ID of Informant / Payor", checked: false, required: true },
    { id: 4, name: "Certificate of Ownership (lot owners)", checked: true, required: true },
    { id: 5, name: "Signed Interment Request Agreement", checked: false, required: false },
    { id: 6, name: "Transfer Permit for Bone Transfer", checked: false, required: false }
];

function Interment() {
    // ── Real-Time Collections ──
    const [rawIntermentFees, setRawIntermentFees] = useState([]);
    const [plots, setPlots] = useState([]);
    const [clients, setClients] = useState([]);
    const [burials, setBurials] = useState([]);
    const [wakeSpaces, setWakeSpaces] = useState(DEFAULT_WAKE_SPACES);
    const [wakeBookings, setWakeBookings] = useState([]);

    // ── 1. DECEASED INFORMATION (RENDERED FIRST) ──
    const [deceasedFirstName, setDeceasedFirstName] = useState("");
    const [deceasedLastName, setDeceasedLastName] = useState("");
    const [deceasedDOB, setDeceasedDOB] = useState("");
    const [deceasedDOD, setDeceasedDOD] = useState("");
    const [deceasedDateBuried, setDeceasedDateBuried] = useState(getSystemDateISO());
    const [selectedIntermentService, setSelectedIntermentService] = useState(DEFAULT_INTERMENT_SERVICES[0]);
    const [documents, setDocuments] = useState(DEFAULT_DOCUMENTS);

    // ── 2. ALREADY-OWNED GRAVE LOT ──
    const [selectedGravePlot, setSelectedGravePlot] = useState(null);
    const [showOwnedPlotsModal, setShowOwnedPlotsModal] = useState(false);

    // ── 3. WAKE SPACE (OPTIONAL) ──
    const [wakeSpaceItem, setWakeSpaceItem] = useState(null);
    const [showWakeModal, setShowWakeModal] = useState(false);
    const [selectedWakeSpaceForModal, setSelectedWakeSpaceForModal] = useState(null);

    // ── 4. PAYMENT PLAN & SUMMARY ──
    const [discountType, setDiscountType] = useState("None");
    const [paymentPlan, setPaymentPlan] = useState("On the Spot Cash");
    const [amountTendered, setAmountTendered] = useState("");

    // ── Feedback, Receipt & Loading States ──
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentFeedback, setPaymentFeedback] = useState("");
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [completedReceiptData, setCompletedReceiptData] = useState(null);

    const handleCloseReceiptModal = () => {
        setShowReceiptModal(false);
        setCompletedReceiptData(null);
        handleResetForm();
    };

    // ── Real-Time Firestore Listeners ──
    useEffect(() => {
        let isMounted = true;

        const unsubInterment = subscribeIntermentFees(
            (fees) => {
                if (isMounted) {
                    if (fees && fees.length > 0) {
                        setRawIntermentFees(fees);
                        setSelectedIntermentService(fees[0]);
                    } else {
                        setRawIntermentFees(DEFAULT_INTERMENT_SERVICES);
                    }
                }
            },
            (err) => console.error("Failed to load interment fees:", err)
        );

        const unsubPlots = subscribePlots(
            (plotList) => {
                if (isMounted) setPlots(plotList || []);
            },
            (err) => console.error("Failed to load plots:", err)
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
            (err) => console.error("Failed to load wake spaces:", err)
        );

        const unsubWakeBookings = subscribeWakeSpaceBookings(
            (bookings) => {
                if (isMounted) setWakeBookings(bookings || []);
            },
            (err) => console.error("Failed to load wake bookings:", err)
        );

        const unsubClients = onSnapshot(
            collection(db, "clients"),
            (snap) => {
                if (isMounted) setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            },
            (err) => console.warn("Failed to load clients:", err)
        );

        const unsubBurials = onSnapshot(
            collection(db, "burials"),
            (snap) => {
                if (isMounted) setBurials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            },
            (err) => console.warn("Failed to load burials:", err)
        );

        const unsubDate = subscribeSystemDate(() => {});

        return () => {
            isMounted = false;
            if (unsubInterment) unsubInterment();
            if (unsubPlots) unsubPlots();
            if (unsubWakeSpaces) unsubWakeSpaces();
            if (unsubWakeBookings) unsubWakeBookings();
            if (unsubClients) unsubClients();
            if (unsubBurials) unsubBurials();
            if (unsubDate) unsubDate();
        };
    }, []);

    // ── Matching Interment Fees depending on the selected grave lot ──
    const matchingIntermentServices = useMemo(() => {
        if (!selectedGravePlot) return [];

        const targetId = String(
            selectedGravePlot.rawPlot?.grave_type_id ||
            selectedGravePlot.rawPlot?.graveLotTypeID ||
            selectedGravePlot.lotId ||
            ""
        ).trim().toLowerCase();

        const targetName = String(
            selectedGravePlot.graveType ||
            selectedGravePlot.rawPlot?.grave_type ||
            ""
        ).trim().toLowerCase();

        // 1. Check exact match in Firestore rawIntermentFees
        const matched = rawIntermentFees.filter((f) => {
            const fLotType = String(f.graveLot_type || f.grave_type_id || "").trim().toLowerCase();
            const fTypeName = String(f.grave_type || f.interment_type || "").trim().toLowerCase();

            if (targetId && (fLotType === targetId || fTypeName === targetId)) return true;
            if (targetName && (fLotType === targetName || fTypeName === targetName)) return true;
            if (targetName && fLotType && (targetName.includes(fLotType) || fLotType.includes(targetName))) return true;
            return false;
        });

        if (matched.length > 0) return matched;

        // 2. Fallback to rawIntermentFees if no specific lot type match, else DEFAULT_INTERMENT_SERVICES
        if (rawIntermentFees.length > 0) return rawIntermentFees;
        return DEFAULT_INTERMENT_SERVICES;
    }, [selectedGravePlot, rawIntermentFees]);

    // Auto-select first matching service when matching fees update
    useEffect(() => {
        if (matchingIntermentServices.length > 0) {
            const exists = matchingIntermentServices.some((f) => f.id === selectedIntermentService?.id);
            if (!exists) {
                setSelectedIntermentService(matchingIntermentServices[0]);
            }
        } else {
            setSelectedIntermentService(null);
        }
    }, [matchingIntermentServices]);

    // ── Wake Space Real-Time Availability ──
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
            nextVacantFormatted,
        };
    };

    // ── Owned Plot Selection Handler ──
    const handleSelectOwnedPlot = (plot) => {
        setSelectedGravePlot(plot);
        setShowOwnedPlotsModal(false);

        // Auto-check Certificate of Ownership
        setDocuments((prev) =>
            prev.map((d) =>
                d.name.includes("Certificate of Ownership") ? { ...d, checked: true } : d
            )
        );
    };

    const toggleDocument = (id) => {
        setDocuments((prev) =>
            prev.map((doc) => (doc.id === id ? { ...doc, checked: !doc.checked } : doc))
        );
    };

    const completedDocsCount = documents.filter((d) => d.checked).length;

    // ── Payment Calculations (GRAVE LOT IS ALREADY PAID = ₱0.00) ──
    const gravePrice = 0; // Owned lot = ₱0.00 lot fee!

    // Interment calculation via controller (applies weekend +₱3,000 surcharge for Mausoleum & Single Niche Fresh Burial)
    const intermentCalculation = useMemo(() => {
        if (!selectedIntermentService) {
            return {
                baseFee: 0,
                finalFee: 0,
                weekendSurcharge: 0,
                isWeekendRateApplied: false,
                rateNote: ""
            };
        }
        return calculateIntermentFeeController({
            baseFee: selectedIntermentService.fee,
            plotOrGraveType: selectedGravePlot,
            intermentServiceOrType: selectedIntermentService.interment_type,
            burialDate: deceasedDateBuried
        });
    }, [selectedIntermentService, selectedGravePlot, deceasedDateBuried]);

    const intermentFee = intermentCalculation.finalFee;
    const wakePrice = wakeSpaceItem ? Number(wakeSpaceItem.totalPrice || 0) : 0;

    const subtotal = intermentFee + wakePrice;
    const isDiscountEligible = discountType === "Senior" || discountType === "PWD";
    const discountAmount = isDiscountEligible ? Math.round(subtotal * 0.2) : 0;
    const totalCash = Math.max(0, subtotal - discountAmount);

    const tenderedNum = parseFloat(amountTendered) || 0;
    const changeAmount = amountTendered !== "" && !isNaN(tenderedNum) && tenderedNum >= totalCash
        ? tenderedNum - totalCash
        : 0;

    // ── Reset Form Handler ──
    const handleResetForm = () => {
        setDeceasedFirstName("");
        setDeceasedLastName("");
        setDeceasedDOB("");
        setDeceasedDOD("");
        setDeceasedDateBuried(getSystemDateISO());
        setSelectedIntermentService(null);
        setDocuments(DEFAULT_DOCUMENTS);
        setSelectedGravePlot(null);
        setWakeSpaceItem(null);
        setDiscountType("None");
        setPaymentPlan("On the Spot Cash");
        setAmountTendered("");
        setPaymentFeedback("");
    };

    // ── Process Booking & Payment ──
    const handleProcessPayment = async () => {
        setPaymentFeedback("");

        // 1. Validate Deceased Information
        if (!deceasedFirstName.trim() || !deceasedLastName.trim()) {
            setPaymentFeedback("Please provide the deceased person's First and Last Name.");
            return;
        }

        // 2. Validate Owned Plot Selection
        if (!selectedGravePlot?.id) {
            setPaymentFeedback("Please select an already-owned grave lot for this interment burial.");
            return;
        }

        // 3. Validate Documents Checklist
        const checkedDocs = documents.filter((d) => d.checked).map((d) => d.name);
        const hasValidId = checkedDocs.some((d) => /valid\s*id/i.test(d));
        const hasPermit = checkedDocs.some((d) => /permit/i.test(d));

        if (!hasValidId) {
            setPaymentFeedback("Valid ID of Informant / Payor must be verified.");
            return;
        }
        if (!hasPermit) {
            setPaymentFeedback("Burial / Cadaver Permit is required.");
            return;
        }

        // 4. Validate Amount Tendered
        if (amountTendered === "" || isNaN(tenderedNum) || tenderedNum < totalCash) {
            setPaymentFeedback(`Amount tendered is insufficient. Total Cash required is ₱${totalCash.toLocaleString()}.`);
            return;
        }

        setProcessingPayment(true);

        try {
            const ownerClient = selectedGravePlot.ownerClient;
            const nameParts = (selectedGravePlot.ownerName || "Lot Owner").trim().split(" ");
            const firstName = ownerClient?.first_name || nameParts[0] || "Lot";
            const lastName = ownerClient?.last_name || (nameParts.slice(1).join(" ") || "Owner");
            const email = ownerClient?.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@cherubim.local`;
            const contactNumber = ownerClient?.contact || "09170000000";
            const address = ownerClient?.address || "Tagum City";

            const clientFullName = `${firstName} ${lastName}`.trim();
            const deceasedFullName = `${deceasedFirstName} ${deceasedLastName}`.trim();

            const receiptCode = generateReceiptNumber();

            // 1. Process Interment Burial on Owned Lot
            const bookingResult = await processIntermentBookingController({
                plotId: selectedGravePlot.id,
                ownerId: selectedGravePlot.ownerId || null,
                clientData: {
                    firstName,
                    lastName,
                    email,
                    contactNumber,
                    address,
                    relationship: "Registered Lot Owner / Family",
                },
                burialData: {
                    deceasedFirstName,
                    deceasedLastName,
                    deceasedDOB,
                    deceasedDOD,
                    deceasedDateBuried,
                    intermentType: selectedIntermentService?.interment_type || "Standard Burial / Interment",
                    documents: checkedDocs,
                },
                paymentData: {
                    subtotal: subtotal,
                    intermentFee: intermentFee,
                    weekendSurcharge: intermentCalculation.weekendSurcharge,
                    wakePrice: wakePrice,
                    discountType: discountType !== "None" ? (discountType === "Senior" ? "Senior Citizen" : discountType === "PWD" ? "Person with Disability (PWD)" : discountType) : null,
                    discountAmount: discountAmount,
                    total: totalCash,
                    totalCash: totalCash,
                    amountTendered: Number(amountTendered),
                    change: changeAmount,
                    balance: 0,
                    paymentStatus: "paid",
                },
                historyData: {
                    receipt: receiptCode,
                    amount: totalCash,
                    paymentDate: deceasedDateBuried || getSystemDateISO(),
                    notes: `Interment service fee for ${deceasedFullName} on owned lot ${selectedGravePlot.plotCode}`,
                },
                wakeSpaceData: wakeSpaceItem || null,
            });

            // 2. If Wake Space facility was booked, commit reservation
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
                    deceased: deceasedFullName,
                });
            }

            // 3. Prepare Official Receipt Modal Data
            const finalReceiptCode = bookingResult?.receipt || receiptCode;
            const discountLabel = discountType === "Senior" ? "Senior Citizen" : discountType === "PWD" ? "Person with Disability (PWD)" : discountType;

            setCompletedReceiptData({
                receiptNumber: finalReceiptCode,
                transactionDate: new Date(),
                paymentDate: deceasedDateBuried || getSystemDateISO(),
                client: {
                    name: clientFullName,
                    contact: contactNumber || selectedGravePlot.ownerClient?.contact || "Verified on Deed",
                    email: email || selectedGravePlot.ownerClient?.email || "On File",
                    address: address || selectedGravePlot.ownerClient?.address || "On File",
                },
                deceased: {
                    name: deceasedFullName,
                    burialDate: deceasedDateBuried,
                },
                plot: {
                    plotCode: selectedGravePlot.plotCode,
                    graveType: selectedGravePlot.graveType,
                    section: selectedGravePlot.section,
                    ownerName: selectedGravePlot.ownerName,
                },
                items: [
                    {
                        description: `Interment Service: ${selectedIntermentService?.interment_type || "Standard Burial / Interment"}`,
                        amount: intermentFee,
                    },
                    ...(wakeSpaceItem ? [{
                        description: `Wake Facility: Space ${wakeSpaceItem.wake || "A"} (${wakeSpaceItem.days} ${wakeSpaceItem.days === 1 ? "day" : "days"}, ${wakeSpaceItem.startDate} to ${wakeSpaceItem.endDate})`,
                        amount: wakePrice,
                    }] : []),
                ],
                subtotal: subtotal,
                discount: discountAmount > 0 ? {
                    type: discountLabel,
                    rate: 20,
                    amount: discountAmount,
                } : null,
                totalPaid: totalCash,
                amountTendered: Number(amountTendered),
                change: changeAmount,
                paymentMethod: "Cash",
            });

            setShowReceiptModal(true);
            setPaymentFeedback("Interment burial on owned lot recorded successfully!");
            setTimeout(() => setPaymentFeedback(""), 6000);
        } catch (err) {
            console.error("Failed to process interment booking:", err);
            setPaymentFeedback(err.message || "Error processing interment booking. Please check details.");
        } finally {
            setProcessingPayment(false);
        }
    };

    return (
        <div className="user-management-page">
            <Header page="interment" />

            <div className="interment-page-container">
                {/* 2-Column Responsive Layout */}
                <div className="interment-layout-grid">
                    {/* ════════ LEFT COLUMN ════════ */}
                    <div className="interment-main-col">

                        {/* ── 1. OWNED CEMETERY PLOT DETAILS ── */}
                        <div className="interment-card">
                            <div className="interment-card-header">
                                <div className="interment-card-title-group">
                                    <Landmark className="interment-card-icon" size={18} />
                                    <h3 className="interment-card-title">1. Owned Cemetery Plot Details</h3>
                                </div>
                            </div>

                            {!selectedGravePlot ? (
                                <div className="interment-plot-box">
                                    <div className="interment-plot-selected-info">
                                        <span className="plot-selected-code" style={{ color: "#64748b" }}>
                                            No Owned Plot Selected
                                        </span>
                                        <span className="plot-selected-meta">
                                            Select a registered reserved or partial grave lot to view its details and link the interment burial.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="interment-btn-choose-plot"
                                        onClick={() => setShowOwnedPlotsModal(true)}
                                    >
                                        <Landmark size={15} />
                                        Select Owned Lot
                                    </button>
                                </div>
                            ) : (
                                <div className="interment-owned-details-card">
                                    <div className="owned-details-top-bar">
                                        <div className="owned-details-title-wrap">
                                            <span className="owned-plot-code-text">
                                                {selectedGravePlot.plotCode} • {selectedGravePlot.graveType}
                                            </span>
                                            {selectedGravePlot.status === "reserved" ? (
                                                <span className="interment-badge-pill blue">
                                                    <ShieldCheck size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Reserved (Owned)
                                                </span>
                                            ) : (
                                                <span className="interment-badge-pill amber">
                                                    <ShieldCheck size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Partial ({selectedGravePlot.occupiedCount}/{selectedGravePlot.maxCapacity})
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="interment-btn-choose-plot"
                                            onClick={() => setShowOwnedPlotsModal(true)}
                                        >
                                            <Landmark size={14} />
                                            Change Lot
                                        </button>
                                    </div>

                                    <div className="owned-details-body">
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Registered Lot Owner</span>
                                            <span className="owned-detail-val">{selectedGravePlot.ownerName || "Family Lot Owner"}</span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Contact Number</span>
                                            <span className="owned-detail-val">{selectedGravePlot.ownerClient?.contact || "Verified on Deed"}</span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Email Address</span>
                                            <span className="owned-detail-val">{selectedGravePlot.ownerClient?.email || "On File"}</span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Cemetery Section</span>
                                            <span className="owned-detail-val">Section {selectedGravePlot.section}</span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Capacity & Available Spaces</span>
                                            <span className="owned-detail-val green">
                                                {selectedGravePlot.occupiedCount} / {selectedGravePlot.maxCapacity} Occupied ({selectedGravePlot.remainingSpace} Available)
                                            </span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Certificate / Deed</span>
                                            <span className="owned-detail-val blue">Certificate of Ownership Verified</span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Owner Address</span>
                                            <span className="owned-detail-val">{selectedGravePlot.ownerClient?.address || "On File"}</span>
                                        </div>
                                        <div className="owned-detail-item">
                                            <span className="owned-detail-label">Allowed Action</span>
                                            <span className="owned-detail-val">Interment / Transfer of Remains</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── 2. DECEASED INFORMATION COMPONENT ── */}
                        <div className="interment-card">
                            <div className="interment-card-header">
                                <div className="interment-card-title-group">
                                    <UserX className="interment-card-icon red" size={18} />
                                    <h3 className="interment-card-title">2. Deceased Information</h3>
                                </div>
                            </div>

                            {/* Deceased Names */}
                            <div className="interment-form-grid-2">
                                <div className="interment-form-group">
                                    <label className="interment-form-label">
                                        First Name <span className="interment-required-star">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="interment-input"
                                        placeholder="e.g. Juan"
                                        value={deceasedFirstName}
                                        onChange={(e) => setDeceasedFirstName(e.target.value)}
                                    />
                                </div>

                                <div className="interment-form-group">
                                    <label className="interment-form-label">
                                        Last Name <span className="interment-required-star">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="interment-input"
                                        placeholder="e.g. Dela Cruz"
                                        value={deceasedLastName}
                                        onChange={(e) => setDeceasedLastName(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Vital Dates */}
                            <div className="interment-form-grid-3">
                                <div className="interment-form-group">
                                    <label className="interment-form-label">
                                        <Calendar size={13} />
                                        Date of Birth
                                    </label>
                                    <input
                                        type="date"
                                        className="interment-input"
                                        value={deceasedDOB}
                                        onChange={(e) => setDeceasedDOB(e.target.value)}
                                    />
                                </div>

                                <div className="interment-form-group">
                                    <label className="interment-form-label">
                                        <Calendar size={13} />
                                        Date of Death
                                    </label>
                                    <input
                                        type="date"
                                        className="interment-input"
                                        value={deceasedDOD}
                                        onChange={(e) => setDeceasedDOD(e.target.value)}
                                    />
                                </div>

                                <div className="interment-form-group">
                                    <label className="interment-form-label">
                                        <Calendar size={13} />
                                        Date Buried / Interment <span className="interment-required-star">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        className="interment-input"
                                        value={deceasedDateBuried}
                                        onChange={(e) => setDeceasedDateBuried(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Interment Service Selector (depends on selected grave lot) */}
                            <div className="interment-form-group full" style={{ marginTop: "4px" }}>
                                <label className="interment-form-label">
                                    <Tag size={13} />
                                    Interment Service Package <span className="interment-required-star">*</span>
                                    {selectedGravePlot && (
                                        <span style={{ fontSize: "0.72rem", color: "#004d8c", fontWeight: 600, marginLeft: "6px" }}>
                                            (For {selectedGravePlot.graveType} • {selectedGravePlot.plotCode})
                                        </span>
                                    )}
                                </label>

                                {!selectedGravePlot ? (
                                    <div style={{
                                        padding: "14px 16px",
                                        background: "#f8fafc",
                                        border: "1px dashed #cbd5e1",
                                        borderRadius: "8px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        color: "#64748b",
                                        fontSize: "0.8rem"
                                    }}>
                                        <Info size={16} color="#004d8c" />
                                        <span>Please select an owned grave lot in Section 1 above to view its applicable interment fees.</span>
                                    </div>
                                ) : matchingIntermentServices.length === 0 ? (
                                    <div style={{
                                        padding: "14px 16px",
                                        background: "#fffbeb",
                                        border: "1px solid #fde68a",
                                        borderRadius: "8px",
                                        color: "#b45309",
                                        fontSize: "0.8rem"
                                    }}>
                                        No specific interment fees found for {selectedGravePlot.graveType}. Please configure them in Admin Grave Management.
                                    </div>
                                ) : (
                                    <div className="interment-services-selector">
                                        {matchingIntermentServices.map((svc) => {
                                            const isSelected = selectedIntermentService?.id === svc.id;
                                            const svcCalc = calculateIntermentFeeController({
                                                baseFee: svc.fee,
                                                plotOrGraveType: selectedGravePlot,
                                                intermentServiceOrType: svc.interment_type,
                                                burialDate: deceasedDateBuried
                                            });
                                            return (
                                                <div
                                                    key={svc.id}
                                                    className={`interment-service-option ${isSelected ? "selected" : ""}`}
                                                    onClick={() => setSelectedIntermentService(svc)}
                                                >
                                                    <div className="service-opt-title">{svc.interment_type}</div>
                                                    <div className="service-opt-fee">₱{svcCalc.finalFee.toLocaleString()}</div>
                                                    {svcCalc.isWeekendRateApplied && (
                                                        <div style={{
                                                            display: "inline-block",
                                                            fontSize: "0.68rem",
                                                            fontWeight: 700,
                                                            color: "#b45309",
                                                            background: "#fef3c7",
                                                            border: "1px solid #fde68a",
                                                            borderRadius: "4px",
                                                            padding: "1px 6px",
                                                            width: "fit-content",
                                                            marginTop: "2px"
                                                        }}>
                                                            +₱3,000 Weekend Rate
                                                        </div>
                                                    )}
                                                    <div className="service-opt-sub">
                                                        {svc.description || `Applicable to ${selectedGravePlot.graveType}`}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Required Documents Checklist */}
                            <div className="interment-form-group full" style={{ marginTop: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <label className="interment-form-label">
                                        <FileText size={13} />
                                        Interment Requirements Checklist
                                    </label>
                                    <span className="interment-doc-counter">
                                        {completedDocsCount} of {documents.length} verified
                                    </span>
                                </div>

                                <div className="interment-doc-grid">
                                    {documents.map((doc) => (
                                        <label key={doc.id} className="interment-doc-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={doc.checked}
                                                onChange={() => toggleDocument(doc.id)}
                                            />
                                            <span>
                                                {doc.name}
                                                {doc.required && <span className="interment-required-star"> *</span>}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ── 3. WAKE SPACE (OPTIONAL) ── */}
                        <div className="interment-card">
                            <div className="interment-card-header">
                                <div className="interment-card-title-group">
                                    <Bed className="interment-card-icon purple" size={18} />
                                    <h3 className="interment-card-title">3. Wake Space Facilities</h3>
                                </div>
                            </div>

                            <div className="interment-wake-table-wrap">
                                <table className="interment-wake-table">
                                    <thead>
                                        <tr>
                                            <th>Facility</th>
                                            <th>Rate</th>
                                            <th>Availability</th>
                                            <th style={{ textAlign: "right" }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {wakeSpaces.map((ws) => {
                                            const isSelected =
                                                wakeSpaceItem &&
                                                (wakeSpaceItem.spaceId === ws.id || wakeSpaceItem.wake === ws.wake);
                                            const avail = getSpaceAvailability(ws);

                                            return (
                                                <tr key={ws.id} className={isSelected ? "row-selected" : ""}>
                                                    <td>
                                                        <span className="wake-facility-name">Wake Space {ws.wake}</span>
                                                        <div style={{ fontSize: "0.725rem", color: "#64748b" }}>ID: {ws.id}</div>
                                                    </td>
                                                    <td>
                                                        <span className="wake-rate-bold">₱{Number(ws.price || 8500).toLocaleString()}</span>
                                                        <span style={{ fontSize: "0.725rem", color: "#64748b" }}> / night</span>
                                                    </td>
                                                    <td>
                                                        {avail.isOccupiedToday ? (
                                                            <span className="status-badge-mini occupied">
                                                                Next: {avail.nextVacantFormatted}
                                                            </span>
                                                        ) : (
                                                            <span className="status-badge-mini available">
                                                                Available
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: "right" }}>
                                                        {isSelected ? (
                                                            <div style={{ display: "inline-flex", gap: "6px" }}>
                                                                <button
                                                                    type="button"
                                                                    className="interment-btn-book"
                                                                    onClick={() => {
                                                                        setSelectedWakeSpaceForModal(ws);
                                                                        setShowWakeModal(true);
                                                                    }}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="interment-btn-remove"
                                                                    onClick={() => setWakeSpaceItem(null)}
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="interment-btn-book"
                                                                onClick={() => {
                                                                    setSelectedWakeSpaceForModal(ws);
                                                                    setShowWakeModal(true);
                                                                }}
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

                            {/* Active Booked Wake Banner */}
                            {wakeSpaceItem && (
                                <div className="interment-booked-wake-banner">
                                    <div className="booked-wake-left">
                                        <div className="booked-wake-title">
                                            Wake Space {wakeSpaceItem.wake} Reserved
                                        </div>
                                        <div className="booked-wake-sub">
                                            {wakeSpaceItem.startDate} to {wakeSpaceItem.endDate} ({wakeSpaceItem.days} night{wakeSpaceItem.days > 1 ? "s" : ""})
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <span className="booked-wake-price">
                                            ₱{Number(wakeSpaceItem.totalPrice).toLocaleString()}
                                        </span>
                                        <button
                                            type="button"
                                            className="interment-btn-remove"
                                            onClick={() => setWakeSpaceItem(null)}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* ════════ RIGHT COLUMN (STICKY) ════════ */}
                    <div className="interment-side-col">

                        {/* ── 4. PAYMENT PLAN COMPONENT ── */}
                        <div className="interment-card">
                            <div className="interment-card-header">
                                <div className="interment-card-title-group">
                                    <Receipt className="interment-card-icon" size={18} />
                                    <h3 className="interment-card-title">4. Payment Plan</h3>
                                </div>
                            </div>

                            <div className="interment-form-group">
                                <label className="interment-form-label">Discount Program</label>
                                <select
                                    className="interment-select"
                                    value={discountType}
                                    onChange={(e) => setDiscountType(e.target.value)}
                                >
                                    <option value="None">None (Standard Rates)</option>
                                    <option value="Senior">Senior Citizen (20% Off)</option>
                                    <option value="PWD">Person with Disability (20% Off)</option>
                                </select>
                            </div>

                            <div className="interment-form-group">
                                <label className="interment-form-label">Settlement Mode</label>
                                <select
                                    className="interment-select"
                                    value={paymentPlan}
                                    onChange={(e) => setPaymentPlan(e.target.value)}
                                >
                                    <option value="On the Spot Cash">On the Spot Cash (Full Settlement)</option>
                                </select>
                            </div>
                        </div>

                        {/* ── 5. PAYMENT SUMMARY COMPONENT ── */}
                        <div className="interment-summary-card">
                            <div className="interment-card-header" style={{ paddingBottom: "10px" }}>
                                <div className="interment-card-title-group">
                                    <Receipt className="interment-card-icon" size={18} />
                                    <h3 className="interment-card-title">5. Payment Summary</h3>
                                </div>
                            </div>

                            <div className="interment-summary-rows">
                                {intermentFee > 0 && (
                                    <div className="interment-summary-row">
                                        <span>
                                            {selectedIntermentService?.interment_type || "Interment Service"}
                                            {intermentCalculation.isWeekendRateApplied && (
                                                <span style={{ fontSize: "0.72rem", color: "#b45309", marginLeft: "6px", fontWeight: 700 }}>
                                                    (+₱3k Weekend)
                                                </span>
                                            )}
                                        </span>
                                        <span className="summary-amount blue">₱{intermentFee.toLocaleString()}</span>
                                    </div>
                                )}
                                {intermentCalculation.isWeekendRateApplied && (
                                    <div className="interment-summary-row" style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "-6px" }}>
                                        <span>↳ Weekend Rate ({selectedGravePlot?.graveType || "Plot"})</span>
                                        <span style={{ fontWeight: 600 }}>+₱3,000</span>
                                    </div>
                                )}

                                {wakePrice > 0 && (
                                    <div className="interment-summary-row">
                                        <span>Wake Space ({wakeSpaceItem?.wake})</span>
                                        <span className="summary-amount">₱{wakePrice.toLocaleString()}</span>
                                    </div>
                                )}

                                {discountAmount > 0 && (
                                    <div className="interment-summary-row discount">
                                        <span>Discount (20%)</span>
                                        <span className="summary-amount green">-₱{discountAmount.toLocaleString()}</span>
                                    </div>
                                )}
                            </div>

                            <div className="interment-summary-divider"></div>

                            <div className="interment-total-cash-row">
                                <span className="total-cash-label">Total Cash Due</span>
                                <span className="total-cash-val">₱{totalCash.toLocaleString()}</span>
                            </div>

                            <div className="interment-form-group" style={{ marginTop: "4px" }}>
                                <label className="interment-form-label">
                                    Amount Tendered (Cash) <span className="interment-required-star">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="interment-input"
                                    placeholder="0.00"
                                    value={amountTendered}
                                    onChange={(e) => setAmountTendered(e.target.value)}
                                />
                            </div>

                            <div className="interment-form-group">
                                <label className="interment-form-label">Change</label>
                                <div
                                    style={{
                                        fontSize: "1.1rem",
                                        fontWeight: 800,
                                        color: changeAmount > 0 ? "#059669" : "#0f172a",
                                        padding: "8px 12px",
                                        background: "#f8fafc",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "8px"
                                    }}
                                >
                                    ₱{changeAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            {paymentFeedback && (
                                <div
                                    className={`interment-feedback-banner ${
                                        paymentFeedback.includes("successfully") ? "success" : "error"
                                    }`}
                                >
                                    <Info size={15} />
                                    <span>{paymentFeedback}</span>
                                </div>
                            )}

                            <button
                                type="button"
                                className="interment-submit-btn"
                                disabled={processingPayment}
                                onClick={handleProcessPayment}
                            >
                                <CheckCircle size={18} />
                                <span>{processingPayment ? "Recording Booking…" : "Process Interment Booking"}</span>
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* Wake Space Modal */}
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
                confirmText="Add to Interment"
            />

            {/* Owned Plots Selection Modal */}
            <OwnedPlotsModal
                isOpen={showOwnedPlotsModal}
                onClose={() => setShowOwnedPlotsModal(false)}
                plots={plots}
                clients={clients}
                burials={burials}
                selectedPlotId={selectedGravePlot?.id}
                onSelectPlot={handleSelectOwnedPlot}
            />

            {/* Official Receipt Modal */}
            <IntermentReceiptModal
                isOpen={showReceiptModal}
                receiptData={completedReceiptData}
                onClose={handleCloseReceiptModal}
            />
        </div>
    );
}

export default Interment;
