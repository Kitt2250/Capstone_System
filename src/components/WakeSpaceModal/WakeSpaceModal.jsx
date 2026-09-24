import { useState, useEffect } from "react";
import { X, Calendar as CalendarIcon, Bed, AlertCircle, CheckCircle, Clock, Minus, Plus } from "lucide-react";
import WakeSpaceCalendar from "../WakeSpaceCalendar/WakeSpaceCalendar.jsx";
import {
    createWakeSpaceBooking,
    subscribeWakeSpaceBookings,
} from "../../services/wakeSpaceServices.jsx";
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
    initialStartDate = null,
    initialDays = 1,
    showCalendar = true,
    bookings: propBookings = null,
    title = "Book Wake Space",
    pricePerNight = 1500,
    confirmText = "Confirm Booking",
}) {
    const [startDate, setStartDate] = useState(initialStartDate);
    const [days, setDays] = useState(initialDays);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [liveBookings, setLiveBookings] = useState([]);

    // Sync state when modal opens or initial values change
    useEffect(() => {
        if (isOpen) {
            setStartDate(initialStartDate || (showCalendar ? null : new Date()));
            setDays(initialDays || 1);
            setError("");
        }
    }, [isOpen, initialStartDate, initialDays, showCalendar]);

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

    if (!isOpen) return null;

    const activeBookings = propBookings || liveBookings;

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

    const handleDateSelect = (date) => {
        setStartDate(date);
        setError("");
    };

    const handleDaysChange = (val) => {
        const num = Math.max(1, parseInt(val, 10) || 1);
        setDays(num);
    };

    const handleIncrementDays = () => setDays((prev) => Math.max(1, Number(prev) + 1));
    const handleDecrementDays = () => setDays((prev) => Math.max(1, Number(prev) - 1));

    const totalAmount = Math.max(1, Number(days)) * pricePerNight;

    const handleConfirm = async () => {
        if (!startDate) {
            setError("Please select a check-in date.");
            return;
        }

        const numDays = Math.max(1, Number(days));
        setSaving(true);
        setError("");

        const payload = {
            startDate: formatDateISO(startDate),
            endDate: formatDateISO(computedEndDate),
            days: numDays,
            status: "pending",
            totalPrice: totalAmount,
        };

        try {
            if (onSave) {
                await onSave(payload);
            } else {
                const res = await createWakeSpaceBooking(payload);
                payload.id = res?.id;
                payload.bookingId = res?.bookingId;
            }

            onSuccess?.(payload);
            onClose?.();
        } catch (err) {
            console.error("WakeSpaceModal: failed to save booking:", err);
            setError("Failed to save booking. Please try again.");
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
                            <h3 className="ws-modal-title">{title}</h3>
                            <p className="ws-modal-subtitle">
                                {showCalendar
                                    ? "Select available dates from the calendar below"
                                    : "Configure duration and reservation details"}
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

                {/* Body */}
                <div className="ws-modal-scroll-body">
                    {/* Embedded Calendar */}
                    {showCalendar && (
                        <div className="ws-modal-calendar-container">
                            <WakeSpaceCalendar
                                bookings={activeBookings}
                                onDateSelect={handleDateSelect}
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
                                ₱{pricePerNight.toLocaleString()} × {days} night{days > 1 ? "s" : ""}
                            </span>
                        </div>
                        <span className="ws-modal-summary-total">
                            ₱{totalAmount.toLocaleString()}
                        </span>
                    </div>

                    {/* Error Box */}
                    {error && (
                        <div className="ws-modal-error-box">
                            <AlertCircle size={16} />
                            <span>{error}</span>
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
                        disabled={saving || !startDate}
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
