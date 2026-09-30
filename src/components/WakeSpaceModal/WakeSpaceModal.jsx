import { useState, useEffect } from "react";
import { X, Calendar as CalendarIcon, Bed, AlertCircle, CheckCircle, Clock, Minus, Plus } from "lucide-react";
import WakeSpaceCalendar from "../WakeSpaceCalendar/WakeSpaceCalendar.jsx";
import {
    createWakeSpaceBooking,
    subscribeWakeSpaceBookings,
} from "../../services/wakeSpaceServices.jsx";
import {
    createWakeSpaceBookingController,
    validateWakeSpaceBookingSelectionController,
    assertWakeSpaceBookingAvailableController,
    isBookingForSpace,
} from "../../controller/wakeSpaceController.jsx";
import "./WakeSpaceModal.css";

/**
 * WakeSpaceModal
 *
 * Reusable modal for booking Wake Space.
 * Can show an embedded calendar to select dates, or just the duration/pricing form.
 *
 * Props:
 *  isOpen           {boolean}   – controls modal visibility
 *  onClose          {Function}  – called on close/cancel
 *  onSave           {Function}  – optional custom save handler: async (bookingData) => void
 *  onSuccess        {Function}  – optional callback on successful save: (bookingData) => void
 *  initialStartDate {Date|null} – pre-selected start date
 *  initialDays      {number}    – default number of nights (default 1)
 *  showCalendar     {boolean}   – whether to show the calendar inside the modal (default true)
 *  bookings         {Array}     – optional array of existing bookings; if omitted, subscribes to Firestore
 *  title            {string}    – modal header title (default "Book Wake Space")
 *  pricePerNight    {number}    – price per night in PHP (default 1500)
 */
function WakeSpaceModal({
    isOpen,
    onClose,
    onSave,
    onSuccess,
    space = null,
    wakeSpaces = null,
    initialStartDate = null,
    initialDays = 1,
    showCalendar = true,
    bookings: propBookings = null,
    title = null,
    pricePerNight = null,
    confirmText = "Confirm Booking",
}) {
    const [selectedSpace, setSelectedSpace] = useState(space);
    const [startDate, setStartDate] = useState(initialStartDate);
    const [days, setDays] = useState(initialDays);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [conflictWarning, setConflictWarning] = useState(null);
    const [liveBookings, setLiveBookings] = useState([]);

    // Sync state when modal opens or initial values change
    useEffect(() => {
        if (isOpen) {
            setSelectedSpace(space || (wakeSpaces && wakeSpaces.length > 0 ? wakeSpaces[0] : null));
            setStartDate(initialStartDate || (showCalendar ? null : new Date()));
            setDays(initialDays || 1);
            setError("");
            setConflictWarning(null);
        }
    }, [isOpen, space, wakeSpaces, initialStartDate, initialDays, showCalendar]);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Live subscription if parent didn't provide bookings
    useEffect(() => {
        if (!isOpen) return;
        if (propBookings) {
            setLiveBookings(propBookings);
            return;
        }

        const unsub = subscribeWakeSpaceBookings((data) => {
            setLiveBookings(data || []);
        });
        return () => unsub();
    }, [isOpen, propBookings]);

    const activeSpace = selectedSpace || space;
    const activePrice = activeSpace?.price ? Number(activeSpace.price) : (pricePerNight != null ? pricePerNight : 8500);

    const activeBookings = propBookings || liveBookings;

    // Filter bookings specific to this space for the calendar using robust identifier normalizer
    const spaceFilteredBookings = (activeBookings || []).filter((b) => {
        if (!activeSpace) return true;
        return isBookingForSpace(b, activeSpace.id, activeSpace.wake);
    });

    // Computed end date
    const computedEndDate = startDate
        ? new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate() + Math.max(1, Number(days)) - 1
          )
        : null;

    const formatDateDisplay = (date) => {
        if (!date) return "Select date";
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const formatDateISO = (date) => {
        if (!date) return "";
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
            date.getDate()
        ).padStart(2, "0")}`;
    };

    // ── Real-Time Conflict Controller Check on date/days/space change ──
    useEffect(() => {
        if (!isOpen || !startDate || !activeSpace) {
            setConflictWarning(null);
            return;
        }

        const startStr = formatDateISO(startDate);
        const endStr = formatDateISO(computedEndDate);

        validateWakeSpaceBookingSelectionController({
            spaceId: activeSpace.id,
            wake: activeSpace.wake,
            startDate: startStr,
            endDate: endStr,
            days,
            existingBookings: activeBookings,
        })
            .then((res) => {
                if (!res.isValid) {
                    setConflictWarning(res.errorMessage);
                } else {
                    setConflictWarning(null);
                    if (error && error.includes("occupied")) {
                        setError("");
                    }
                }
            })
            .catch((err) => console.warn("Validation error:", err));
    }, [isOpen, startDate, days, activeSpace, activeBookings, computedEndDate]);

    if (!isOpen) return null;

    const handleDateSelect = async (date) => {
        setError("");
        const startStr = formatDateISO(date);
        const val = await validateWakeSpaceBookingSelectionController({
            spaceId: activeSpace?.id,
            wake: activeSpace?.wake,
            startDate: startStr,
            days,
            existingBookings: activeBookings,
        });

        if (!val.isValid) {
            setError(val.errorMessage);
            setStartDate(null);
            return;
        }

        setStartDate(date);
    };

    const handleOccupiedDateClick = (cellDate, conf) => {
        const dateStr = formatDateISO(cellDate);
        const spaceLabel = activeSpace?.wake ? `Wake Space ${activeSpace.wake}` : "This space";
        const details = conf?.deceased ? ` (${conf.deceased})` : (conf?.client ? ` (${conf.client})` : "");
        setError(`Cannot select ${dateStr}: ${spaceLabel} is already occupied${details}. Please select an available date.`);
    };

    const handleDaysChange = (val) => {
        const num = Math.max(1, parseInt(val, 10) || 1);
        setDays(num);
    };

    const handleIncrementDays = () => setDays((prev) => Math.max(1, Number(prev) + 1));
    const handleDecrementDays = () => setDays((prev) => Math.max(1, Number(prev) - 1));

    const totalAmount = Math.max(1, Number(days)) * activePrice;

    const handleConfirm = async () => {
        if (!startDate) {
            setError("Please select an available check-in date from the calendar.");
            return;
        }

        const numDays = Math.max(1, Number(days));
        setSaving(true);
        setError("");

        const payload = {
            spaceId: activeSpace?.id || "WAS-001",
            spaceName: activeSpace ? `Wake Space ${activeSpace.wake}` : "Wake Space",
            wake: activeSpace?.wake || "A",
            pricePerNight: activePrice,
            startDate: formatDateISO(startDate),
            endDate: formatDateISO(computedEndDate),
            days: numDays,
            status: "pending",
            totalPrice: totalAmount,
        };

        try {
            // ── CONTROLLER ASSERTION: Strictly blocks occupied date walk-through even when onSave is passed ──
            await assertWakeSpaceBookingAvailableController({
                spaceId: payload.spaceId,
                wake: payload.wake,
                startDate: payload.startDate,
                endDate: payload.endDate,
                days: payload.days,
                existingBookings: activeBookings,
            });

            if (onSave) {
                await onSave(payload);
            } else {
                const res = await createWakeSpaceBookingController(payload);
                payload.id = res?.id;
                payload.bookingId = res?.bookingId;
                payload.status = res?.status;
            }

            onSuccess?.(payload);
            onClose?.();
        } catch (err) {
            console.error("WakeSpaceModal: booking validation or save failed:", err);
            setError(err.message || "Failed to save booking. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ws-modal-overlay" onClick={onClose}>
            <div
                className={`ws-modal-card ${showCalendar ? "ws-modal-wide" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="ws-modal-header">
                    <div className="ws-modal-title-group">
                        <span className="ws-modal-icon-badge">
                            <Bed size={18} />
                        </span>
                        <div>
                            <h3 className="ws-modal-title">
                                {title || (activeSpace ? `Book Wake Space ${activeSpace.wake}` : "Book Wake Space")}
                            </h3>
                            <p className="ws-modal-subtitle">
                                {activeSpace
                                    ? `${activeSpace.id} • ₱${activePrice.toLocaleString()} / night`
                                    : (showCalendar
                                        ? "Select available dates from the calendar below"
                                        : "Configure duration and reservation details")}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ws-modal-close-btn"
                        onClick={onClose}
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Space Selector Tabs (when multiple wake spaces provided) */}
                {wakeSpaces && wakeSpaces.length > 1 && (
                    <div className="ws-modal-space-tabs">
                        {wakeSpaces.map((ws) => {
                            const isTabActive = (activeSpace?.id === ws.id) || (activeSpace?.wake === ws.wake);
                            const isTabDisabled = ws.status === "inactive";
                            return (
                                <button
                                    key={ws.id}
                                    type="button"
                                    className={`ws-modal-space-tab ${isTabActive ? "active" : ""}`}
                                    onClick={() => setSelectedSpace(ws)}
                                    disabled={isTabDisabled}
                                >
                                    <Bed size={13} />
                                    <span>Wake Space {ws.wake}</span>
                                    <span className="ws-tab-id">({ws.id})</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Body */}
                <div className="ws-modal-scroll-body">
                    {/* Embedded Calendar */}
                    {showCalendar && (
                        <div className="ws-modal-calendar-container">
                            <WakeSpaceCalendar
                                bookings={spaceFilteredBookings}
                                wakeSpaces={wakeSpaces}
                                selectedDate={startDate}
                                endDate={computedEndDate}
                                onDateSelect={handleDateSelect}
                                onOccupiedDateClick={handleOccupiedDateClick}
                                initialDate={startDate || new Date()}
                            />
                        </div>
                    )}

                    {/* Form Fields */}
                    <div className="ws-modal-fields-grid">
                        {/* Check-in Date */}
                        <div className="ws-modal-field">
                            <label className="ws-modal-label">
                                <CalendarIcon size={14} />
                                Check-in Date (Start)
                            </label>
                            <div className="ws-modal-input ws-modal-input-readonly">
                                {formatDateDisplay(startDate)}
                            </div>
                        </div>

                        {/* Number of Days / Nights Stepper */}
                        <div className="ws-modal-field">
                            <label className="ws-modal-label">
                                <Clock size={14} />
                                Duration (Nights)
                            </label>
                            <div className="ws-modal-stepper">
                                <button
                                    type="button"
                                    className="ws-modal-stepper-btn"
                                    onClick={handleDecrementDays}
                                    disabled={days <= 1 || saving}
                                    aria-label="Decrease duration"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="number"
                                    className="ws-modal-stepper-input"
                                    min={1}
                                    value={days}
                                    onChange={(e) => handleDaysChange(e.target.value)}
                                    disabled={saving}
                                />
                                <button
                                    type="button"
                                    className="ws-modal-stepper-btn"
                                    onClick={handleIncrementDays}
                                    disabled={saving}
                                    aria-label="Increase duration"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Check-out Date */}
                        <div className="ws-modal-field">
                            <label className="ws-modal-label">
                                <CalendarIcon size={14} />
                                Check-out Date (End)
                            </label>
                            <div className="ws-modal-input ws-modal-input-readonly">
                                {formatDateDisplay(computedEndDate)}
                            </div>
                        </div>
                    </div>

                    {/* Summary & Price Card */}
                    <div className="ws-modal-summary-card">
                        <div className="ws-modal-summary-left">
                            <span className="ws-modal-summary-title">ESTIMATED TOTAL</span>
                            <span className="ws-modal-summary-calc">
                                ₱{activePrice.toLocaleString()} × {days} night{days > 1 ? "s" : ""}
                            </span>
                        </div>
                        <span className="ws-modal-summary-total">
                            ₱{totalAmount.toLocaleString()}
                        </span>
                    </div>

                    {/* Error & Conflict Alert Box */}
                    {(error || conflictWarning) && (
                        <div className="ws-modal-error-box">
                            <AlertCircle size={16} />
                            <span>{error || conflictWarning}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="ws-modal-footer">
                    <button
                        type="button"
                        className="ws-modal-btn-cancel"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="ws-modal-btn-save"
                        onClick={handleConfirm}
                        disabled={saving || !startDate || Boolean(conflictWarning) || Boolean(error)}
                    >
                        {saving ? (
                            "Saving…"
                        ) : (
                            <>
                                <CheckCircle size={16} />
                                {confirmText}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default WakeSpaceModal;
