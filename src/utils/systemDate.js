/**
 * System Date & Time Management with Philippines Standard Time (PST / PHT, UTC+8)
 *
 * Driven by Firestore: "system_collection" (document: "system_date").
 * - Does NOT depend on local browser variables.
 * - Entirely driven by Firestore "system_collection".
 * - When the collection document is deleted or reset, the system immediately stays normal (real Philippines Time).
 */

import {
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";

export const SYSTEM_COLLECTION = "system_collection";
export const SYSTEM_DOC_ID = "system_date";

const EVENT_NAME = "cherubim-system-date-changed";

// In-memory cache synced in real time from Firestore system_collection
let cachedOverride = null;
const listeners = new Set();

function notifyListeners() {
    const info = getSystemDateOverrideInfo();
    listeners.forEach((cb) => {
        try {
            cb(info);
        } catch (err) {
            console.warn("[systemDate] Listener callback error:", err);
        }
    });
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: info }));
    }
}

// Clean up any old localStorage variables so the system depends purely on system_collection
if (typeof window !== "undefined") {
    try {
        localStorage.removeItem("cherubim_system_date_override");
    } catch {}
}

// Real-time Firestore listener for system_collection/system_date
if (typeof window !== "undefined" && db) {
    onSnapshot(
        doc(db, SYSTEM_COLLECTION, SYSTEM_DOC_ID),
        (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data && data.isOverridden && data.simulatedDate) {
                    cachedOverride = {
                        isOverridden: true,
                        date: data.simulatedDate,
                        time: data.simulatedTime || "00:00:00",
                        setAt: data.setAt || data.updatedAtISO || new Date().toISOString(),
                        note: data.note || "Simulated via Admin Configuration",
                        updatedBy: data.updatedBy || "Admin",
                    };
                } else {
                    // Document exists but marked not overridden -> stay normal
                    cachedOverride = null;
                }
            } else {
                // Document deleted or does not exist in system_collection -> stay 100% normal!
                cachedOverride = null;
            }
            notifyListeners();
        },
        (err) => {
            console.warn("[systemDate] system_collection listener fallback to normal:", err);
            cachedOverride = null;
            notifyListeners();
        }
    );
}

/**
 * Returns the real current date and time in the Philippines (Asia/Manila)
 */
export function getRealPhilippineDate() {
    const now = new Date();
    const phtStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
    return new Date(phtStr);
}

/**
 * Returns today's real date in Philippines formatted as "YYYY-MM-DD"
 */
export function getRealPhilippineISO() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/**
 * Returns today's real time in Philippines formatted as "HH:mm:ss"
 */
export function getRealPhilippineTimeISO() {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(new Date());
}

/**
 * Formats a Date object in Philippines Time for display
 */
export function formatPhilippineDateTime(date = new Date()) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        dateStyle: "full",
        timeStyle: "medium",
    }).format(date);
}

/**
 * Checks whether the system date is currently overridden in system_collection
 */
export function isSystemDateOverridden() {
    return cachedOverride !== null && Boolean(cachedOverride.isOverridden);
}

/**
 * Returns full details of the active override from system_collection, or real time if normal
 */
export function getSystemDateOverrideInfo() {
    if (!cachedOverride || !cachedOverride.isOverridden) {
        return {
            isOverridden: false,
            source: "system_collection (normal)",
            realDate: getRealPhilippineISO(),
            realTime: getRealPhilippineTimeISO(),
            activeDate: getRealPhilippineISO(),
            activeTime: getRealPhilippineTimeISO(),
        };
    }

    return {
        isOverridden: true,
        source: "system_collection",
        overrideDate: cachedOverride.date, // "YYYY-MM-DD"
        overrideTime: cachedOverride.time || "00:00:00", // "HH:mm:ss"
        setAt: cachedOverride.setAt,
        note: cachedOverride.note || "Simulated via Admin Configuration",
        updatedBy: cachedOverride.updatedBy || "Admin",
        realDate: getRealPhilippineISO(),
        realTime: getRealPhilippineTimeISO(),
        activeDate: cachedOverride.date,
        activeTime: cachedOverride.time || "00:00:00",
        activeTimestamp: getSystemDate().getTime(),
    };
}

/**
 * Returns the current active system Date (simulated if system_collection is active, else real PHT Date)
 */
export function getSystemDate() {
    if (!cachedOverride || !cachedOverride.isOverridden || !cachedOverride.date) {
        return getRealPhilippineDate();
    }
    const [y, m, d] = cachedOverride.date.split("-").map(Number);
    const [hh, mm, ss] = (cachedOverride.time || "00:00:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

/**
 * Returns the current active system date as "YYYY-MM-DD"
 */
export function getSystemDateISO() {
    if (cachedOverride && cachedOverride.isOverridden && cachedOverride.date) {
        return cachedOverride.date;
    }
    return getRealPhilippineISO();
}

/**
 * Returns the current active system time as "HH:mm:ss"
 */
export function getSystemTimeISO() {
    if (cachedOverride && cachedOverride.isOverridden && cachedOverride.time) {
        return cachedOverride.time.slice(0, 8);
    }
    return getRealPhilippineTimeISO();
}

/**
 * Sets a system date override directly in Firestore "system_collection" (document: "system_date")
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} [timeStr] - "HH:mm" or "HH:mm:ss"
 * @param {string} [note] - optional reason/note
 * @param {string} [updatedBy] - user who set the override
 */
export async function setSystemDateOverride(dateStr, timeStr = "00:00:00", note = "", updatedBy = "Admin") {
    if (!dateStr) return;
    const formattedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    const payload = {
        isOverridden: true,
        simulatedDate: dateStr,
        simulatedTime: formattedTime,
        timezone: "Asia/Manila (UTC+8)",
        note: note || "Set via Admin Configuration",
        updatedBy: updatedBy || "Admin",
        updatedAt: serverTimestamp(),
        updatedAtISO: new Date().toISOString(),
    };

    // Update in-memory immediately for instant feedback
    cachedOverride = {
        isOverridden: true,
        date: dateStr,
        time: formattedTime,
        setAt: payload.updatedAtISO,
        note: payload.note,
        updatedBy: payload.updatedBy,
    };
    notifyListeners();

    // Persist to Firestore system_collection
    try {
        await setDoc(doc(db, SYSTEM_COLLECTION, SYSTEM_DOC_ID), payload);
    } catch (err) {
        console.error("[systemDate] Failed to save to system_collection:", err);
        throw err;
    }
}

/**
 * Resets the system date back to normal by deleting the system_collection document.
 * When deleted, the system immediately stays normal (real Philippines Time).
 */
export async function resetSystemDate() {
    // Reset in-memory immediately
    cachedOverride = null;
    notifyListeners();

    // Delete document from Firestore system_collection
    try {
        await deleteDoc(doc(db, SYSTEM_COLLECTION, SYSTEM_DOC_ID));
    } catch (err) {
        console.warn("[systemDate] deleteDoc failed on system_collection, setting isOverridden=false:", err);
        try {
            await setDoc(doc(db, SYSTEM_COLLECTION, SYSTEM_DOC_ID), {
                isOverridden: false,
                updatedAt: serverTimestamp(),
            });
        } catch (e) {
            console.error("[systemDate] Error resetting system_collection:", e);
            throw e;
        }
    }
}

/**
 * Explicit alias to delete the admin abuse document from system_collection.
 * Guarantees that no internal variable persists and the system stays normal.
 */
export async function deleteSystemDateOverride() {
    return resetSystemDate();
}

/**
 * Subscribes to system date changes (fires whenever system_collection updates in Firestore)
 * @param {Function} callback - called with override info
 * @returns {Function} unsubscribe function
 */
export function subscribeSystemDate(callback) {
    listeners.add(callback);
    // Call immediately with current state
    try {
        callback(getSystemDateOverrideInfo());
    } catch (err) {
        console.warn("[systemDate] Initial subscription callback error:", err);
    }

    return () => {
        listeners.delete(callback);
    };
}
