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
import { getSystemDateISO, subscribeSystemDate } from "../utils/systemDate";
import { getWakeSpaceBookings } from "../services/wakeSpaceServices";
import { getPayments } from "../services/paymentServices";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import logAuditEvent from "../utils/auditLogger";

/**
 * Calculates or extracts next payment due date, using fallback calculation if not stored.
 */
function extractDueDate(p) {
    if (p.due_date) return p.due_date;
    if (p.next_due_date) return p.next_due_date;

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

/**
 * Scans active wake spaces and operational payment records against the active system date,
 * generating smart system alerts if not already issued.
 */
export async function syncOperationalAlertsController(currentNotifications = []) {
    try {
        const todayStr = getSystemDateISO();
        const existingAlerts = currentNotifications.length > 0 ? currentNotifications : await getNotifications();
        let createdCount = 0;

        // 1. Check Wake Space Vigils for today
        const bookings = await getWakeSpaceBookings();

        for (const b of bookings) {
            if (b.status === "cancelled") continue;

            const spaceName = b.spaceName || `Wake Space ${b.wake || ""}`;
            const deceasedName = b.deceased || "Family Vigil";

            // A) Vigil Check-in Today
            if (b.startDate === todayStr) {
                const alreadyNotified = existingAlerts.some(
                    (n) => n.title?.includes(spaceName) && n.message?.includes(b.startDate) && n.category === "wake"
                );

                if (!alreadyNotified) {
                    await createNotification({
                        type: "high",
                        category: "wake",
                        title: `Vigil Check-In: ${spaceName}`,
                        message: `Scheduled check-in today (${todayStr}) for ${deceasedName}. Facility is active.`,
                        action_link: "/staff/wake-spaces",
                        user_id: "staff",
                    });
                    createdCount++;
                }
            }

            // B) Vigil Checkout / Concludes Today
            if (b.endDate === todayStr) {
                const alreadyNotified = existingAlerts.some(
                    (n) => n.title?.includes("Checkout") && n.title?.includes(spaceName) && n.category === "wake"
                );

                if (!alreadyNotified) {
                    await createNotification({
                        type: "urgent",
                        category: "wake",
                        title: `Vigil Checkout Today: ${spaceName}`,
                        message: `Vigil for ${deceasedName} concludes today (${todayStr}). Please inspect room for turnover.`,
                        action_link: "/staff/wake-spaces",
                        user_id: "staff",
                    });
                    createdCount++;
                }
            }
        }

        // 2. Check Installment Payments due today or overdue
        try {
            const [payments, clientsSnap, plotsSnap, burialsSnap, usersSnap, graveTypesSnap] = await Promise.all([
                getPayments(),
                getDocs(collection(db, "clients")),
                getDocs(collection(db, "plots")),
                getDocs(collection(db, "burials")),
                getDocs(collection(db, "users")),
                getDocs(collection(db, "grave_type")),
            ]);

            const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const plots = plotsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const burials = burialsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const graveTypes = graveTypesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

            // Clean up any legacy alert that used the raw plot ID in the title (e.g. "Plot pFT1SQ...")
            const legacyRawIdAlerts = existingAlerts.filter(
                (n) => n.category === "installment" && n.title?.includes("Plot ")
            );
            for (const leg of legacyRawIdAlerts) {
                try {
                    await deleteNotification(leg.id);
                } catch (e) {
                    console.warn("Could not remove legacy raw plot ID notification:", e);
                }
            }

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

                // A) Overdue Installment (Due date has passed)
                if (dueDate < todayStr) {
                    const alreadyNotified = existingAlerts.some(
                        (n) => n.category === "installment" &&
                               !n.title?.includes("Plot ") &&
                               (n.title?.includes(clientName) || n.message?.includes(clientName)) &&
                               n.message?.includes(dueDate)
                    );

                    if (!alreadyNotified) {
                        await createNotification({
                            type: "urgent",
                            category: "installment",
                            title: `Overdue Installment: ${clientName}`,
                            message: `Payment for ${clientName}${lotTag} is overdue since ${dueDate}. Installment Due: ₱${monthlyAmt.toLocaleString()} | Remaining Balance: ₱${balance.toLocaleString()}. Please follow up with client.`,
                            action_link: "/staff/payments",
                            user_id: "staff",
                            payment_id: p.id,
                            plot_id: p.plot_id || "",
                            balance,
                            monthly_amount: monthlyAmt,
                            client_name: clientName,
                            due_date: dueDate,
                        });
                        createdCount++;
                    }
                }
                // B) Installment Due Today (Due date is today)
                else if (dueDate === todayStr) {
                    const alreadyNotified = existingAlerts.some(
                        (n) => n.category === "installment" &&
                               !n.title?.includes("Plot ") &&
                               (n.title?.includes(clientName) || n.message?.includes(clientName)) &&
                               n.message?.includes(todayStr)
                    );

                    if (!alreadyNotified) {
                        await createNotification({
                            type: "high",
                            category: "installment",
                            title: `Installment Due Today: ${clientName}`,
                            message: `Installment payment for ${clientName}${lotTag} is due today (${todayStr}). Installment Due: ₱${monthlyAmt.toLocaleString()} | Remaining Balance: ₱${balance.toLocaleString()}.`,
                            action_link: "/staff/payments",
                            user_id: "staff",
                            payment_id: p.id,
                            plot_id: p.plot_id || "",
                            balance,
                            monthly_amount: monthlyAmt,
                            client_name: clientName,
                            due_date: dueDate,
                        });
                        createdCount++;
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
                    const alreadyNotified = existingAlerts.some(
                        (n) => n.category === "renewals" &&
                               (n.plot_id === plt.id || n.title?.includes(plotCode)) &&
                               n.message?.includes("expired")
                    );

                    if (!alreadyNotified) {
                        await createNotification({
                            type: "urgent",
                            category: "renewals",
                            title: `Lease Expired: Lot ${plotCode}`,
                            message: `7-year grave lot lease for Lot ${plotCode} (${deceasedDisplay}) expired on ${expStr}. Renewal rate: ₱3,500/year (Cash only). Please contact the family (${clientName}) to process renewal.`,
                            action_link: "/staff/renewals",
                            user_id: "staff",
                            plot_id: plt?.id || "",
                            client_name: clientName,
                            expiration_date: expStr,
                        });
                        createdCount++;
                    }
                }
                // B) Expiring Soon (Within 60 days of 7-year term end)
                else if (expStr <= sixtyDaysStr) {
                    const diffDays = Math.ceil((new Date(expStr).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24));
                    const alreadyNotified = existingAlerts.some(
                        (n) => n.category === "renewals" &&
                               (n.plot_id === plt.id || n.title?.includes(plotCode)) &&
                               n.message?.includes(expStr)
                    );

                    if (!alreadyNotified) {
                        await createNotification({
                            type: "high",
                            category: "renewals",
                            title: `Lease Expiring Soon: Lot ${plotCode}`,
                            message: `Grave lot lease for Lot ${plotCode} (${deceasedDisplay}) expires in ${diffDays} day(s) on ${expStr}. Renewal rate: ₱3,500/year (Cash only). Please notify the family (${clientName}).`,
                            action_link: "/staff/renewals",
                            user_id: "staff",
                            plot_id: plt?.id || "",
                            client_name: clientName,
                            expiration_date: expStr,
                        });
                        createdCount++;
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
    // Run initial sync on application mount
    syncOperationalAlertsController().catch((err) => {
        console.warn("Initial operational alerts sync error:", err);
    });

    // Re-run sync whenever System Date changes or is overridden
    return subscribeSystemDate(() => {
        syncOperationalAlertsController().catch((err) => {
            console.warn("System date change alert sync error:", err);
        });
    });
}
