import {
    collection,
    doc,
    addDoc,
    setDoc,
    getDocs,
    getDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    query,
    orderBy,
    where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { logAuditEvent } from "../utils/auditLogger";

const COLLECTION = "wakeSpaceRental";
const WAKE_SPACE_COLLECTION = "wake_space";

// ── ID generator ──────────────────────────────────────────────────────────────
export function generateNextBookingId(existingBookings = []) {
    let maxNum = 0;
    existingBookings.forEach((b) => {
        const idStr = String(b.bookingId || "").trim().toUpperCase();
        const match = idStr.match(/^WB(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });
    return `WB${String(maxNum + 1).padStart(3, "0")}`;
}

// ── Create booking (used by WakeSpace page & POS) ─────────────────────────────
/**
 * @param {Object} data
 * @param {string} data.startDate   – "YYYY-MM-DD"
 * @param {string} data.endDate     – "YYYY-MM-DD"
 * @param {number} data.days        – number of nights
 * @param {string} [data.status]    – defaults to "pending"
 * @param {string} [data.spaceId]   – e.g. "WS001"
 * @param {string} [data.deceased]  – name of deceased
 * @param {string} [data.client]    – name of client
 * @param {number} [data.totalPrice]
 */
export async function createWakeSpaceBooking(data) {
    try {
        const existing = await getWakeSpaceBookings();
        const bookingId = generateNextBookingId(existing);

        const docRef = await addDoc(collection(db, COLLECTION), {
            bookingId,
            startDate: data.startDate ?? "",
            endDate: data.endDate ?? "",
            days: Number(data.days) ?? 1,
            status: data.status ?? "pending",
            spaceId: data.spaceId ?? "",
            deceased: data.deceased ?? "",
            client: data.client ?? "",
            totalPrice: data.totalPrice ?? 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        return { id: docRef.id, bookingId };
    } catch (error) {
        console.error("Error creating wake space booking:", error);
        throw error;
    }
}

// ── Read all bookings (one-time fetch) ────────────────────────────────────────
export async function getWakeSpaceBookings() {
    try {
        const snap = await getDocs(query(collection(db, COLLECTION), orderBy("createdAt", "desc")));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("Error fetching wake space bookings:", error);
        throw error;
    }
}

// ── Read single booking ───────────────────────────────────────────────────────
export async function getWakeSpaceBookingById(docId) {
    try {
        const snap = await getDoc(doc(db, COLLECTION, docId));
        if (!snap.exists()) throw new Error("Booking not found");
        return { id: snap.id, ...snap.data() };
    } catch (error) {
        console.error("Error fetching booking:", error);
        throw error;
    }
}

// ── Live listener (used by WakeSpace calendar) ────────────────────────────────
/**
 * @param {Function} onData  – callback receives array of bookings
 * @returns unsubscribe function
 */
export function subscribeWakeSpaceBookings(onData, onError) {
    const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
    return onSnapshot(
        q,
        (snap) => {
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            onData(data);
        },
        (err) => {
            console.error("Error in subscribeWakeSpaceBookings:", err);
            if (onError) onError(err);
        }
    );
}

// ── Update booking status ─────────────────────────────────────────────────────
export async function updateWakeSpaceStatus(docId, status) {
    try {
        await updateDoc(doc(db, COLLECTION, docId), {
            status,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error updating wake space status:", error);
        throw error;
    }
}

// ── Update any fields on a booking ───────────────────────────────────────────
export async function updateWakeSpaceBooking(docId, fields) {
    try {
        await updateDoc(doc(db, COLLECTION, docId), {
            ...fields,
            updatedAt: serverTimestamp(),
        });

        // Audit Log
        try {
            await logAuditEvent({
                module: "Wake Space",
                actionType: "UPDATE_BOOKING",
                description: `Updated wake space booking details (${fields.bookingId || docId})`,
                targetItem: fields.bookingId || docId,
                details: fields
            });
        } catch (auditErr) {
            console.warn("Could not log audit event for wake space update:", auditErr);
        }
    } catch (error) {
        console.error("Error updating wake space booking:", error);
        throw error;
    }
}

// ── Delete booking ────────────────────────────────────────────────────────────
export async function deleteWakeSpaceBooking(docId) {
    try {
        await deleteDoc(doc(db, COLLECTION, docId));

        // Audit Log
        try {
            await logAuditEvent({
                module: "Wake Space",
                actionType: "DELETE_BOOKING",
                description: `Deleted wake space booking (${docId})`,
                targetItem: docId,
                details: { docId }
            });
        } catch (auditErr) {
            console.warn("Could not log audit event for wake space deletion:", auditErr);
        }
    } catch (error) {
        console.error("Error deleting wake space booking:", error);
        throw error;
    }
}

// ── Get bookings for a date range (useful for availability check in POS) ──────
/**
 * Returns all bookings whose date range overlaps [startDate, endDate]
 * @param {string} startDate – "YYYY-MM-DD"
 * @param {string} endDate   – "YYYY-MM-DD"
 */
export async function getBookingsInRange(startDate, endDate) {
    try {
        // Bookings that start before endDate AND end after startDate
        const snap = await getDocs(
            query(
                collection(db, COLLECTION),
                where("startDate", "<=", endDate),
                where("endDate", ">=", startDate)
            )
        );
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("Error fetching bookings in range:", error);
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WAKE SPACE FACILITIES (collection: "wake_space")
// Manages the 3 physical wake spaces: A, B, C
// Document IDs: WAS-001, WAS-002, WAS-003
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all wake space facilities (one-time)
 */
export async function getWakeSpaces() {
    try {
        const snap = await getDocs(collection(db, WAKE_SPACE_COLLECTION));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.error("Error fetching wake spaces:", error);
        throw error;
    }
}

/**
 * Live listener for wake space facilities
 * @param {Function} onData – callback receives array of wake spaces
 * @returns unsubscribe function
 */
export function subscribeWakeSpaces(onData, onError) {
    return onSnapshot(
        collection(db, WAKE_SPACE_COLLECTION),
        (snap) => {
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            onData(data);
        },
        (err) => {
            console.error("Error in subscribeWakeSpaces:", err);
            if (onError) onError(err);
        }
    );
}

/**
 * Update a wake space facility (e.g. change status or price)
 */
export async function updateWakeSpace(wakeSpaceId, fields) {
    try {
        await updateDoc(doc(db, WAKE_SPACE_COLLECTION, wakeSpaceId), {
            ...fields,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error updating wake space:", error);
        throw error;
    }
}
