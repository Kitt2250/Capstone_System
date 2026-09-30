/**
 * Wake Space Controller
 *
 * Provides business logic, validation, conflict checking, and automatic
 * status synchronization against the active Philippines System Date (PHT).
 */

import {
    createWakeSpaceBooking,
    getWakeSpaceBookings,
    updateWakeSpaceBooking,
    updateWakeSpaceStatus,
    getWakeSpaces,
} from "../services/wakeSpaceServices.jsx";
import { getSystemDate, getSystemDateISO, subscribeSystemDate } from "../utils/systemDate.js";
import logAuditEvent from "../utils/auditLogger.js";
import { createNotification } from "../services/notificationServices";

/**
 * Computes what a booking's status should be based on a given system date (PHT).
 *
 * Rules:
 *  - cancelled bookings remain cancelled
 *  - today < startDate  => "pending"   (Upcoming reservation)
 *  - startDate <= today <= endDate => "active" (Ongoing vigil / Occupied)
 *  - today > endDate    => "completed" (Finished reservation)
 *
 * @param {Object} booking - { startDate, endDate, status }
 * @param {string} [systemDateISO] - "YYYY-MM-DD" in PHT (defaults to getSystemDateISO())
 * @returns {string} "pending" | "active" | "completed" | "cancelled"
 */
export function computeBookingStatus(booking, systemDateISO = null) {
    if (!booking) return "pending";
    if (booking.status === "cancelled") return "cancelled";

    const todayStr = systemDateISO || getSystemDateISO();
    const { startDate, endDate } = booking;

    if (!startDate || !endDate) return booking.status || "pending";

    if (todayStr < startDate) {
        return "pending";
    } else if (todayStr >= startDate && todayStr <= endDate) {
        return "active";
    } else {
        return "completed";
    }
}

/**
/**
 * Normalizes space identifiers (e.g. "WAS-001", "WS001", "A", etc.) for reliable matching.
 *
 * @param {string} idOrWake
 * @returns {string} normalized wake letter or ID
 */
export function normalizeWakeSpaceIdentifier(idOrWake) {
    if (!idOrWake) return "";
    const str = String(idOrWake).trim().toUpperCase();
    const map = {
        "WAS-001": "A",
        "WAS-002": "B",
        "WAS-003": "C",
        "WS001": "A",
        "WS002": "B",
        "WS003": "C",
        "A": "A",
        "B": "B",
        "C": "C",
    };
    return map[str] || str;
}

/**
 * Checks if a booking record belongs to a given space/wake.
 *
 * @param {Object} booking
 * @param {string} spaceId
 * @param {string} [wake]
 * @returns {boolean}
 */
export function isBookingForSpace(booking, spaceId, wake = null) {
    if (!booking) return false;
    const targetNorm = normalizeWakeSpaceIdentifier(spaceId) || normalizeWakeSpaceIdentifier(wake);
    const bookingNorm = normalizeWakeSpaceIdentifier(booking.spaceId) || normalizeWakeSpaceIdentifier(booking.wake);
    return Boolean(targetNorm && bookingNorm && targetNorm === bookingNorm);
}

/**
 * Checks for date conflicts on a specific Wake Space facility.
 *
 * @param {string} spaceId - e.g. "WAS-001" or "A"
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {string} endDate - "YYYY-MM-DD"
 * @param {string} [excludeBookingId] - optional booking ID to ignore (for edits)
 * @param {Array} [existingBookings] - optional pre-fetched bookings array
 * @returns {Promise<{ hasConflict: boolean, conflictingBooking: Object|null }>}
 */
export async function checkWakeSpaceConflict(
    spaceId,
    startDate,
    endDate,
    excludeBookingId = null,
    existingBookings = null
) {
    if (!spaceId || !startDate || !endDate) {
        return { hasConflict: false, conflictingBooking: null };
    }

    const bookings = existingBookings || (await getWakeSpaceBookings());

    const conflict = bookings.find((b) => {
        if (!b) return false;
        if (excludeBookingId && (b.id === excludeBookingId || b.bookingId === excludeBookingId)) {
            return false;
        }
        if (b.status === "cancelled") return false;

        const isSameSpace = isBookingForSpace(b, spaceId, spaceId);
        if (!isSameSpace) return false;

        // Date overlap check: (StartA <= EndB) and (EndA >= StartB)
        const overlap = startDate <= b.endDate && endDate >= b.startDate;
        return overlap;
    });

    return {
        hasConflict: Boolean(conflict),
        conflictingBooking: conflict || null,
    };
}

/**
 * Controller to validate a wake space booking selection before it can be added or saved.
 * Prevents choosing occupied dates, overlapping date ranges, past dates, or invalid inputs.
 *
 * @param {Object} params
 * @param {string} params.spaceId
 * @param {string} [params.wake]
 * @param {string} params.startDate - "YYYY-MM-DD"
 * @param {string} [params.endDate] - "YYYY-MM-DD"
 * @param {number} [params.days=1] - number of days
 * @param {Array} [params.existingBookings] - optional list of bookings
 * @param {string} [params.excludeBookingId] - booking to exclude
 * @returns {Promise<{ isValid: boolean, hasConflict: boolean, conflictingBooking: Object|null, errorMessage: string|null }>}
 */
export async function validateWakeSpaceBookingSelectionController({
    spaceId,
    wake = null,
    startDate,
    endDate = null,
    days = 1,
    existingBookings = null,
    excludeBookingId = null,
}) {
    if (!spaceId && !wake) {
        return {
            isValid: false,
            hasConflict: false,
            conflictingBooking: null,
            errorMessage: "Please select a wake space facility.",
        };
    }

    if (!startDate) {
        return {
            isValid: false,
            hasConflict: false,
            conflictingBooking: null,
            errorMessage: "Please select a check-in date from the calendar.",
        };
    }

    const todayStr = getSystemDateISO();
    if (startDate < todayStr) {
        return {
            isValid: false,
            hasConflict: false,
            conflictingBooking: null,
            errorMessage: `Selected check-in date (${startDate}) is in the past. Current system date is ${todayStr}.`,
        };
    }

    const numDays = Math.max(1, Number(days) || 1);
    let resolvedEndDate = endDate;
    if (!resolvedEndDate) {
        const parts = startDate.split("-").map(Number);
        const sDate = new Date(parts[0], parts[1] - 1, parts[2]);
        sDate.setDate(sDate.getDate() + numDays - 1);
        resolvedEndDate = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, "0")}-${String(sDate.getDate()).padStart(2, "0")}`;
    }

    if (startDate > resolvedEndDate) {
        return {
            isValid: false,
            hasConflict: false,
            conflictingBooking: null,
            errorMessage: "Check-in date cannot be after check-out date.",
        };
    }

    // Load bookings if not provided
    const allBookings = existingBookings || (await getWakeSpaceBookings());

    // Check for overlap against existing active or pending bookings
    const conflict = allBookings.find((b) => {
        if (!b) return false;
        if (excludeBookingId && (b.id === excludeBookingId || b.bookingId === excludeBookingId)) {
            return false;
        }
        if (b.status === "cancelled") return false;

        const matchesSpace = isBookingForSpace(b, spaceId, wake);
        if (!matchesSpace) return false;

        // Date overlap check
        return startDate <= b.endDate && resolvedEndDate >= b.startDate;
    });

    if (conflict) {
        const spaceLetter = wake || normalizeWakeSpaceIdentifier(spaceId);
        const spaceLabel = spaceLetter ? `Wake Space ${spaceLetter}` : (spaceId ? `Space ${spaceId}` : "Wake Space");
        const conflictDetails = conflict.deceased
            ? `vigil for ${conflict.deceased}`
            : (conflict.client ? `reserved by ${conflict.client}` : (conflict.bookingId || "occupied"));

        return {
            isValid: false,
            hasConflict: true,
            conflictingBooking: conflict,
            errorMessage: `${spaceLabel} is already occupied from ${conflict.startDate} to ${conflict.endDate} (${conflictDetails}). Please choose an available date.`,
        };
    }

    return {
        isValid: true,
        hasConflict: false,
        conflictingBooking: null,
        errorMessage: null,
    };
}

/**
 * Asserts that a wake space booking selection is available; throws Error if invalid or conflicting.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function assertWakeSpaceBookingAvailableController(params) {
    const res = await validateWakeSpaceBookingSelectionController(params);
    if (!res.isValid) {
        throw new Error(res.errorMessage);
    }
    return res;
}

/**
 * Validates and creates a new Wake Space booking.
 * Calculates initial status based on the current System Date (PHT).
 *
 * @param {Object} data - booking form payload
 * @returns {Promise<{ id: string, bookingId: string, status: string }>}
 */
export async function createWakeSpaceBookingController(data) {
    const { spaceId, wake, startDate, endDate, days, totalPrice } = data;

    // ── Unified Validation & Conflict Check ──
    await assertWakeSpaceBookingAvailableController({
        spaceId,
        wake,
        startDate,
        endDate,
        days,
    });

    const numDays = Math.max(1, Number(days) || 1);

    // ── Compute Status based on active System Date (PHT) ──
    const initialStatus = computeBookingStatus({ startDate, endDate, status: "pending" });

    const payload = {
        ...data,
        days: numDays,
        status: initialStatus,
        totalPrice: Number(totalPrice) || 0,
    };

    const res = await createWakeSpaceBooking(payload);

    // ── Audit Log ──
    try {
        await logAuditEvent({
            module: "Wake Space",
            actionType: "CREATE_BOOKING",
            description: `Booked ${payload.spaceName || `Wake Space ${payload.wake || ""}`} (${payload.spaceId}) for ${numDays} night(s) from ${startDate} to ${endDate}. Status: ${initialStatus}.`,
            targetItem: res.bookingId || res.id,
            details: {
                bookingId: res.bookingId,
                spaceId: payload.spaceId,
                startDate,
                endDate,
                days: numDays,
                status: initialStatus,
                totalPrice: payload.totalPrice,
                client: payload.client || "N/A",
                deceased: payload.deceased || "N/A",
                systemDateAtBooking: getSystemDateISO(),
            },
        });
    } catch (err) {
        console.warn("Could not log audit event for wake space booking:", err);
    }

    // ── Operational Notification ──
    try {
        await createNotification({
            type: "high",
            category: "wake",
            title: `New Vigil Booking: ${payload.spaceName || `Wake Space ${payload.wake || ""}`}`,
            message: `Reservation confirmed for ${payload.deceased || payload.client || "Client"} (${startDate} to ${endDate}, ${numDays} night(s)). Total: ₱${payload.totalPrice.toLocaleString()}.`,
            action_link: "/staff/wake-spaces",
            user_id: "staff",
        });
    } catch (notifErr) {
        console.warn("Could not log notification for wake space booking:", notifErr);
    }

    return {
        id: res.id,
        bookingId: res.bookingId,
        status: initialStatus,
    };
}

/**
 * Synchronizes all active and pending wake space bookings against the active System Date.
 * Updates Firestore documents when a booking's lifecycle status transitions
 * (e.g., pending -> active when check-in arrives, active -> completed when check-out passes).
 *
 * @returns {Promise<{ updatedCount: number, updatedBookings: Array }>}
 */
export async function syncWakeSpaceStatusesController() {
    try {
        const bookings = await getWakeSpaceBookings();
        const currentSystemDate = getSystemDateISO();
        const updated = [];

        for (const b of bookings) {
            // Do not alter cancelled bookings
            if (b.status === "cancelled") continue;

            const expectedStatus = computeBookingStatus(b, currentSystemDate);

            // If the status has changed compared to Firestore
            if (expectedStatus !== b.status) {
                await updateWakeSpaceStatus(b.id, expectedStatus);
                updated.push({
                    id: b.id,
                    bookingId: b.bookingId,
                    spaceId: b.spaceId,
                    oldStatus: b.status,
                    newStatus: expectedStatus,
                    startDate: b.startDate,
                    endDate: b.endDate,
                });
            }
        }

        if (updated.length > 0) {
            console.log(
                `[wakeSpaceController] Auto-synced ${updated.length} booking status(es) against System Date ${currentSystemDate}:`,
                updated
            );

            // Log batch sync audit entry
            try {
                await logAuditEvent({
                    module: "Wake Space",
                    actionType: "SYNC_BOOKING_STATUSES",
                    description: `Auto-synced ${updated.length} booking(s) status against System Date (${currentSystemDate} PHT).`,
                    targetItem: `${updated.length} Bookings`,
                    details: {
                        systemDate: currentSystemDate,
                        changes: updated,
                    },
                });
            } catch (err) {
                console.warn("Could not record audit log for wake space sync:", err);
            }
        }

        return {
            updatedCount: updated.length,
            updatedBookings: updated,
        };
    } catch (error) {
        console.error("Error in syncWakeSpaceStatusesController:", error);
        throw error;
    }
}

/**
 * Calculates availability and next vacant date for a space relative to current system date.
 *
 * @param {Object} space - facility object { id, wake, status, price }
 * @param {Array} bookings - array of existing bookings
 * @param {Date} [systemDate] - Date object (defaults to getSystemDate())
 */
export function getSpaceAvailabilityController(space, bookings = [], systemDate = null) {
    const today = systemDate || getSystemDate();
    today.setHours(0, 0, 0, 0);

    const formatDateISO = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const todayStr = formatDateISO(today);

    const spaceBookings = (bookings || []).filter(
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
}

/**
 * Initializes automatic background synchronization whenever the System Date changes
 * (e.g. via Admin Abuse simulation or live date rollover).
 *
 * @returns {Function} unsubscribe cleanup function
 */
export function initWakeSpaceAutoSync() {
    // Run initial sync on load
    syncWakeSpaceStatusesController().catch((err) => {
        console.warn("Initial wake space status sync error:", err);
    });

    // Listen for date overrides / resets
    return subscribeSystemDate(() => {
        syncWakeSpaceStatusesController().catch((err) => {
            console.warn("Wake space date change sync error:", err);
        });
    });
}
