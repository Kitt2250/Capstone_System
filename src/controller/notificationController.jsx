/**
 * Notification Controller
 *
 * Implements business logic, operational alert generation, status metrics,
 * and category filtering adhering strictly to the notification schema.
 */

import {
    createNotification,
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearReadNotifications
} from "../services/notificationServices";
import { getSystemDate, getSystemDateISO, getSystemDateOverrideInfo, subscribeSystemDate } from "../utils/systemDate";
import { getWakeSpaceBookings } from "../services/wakeSpaceServices";
import { getPayments } from "../services/paymentServices";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getSystemTimeISO } from "../utils/systemDate";
import { db } from "../firebase/config";
import logAuditEvent from "../utils/auditLogger";

/**
 * Calculates or extracts next payment due date, using fallback calculation if not stored.
 */
function extractDueDate(p) {
    let raw = p.due_date || p.next_due_date || p.dueDate || p.nextDue || null;
    if (raw) {
        if (typeof raw === "object" && raw.toDate) {
            try {
                return raw.toDate().toISOString().split("T")[0];
            } catch {}
        }
        if (typeof raw === "string") {
            return raw.split("T")[0];
        }
    }

    let base = null;
    if (p.last_payment_date) {
        base = new Date(p.last_payment_date);
    } else if (p.created_at?.toDate) {
        base = p.created_at.toDate();
    } else if (p.createdAt) {
        base = new Date(p.createdAt);
    }

    if (base && !isNaN(base.getTime())) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }
    return null;
}

/**
 * Resolves the client's human-readable name from linked collections.
 */
function resolveClientName(p, clients = [], plots = [], burials = [], users = []) {
    // 1. If explicit client name exists on payment
    if (p.client_name?.trim()) return p.client_name.trim();
    if (p.clientName?.trim()) return p.clientName.trim();

    // 2. Linked plot & burials
    const plot = plots.find((plt) => plt.id === p.plot_id);
    const plotBurials = burials.filter(
        (b) => b.plot_id === p.plot_id || b.id === p.burial_id
    );

    // 3. User / Client ID
    const ownerId = p.user_id || plot?.user_id || plotBurials[0]?.user_id;

    if (ownerId) {
        const client = clients.find(
            (c) => c.user_id === ownerId || c.id === ownerId
        );
        if (client) {
            const first = client.first_name || client.firstName || "";
            const last = client.last_name || client.lastName || "";
            const fullName = `${first} ${last}`.trim();
            if (fullName) return fullName;
            if (client.name?.trim()) return client.name.trim();
        }

        const u = users.find((usr) => usr.id === ownerId || usr.uid === ownerId);
        if (u?.name?.trim()) return u.name.trim();
    }

    // 4. Plot owner string
    if (plot?.owner?.trim()) {
        return plot.owner.trim();
    }

    // 5. Burial deceased family
    if (plotBurials.length > 0 && plotBurials[0].name?.trim()) {
        return `${plotBurials[0].name.trim()} (Family)`;
    }

    // 6. Readable Plot Code (e.g. Lot A-12)
    if (plot?.plotCode) {
        return `Lot ${plot.plotCode}`;
    }

    return "Client Account";
}

/**
 * Validates and creates a new notification.
 */
export async function createNotificationController(data) {
    if (!data.title?.trim()) {
        throw new Error("Notification title is required.");
    }
    if (!data.message?.trim()) {
        throw new Error("Notification message is required.");
    }

    const validTypes = ["urgent", "high", "medium", "low", "info"];
    const type = validTypes.includes(data.type) ? data.type : "info";

    const validCategories = ["installment", "wake", "payments", "renewals", "system"];
    const category = validCategories.includes(data.category) ? data.category : "system";

    const res = await createNotification({
        ...data,
        type,
        category,
    });

    try {
        await logAuditEvent({
            module: "Notifications",
            actionType: "CREATE_NOTIFICATION",
            description: `Generated ${type.toUpperCase()} notification (${category}): ${data.title}`,
            targetItem: String(res.notification_id),
            details: { ...data, type, category },
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for notification:", auditErr);
    }

    return res;
}

/**
 * Marks a notification as read.
 */
export async function markNotificationReadController(id) {
    if (!id) return;
    return await markNotificationAsRead(id);
}

/**
 * Marks all notifications as read.
 */
export async function markAllNotificationsReadController(notifications) {
    return await markAllNotificationsAsRead(notifications);
}

/**
 * Deletes a notification.
 */
export async function deleteNotificationController(id) {
    if (!id) return;
    return await deleteNotification(id);
}

/**
 * Clears all read notifications.
 */
export async function clearReadNotificationsController(notifications) {
    return await clearReadNotifications(notifications);
}

/**
 * Computes live statistics across a list of notifications.
 */
export function computeNotificationStats(notifications = []) {
    const total = notifications.length;
    const unread = notifications.filter((n) => !n.is_read).length;
    const urgent = notifications.filter((n) => !n.is_read && (n.type === "urgent" || n.type === "high")).length;

    const byCategory = {
        all: total,
        wake: 0,
        installment: 0,
        payments: 0,
        renewals: 0,
        system: 0,
    };

    notifications.forEach((n) => {
        const cat = String(n.category || "system").toLowerCase();
        if (byCategory[cat] !== undefined) {
            byCategory[cat]++;
        } else {
            byCategory.system++;
        }
    });

    return {
        total,
        unread,
        urgent,
        byCategory,
    };
}

const recentDispatchedAlerts = new Map(); // runKey -> timestamp

/**
 * Emits an operational notification.
 * - Prevents rapid concurrent duplicates within the same 4 seconds (from racing listeners/promises).
 * - In real-life mode (forceNotify=false), ensures an alert is issued once per day per event (no duplicates on page refresh).
 * - When forceNotify is true (active simulation test), ALWAYS generates/repeats the notification!
 * - Guarantees that repeating simulations and real-life scenarios ALWAYS notify.
 */
async function emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts = []) {
    const now = Date.now();
    const lastDispatched = recentDispatchedAlerts.get(runKey) || 0;

    // Suppress rapid race-condition concurrent duplicates (within 4000ms),
    // UNLESS forceNotify is explicitly set by a user date-change action.
    if (!forceNotify && (now - lastDispatched < 4000)) {
        return false;
    }

    // In normal real-time mode (without explicit forceNotify simulation),
    // verify if this event was already created today in Firestore to prevent duplicate cards on browser refresh.
    if (!forceNotify && existingAlerts.length > 0) {
        const todayStr = notifData.simulated_date;
        const alreadyExistsToday = existingAlerts.some((n) => {
            const sameCat = n.category === notifData.category;
            const sameTitle = n.title === notifData.title;
            const sameItem = (notifData.booking_id && n.booking_id === notifData.booking_id) ||
                             (notifData.payment_id && n.payment_id === notifData.payment_id) ||
                             (notifData.plot_id && n.plot_id === notifData.plot_id);

            let nDate = n.simulated_date || "";
            if (!nDate && n.created_at) {
                try { nDate = new Date(n.created_at).toISOString().split("T")[0]; } catch {}
            }
            return sameCat && (sameItem || sameTitle) && (nDate === todayStr);
        });

        if (alreadyExistsToday) {
            return false;
        }
    }

    recentDispatchedAlerts.set(runKey, now);
    try {
        await createNotification(notifData);
        return true;
    } catch (err) {
        console.warn("Failed to create operational alert:", err);
        return false;
    }
}

let isSyncingOperationalAlerts = false;
let syncQueued = false;
let lastSyncTimestamp = 0;

/**
 * Scans active wake spaces and operational payment records against the active system date,
 * generating smart system alerts if not already issued for this simulation run.
 */
export async function syncOperationalAlertsController(currentNotifications = [], options = {}) {
    const { forceNotify = false } = options;
    const now = Date.now();

    // Prevent redundant sync runs within 2s unless explicitly forced by simulation action
    if (!forceNotify && now - lastSyncTimestamp < 2000) {
        return 0;
    }

    if (isSyncingOperationalAlerts) {
        syncQueued = true;
        return 0;
    }
    isSyncingOperationalAlerts = true;

    try {
        const todayStr = getSystemDateISO();
        const overrideInfo = getSystemDateOverrideInfo();
        const isSimulated = Boolean(overrideInfo?.isOverridden);

        const simTimestamp = overrideInfo?.setAt || `${overrideInfo?.activeDate || todayStr}_${overrideInfo?.activeTime || "00:00:00"}`;
        const currentSimKey = isSimulated
            ? (forceNotify ? `sim_${simTimestamp}_${now}` : `sim_${simTimestamp}`)
            : `normal_${todayStr}`;

        const rawAlerts = currentNotifications.length > 0 ? currentNotifications : await getNotifications();

        // 0. Auto-clean rapid concurrent race-condition duplicates (created at the exact same moment)
        const seenRecords = [];
        const existingAlerts = [];
        for (const n of rawAlerts) {
            const cleanTitle = (n.title || "").trim().toLowerCase();
            const cleanMsg = (n.message || "").trim().toLowerCase();
            const nTime = n.created_at ? new Date(n.created_at).getTime() : 0;
            const nSimKey = n.simulation_key || "";

            const isRapidDuplicate = seenRecords.some((prev) => {
                const sameContent = prev.cleanTitle === cleanTitle && prev.cleanMsg === cleanMsg;
                if (!sameContent) return false;
                if (nSimKey && prev.simKey) {
                    return nSimKey === prev.simKey;
                }
                return nTime && prev.time && Math.abs(nTime - prev.time) < 3000;
            });

            if (isRapidDuplicate) {
                try {
                    await deleteNotification(n.id);
                } catch (_) {}
            } else {
                seenRecords.push({ cleanTitle, cleanMsg, time: nTime, simKey: nSimKey });
                existingAlerts.push(n);
            }
        }

        let createdCount = 0;
        const createdInThisRun = new Set();

        // 1. Check Wake Space Vigils for today or overdue
        const bookings = await getWakeSpaceBookings();

        for (const b of bookings) {
            if (b.status === "cancelled") continue;

            const spaceName = b.spaceName || `Wake Space ${b.wake || ""}`;
            const deceasedName = b.deceased || "Family Vigil";
            const bStart = b.startDate ? String(b.startDate).split("T")[0] : "";
            const bEnd = b.endDate ? String(b.endDate).split("T")[0] : "";

            // A) Vigil Check-in Today
            if (bStart === todayStr) {
                const runKey = `wake_${b.id}_checkin_${todayStr}`;
                if (!createdInThisRun.has(runKey)) {
                    createdInThisRun.add(runKey);

                    const notifData = {
                        type: "high",
                        category: "wake",
                        title: `Vigil Check-In: ${spaceName}`,
                        message: `Scheduled check-in today (${todayStr}) for ${deceasedName}. Facility is active.`,
                        action_link: "/staff/wake-spaces",
                        user_id: "staff",
                        booking_id: b.id,
                        space_name: spaceName,
                        simulated_date: todayStr,
                        is_simulation: isSimulated,
                        simulation_key: currentSimKey,
                    };

                    if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                        createdCount++;
                    }
                }
            }

            // B) Vigil Checkout / Concludes Today
            if (bEnd === todayStr) {
                const runKey = `wake_${b.id}_checkout_${todayStr}`;
                if (!createdInThisRun.has(runKey)) {
                    createdInThisRun.add(runKey);

                    const notifData = {
                        type: "urgent",
                        category: "wake",
                        title: `Vigil Checkout Today: ${spaceName}`,
                        message: `Vigil for ${deceasedName} concludes today (${todayStr}). Please inspect room for turnover.`,
                        action_link: "/staff/wake-spaces",
                        user_id: "staff",
                        booking_id: b.id,
                        space_name: spaceName,
                        simulated_date: todayStr,
                        is_simulation: isSimulated,
                        simulation_key: currentSimKey,
                    };

                    if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                        createdCount++;
                    }
                }
            }

            // C) Vigil Overdue Checkout (Simulated past checkout date, and booking not cancelled)
            if (bEnd && bEnd < todayStr && b.status !== "cancelled") {
                const runKey = `wake_${b.id}_overdue_${todayStr}`;
                if (!createdInThisRun.has(runKey)) {
                    createdInThisRun.add(runKey);

                    const notifData = {
                        type: "urgent",
                        category: "wake",
                        title: `Overdue Checkout: ${spaceName}`,
                        message: `Vigil for ${deceasedName} concluded on ${bEnd}. Please inspect room for turnover.`,
                        action_link: "/staff/wake-spaces",
                        user_id: "staff",
                        booking_id: b.id,
                        space_name: spaceName,
                        simulated_date: todayStr,
                        is_simulation: isSimulated,
                        simulation_key: currentSimKey,
                    };

                    if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                        createdCount++;
                    }
                }
            }
        }

        // 2. Check Installment Payments due today or overdue
        let payments = [];
        let clients = [];
        let plots = [];
        let burials = [];
        let users = [];
        let graveTypes = [];

        try {
            payments = await getPayments();
        } catch (e) {
            console.warn("Could not fetch payments:", e);
        }

        try {
            const snap = await getDocs(collection(db, "clients"));
            clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {}

        try {
            const snap = await getDocs(collection(db, "plots"));
            plots = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {}

        try {
            const snap = await getDocs(collection(db, "burials"));
            burials = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {}

        try {
            const snap = await getDocs(collection(db, "users"));
            users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {}

        try {
            const snap = await getDocs(collection(db, "grave_types"));
            graveTypes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            if (graveTypes.length === 0) {
                const snap2 = await getDocs(collection(db, "grave_type"));
                graveTypes = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
        } catch (e) {}

        try {
            const sysDate = getSystemDate();
            const sysHour = sysDate.getHours();
            const isPastCutoffToday = sysHour >= 18;

            for (const p of payments) {
                const balance = Number(p.balance || 0);
                if (balance <= 0 || p.payment_status === "paid") continue;

                const dueDate = extractDueDate(p);
                if (!dueDate) continue;

                const clientName = resolveClientName(p, clients, plots, burials, users);
                const plot = plots.find((plt) => plt.id === p.plot_id);
                const lotTag = plot?.plotCode ? ` (Lot ${plot.plotCode})` : "";

                // Calculate installment monthly amount
                let monthlyAmt = Number(p.monthly_amount || p.monthly_installment || 0);
                if (!monthlyAmt || monthlyAmt <= 0) {
                    if (p.total && Number(p.total) > 0) {
                        monthlyAmt = Math.round(Number(p.total) / 12);
                    } else if (balance > 0) {
                        monthlyAmt = Math.round(balance / 6);
                    }
                }
                if (balance > 0 && monthlyAmt > balance) {
                    monthlyAmt = balance;
                }

                const isOverdue = (dueDate < todayStr) || (dueDate === todayStr && isPastCutoffToday) || p.payment_status === "overdue";
                const isDueToday = (dueDate === todayStr && !isPastCutoffToday && p.payment_status !== "overdue");

                // A) Overdue Installment (Due date has passed or past 6 PM today)
                if (isOverdue) {
                    const runKey = `installment_${p.id || p.plot_id}_overdue_${todayStr}`;
                    if (!createdInThisRun.has(runKey)) {
                        createdInThisRun.add(runKey);

                        const notifData = {
                            type: "urgent",
                            category: "installment",
                            title: `Overdue Installment: ${clientName}`,
                            message: `Payment for ${clientName}${lotTag} is overdue since ${dueDate}. Installment Due: ₱${monthlyAmt.toLocaleString()} | Remaining Balance: ₱${balance.toLocaleString()}. Please follow up with client.`,
                            action_link: "/staff/payments",
                            user_id: "staff",
                            family_user_id: p.user_id || "",
                            payment_id: p.id,
                            plot_id: p.plot_id || "",
                            balance,
                            monthly_amount: monthlyAmt,
                            client_name: clientName,
                            due_date: dueDate,
                            simulated_date: todayStr,
                            is_simulation: isSimulated,
                            simulation_key: currentSimKey,
                        };

                        if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                            createdCount++;
                        }
                    }
                }
                // B) Installment Due Today (Due date is today and within office hours)
                else if (isDueToday) {
                    const runKey = `installment_${p.id || p.plot_id}_due_${todayStr}`;
                    if (!createdInThisRun.has(runKey)) {
                        createdInThisRun.add(runKey);

                        const notifData = {
                            type: "high",
                            category: "installment",
                            title: `Installment Due Today: ${clientName}`,
                            message: `Installment payment for ${clientName}${lotTag} is due today (${todayStr}). Installment Due: ₱${monthlyAmt.toLocaleString()} | Remaining Balance: ₱${balance.toLocaleString()}.`,
                            action_link: "/staff/payments",
                            user_id: "staff",
                            family_user_id: p.user_id || "",
                            payment_id: p.id,
                            plot_id: p.plot_id || "",
                            balance,
                            monthly_amount: monthlyAmt,
                            client_name: clientName,
                            due_date: dueDate,
                            simulated_date: todayStr,
                            is_simulation: isSimulated,
                            simulation_key: currentSimKey,
                        };

                        if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                            createdCount++;
                        }
                    }
                }
            }
        } catch (payErr) {
            console.warn("Could not scan payments for operational alerts:", payErr);
        }

        // 3. Check Contract Renewals: 1 Renewal Contract Per Grave Plot (7-year term, ₱3,500/yr renewal)
        try {
            const sixtyDaysFromNow = new Date(todayStr);
            sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);
            const sixtyDaysStr = sixtyDaysFromNow.toISOString().split("T")[0];

            // Filter contracted / owned / occupied plots
            const contractedPlots = plots.filter((plt) => {
                const hasOwner = Boolean(plt.user_id || plt.owner);
                const isOccupiedOrReserved = plt.status === "occupied" || plt.status === "reserved" || plt.status === "partial";
                const hasContract = Boolean(plt.contract || plt.contract_expiration_date || plt.contract_years);
                const hasBurials = burials.some((b) => b.plot_id === plt.id);
                return hasOwner || isOccupiedOrReserved || hasContract || hasBurials;
            });

            for (const plt of contractedPlots) {
                // Match grave type
                const targetTypeId = String(plt?.grave_type_id || plt?.graveLotTypeID || plt?.graveType || plt?.type || "").trim().toLowerCase();
                const matchedType = graveTypes.find((gt) => {
                    const gtId = String(gt.id || gt.grave_type_id || "").trim().toLowerCase();
                    const gtName = String(gt.grave_type || gt.name || "").trim().toLowerCase();
                    return (gtId && gtId === targetTypeId) || (targetTypeId && gtName === targetTypeId);
                });

                // Check if renewable or perpetual
                const isPerpetual =
                    plt?.contract === "Perpetual" ||
                    plt?.contract_type === "Perpetual" ||
                    plt?.is_perpetual === true ||
                    (matchedType && (matchedType.renewable === false || matchedType.contract === "Perpetual" || String(matchedType.contract || "").toLowerCase().includes("perpetual")));

                if (isPerpetual) continue;

                // Initial Lease Term: 7 Years
                const contractYears = Number(
                    plt?.contract_years ||
                    matchedType?.contract_years ||
                    7
                );

                // Burials in this plot
                const plotBurials = burials.filter((b) => b.plot_id === plt.id);
                const deceasedNames = plotBurials.map((b) => b.name).filter(Boolean);
                const deceasedDisplay = deceasedNames.length > 0 ? deceasedNames.join(", ") : "Reserved Lot";

                // Start date: plot contract date or earliest burial date
                let startStr = plt?.contract_start_date;
                if (!startStr && plotBurials.length > 0) {
                    const sortedDates = plotBurials.map((b) => b.date_buried).filter(Boolean).sort();
                    if (sortedDates.length > 0) startStr = sortedDates[0];
                }
                if (!startStr) {
                    startStr = "2021-10-01";
                }

                // Expiration date
                let expStr = plt?.contract_expiration_date;
                if (!expStr && startStr) {
                    const parts = startStr.split("-");
                    if (parts.length === 3) {
                        const expYear = parseInt(parts[0], 10) + contractYears;
                        expStr = `${expYear}-${parts[1]}-${parts[2]}`;
                    }
                }

                if (!expStr) continue;

                const clientName = resolveClientName({ plot_id: plt?.id, user_id: plt?.user_id }, clients, plots, burials, users);
                const plotCode = plt?.plotCode || plt?.id || "Plot";

                // A) Expired Contract (7-year term ended or 0 days left)
                if (expStr <= todayStr) {
                    const runKey = `renewal_${plt.id}_expired_${todayStr}`;
                    if (!createdInThisRun.has(runKey)) {
                        createdInThisRun.add(runKey);

                        const notifData = {
                            type: "urgent",
                            category: "renewals",
                            title: `Lease Expired: Lot ${plotCode}`,
                            message: `7-year grave lot lease for Lot ${plotCode} (${deceasedDisplay}) expired on ${expStr}. Renewal rate: ₱3,500/year (Cash only). Please contact the family (${clientName}) to process renewal.`,
                            action_link: "/staff/renewals",
                            user_id: "staff",
                            plot_id: plt?.id || "",
                            client_name: clientName,
                            expiration_date: expStr,
                            simulated_date: todayStr,
                            is_simulation: isSimulated,
                            simulation_key: currentSimKey,
                        };

                        if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                            createdCount++;
                        }
                    }
                }
                // B) Expiring Soon (Within 60 days of 7-year term end)
                else if (expStr <= sixtyDaysStr) {
                    const runKey = `renewal_${plt.id}_expiring_${todayStr}`;
                    if (!createdInThisRun.has(runKey)) {
                        createdInThisRun.add(runKey);
                        const diffDays = Math.ceil((new Date(expStr).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24));

                        const notifData = {
                            type: "high",
                            category: "renewals",
                            title: `Lease Expiring Soon: Lot ${plotCode}`,
                            message: `Grave lot lease for Lot ${plotCode} (${deceasedDisplay}) expires in ${diffDays} day(s) on ${expStr}. Renewal rate: ₱3,500/year (Cash only). Please notify the family (${clientName}).`,
                            action_link: "/staff/renewals",
                            user_id: "staff",
                            plot_id: plt?.id || "",
                            client_name: clientName,
                            expiration_date: expStr,
                            simulated_date: todayStr,
                            is_simulation: isSimulated,
                            simulation_key: currentSimKey,
                        };

                        if (await emitOperationalAlert(runKey, notifData, forceNotify, existingAlerts)) {
                            createdCount++;
                        }
                    }
                }
            }
        } catch (renewScanErr) {
            console.warn("Could not scan plots for contract renewal alerts:", renewScanErr);
        }

        return createdCount;
    } catch (err) {
        console.warn("Could not sync operational alerts:", err);
        return 0;
    } finally {
        isSyncingOperationalAlerts = false;
        lastSyncTimestamp = Date.now();
        if (syncQueued) {
            syncQueued = false;
            setTimeout(() => {
                syncOperationalAlertsController().catch(() => {});
            }, 400);
        }
    }
}

/**
 * Initializes automatic background synchronization for operational alerts
 * (installment due dates, overdue notices, wake vigils).
 * Listens for system date changes and executes seamlessly across the app.
 *
 * @returns {Function} unsubscribe cleanup function
 */
export function initOperationalAlertsAutoSync() {
    let debounceTimer = null;
    let lastSimulatedStamp = null;

    // Run initial sync on application mount
    syncOperationalAlertsController().catch((err) => {
        console.warn("Initial operational alerts sync error:", err);
    });

    // Re-run sync whenever System Date changes or is overridden (debounced 400ms)
    return subscribeSystemDate((info) => {
        const currentStamp = info?.activeTimestamp || (info?.isOverridden ? `${info?.overrideDate}_${info?.overrideTime}` : "normal");
        const dateChanged = lastSimulatedStamp !== null && lastSimulatedStamp !== currentStamp;
        lastSimulatedStamp = currentStamp;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            syncOperationalAlertsController([], { forceNotify: dateChanged }).catch((err) => {
                console.warn("System date change alert sync error:", err);
            });
        }, 400);
    });
}

