import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { logAuditEvent } from "../utils/auditLogger";
import { createNotification } from "./notificationServices";
import { getSystemDate, getSystemDateISO } from "../utils/systemDate";

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT GENERATOR
// Generates unique receipt codes starting with "CHM"
// Format: CHM-YYYYMMDD-XXXXXX (e.g., CHM-20260925-839102)
// ─────────────────────────────────────────────────────────────────────────────
export function generateReceiptNumber() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    return `CHM-${yyyy}${mm}${dd}-${randomSuffix}`;
}

// Callable alias or helper object for flexibility: ReceiptGenerator() or ReceiptGenerator.generate()
export function ReceiptGenerator() {
    return generateReceiptNumber();
}
ReceiptGenerator.generate = generateReceiptNumber;

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SERVICES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new payment document in the "payments" collection.
 *
 * @param {string} uid - Firebase user ID of the client
 * @param {string} plotId - ID of the plot being purchased/reserved
 * @param {string|null} burialId - ID of the burial record (null for pre-need)
 * @param {Object} paymentData - { total, balance, paymentStatus }
 * @returns {Promise<string>} Created payment document ID
 */
export async function createPaymentDocument(uid, plotId, burialId, paymentData) {
    let calculatedDueDate = paymentData.dueDate || paymentData.due_date || paymentData.next_due_date || null;
    if (!calculatedDueDate && Number(paymentData.balance || 0) > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        calculatedDueDate = d.toISOString().split("T")[0];
    }

    const initialBalance = paymentData.initial_balance ?? paymentData.balance ?? 0;
    const monthlyAmt = paymentData.monthly_installment ?? paymentData.monthly_amount ?? paymentData.monthly ?? null;
    const duration = paymentData.installment_duration ?? paymentData.duration ?? null;

    const docRef = await addDoc(collection(db, "payments"), {
        user_id: uid,
        plot_id: plotId ?? "",
        burial_id: burialId ?? null,
        total: paymentData.total ?? 0,
        balance: paymentData.balance ?? 0,
        initial_balance: initialBalance,
        monthly_installment: monthlyAmt,
        monthly_amount: monthlyAmt,
        installment_duration: duration,
        due_date: calculatedDueDate,
        next_due_date: calculatedDueDate,
        payment_status: paymentData.paymentStatus ?? "pending",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
    return docRef.id;
}

/**
 * Writes an entry to the "payment_history" collection.
 * Automatically generates a CHM receipt number if none was provided.
 *
 * @param {string} paymentId - ID of the parent payment document
 * @param {Object} historyData - { receipt, amount, paymentDate, paymentMethod, notes }
 * @returns {Promise<Object>} { id, receipt }
 */
export async function createPaymentHistoryDocument(paymentId, historyData) {
    const receiptNumber = historyData?.receipt?.trim() || generateReceiptNumber();

    const docRef = await addDoc(collection(db, "payment_history"), {
        pay_id: paymentId,
        receipt: receiptNumber,
        amount: Number(historyData?.amount ?? 0),
        payment_date: historyData?.paymentDate ?? new Date().toISOString().split("T")[0],
        payment_method: historyData?.paymentMethod ?? "Cash",
        notes: historyData?.notes ?? "",
        created_at: serverTimestamp(),
    });

    return {
        id: docRef.id,
        receipt: receiptNumber,
    };
}

/**
 * Fetch all payments
 */
export async function getPayments() {
    const snap = await getDocs(collection(db, "payments"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a payment record by ID
 */
export async function getPaymentById(paymentId) {
    const snap = await getDoc(doc(db, "payments", paymentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
}

/**
 * Fetch payment history entries for a specific payment ID.
 * Uses query by pay_id with resilient in-memory sorting to prevent composite index requirement errors.
 */
export async function getPaymentHistoryByPaymentId(paymentId) {
    const q = query(
        collection(db, "payment_history"),
        where("pay_id", "==", paymentId)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return list.sort((a, b) => {
        const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.payment_date || 0).getTime();
        const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.payment_date || 0).getTime();
        return timeB - timeA;
    });
}

/**
 * Fetch all payments for a specific user
 */
export async function getPaymentsByUserId(userId) {
    const q = query(
        collection(db, "payments"),
        where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch all payments for a specific plot
 */
export async function getPaymentsByPlotId(plotId) {
    const q = query(
        collection(db, "payments"),
        where("plot_id", "==", plotId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Update an existing payment document (e.g. when installment payments reduce balance)
 */
export async function updatePayment(paymentId, updatedData) {
    const docRef = doc(db, "payments", paymentId);
    await updateDoc(docRef, {
        ...updatedData,
        updated_at: serverTimestamp(),
    });
    return true;
}

/**
 * Record an installment payment:
 * - Validates amount against remaining balance
 * - Deducts balance and advances next due date
 * - Sets status to 'paid' if balance reaches 0
 * - Records entry in payment_history
 * - Logs audit event
 */
export async function recordInstallmentPayment({
    paymentId,
    amount,
    paymentMethod = "Cash",
    paymentDate,
    receipt,
    notes = "",
    performedBy = null,
    currentDueDate = null,
    monthlyAmount = null
}) {
    const payment = await getPaymentById(paymentId);
    if (!payment) throw new Error("Payment record not found.");

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
        throw new Error("Payment amount must be greater than zero.");
    }
    const currentBalance = Number(payment.balance || 0);
    if (payAmount > currentBalance) {
        throw new Error(`Amount (₱${payAmount.toLocaleString()}) exceeds remaining balance of ₱${currentBalance.toLocaleString()}.`);
    }

    const newBalance = Math.max(0, currentBalance - payAmount);
    const newStatus = newBalance === 0 ? "paid" : "partial";

    // Advance due date by 1 month (or proportional months if paying multiple installments) if balance remains
    let newDueDate = null;
    if (newBalance > 0) {
        let baseDate = null;
        const activeDue = currentDueDate || payment.due_date || payment.next_due_date;
        if (activeDue) {
            baseDate = new Date(activeDue);
        }

        if (!baseDate || isNaN(baseDate.getTime())) {
            const initialBase = payment.created_at?.toDate
                ? payment.created_at.toDate()
                : (payment.last_payment_date ? new Date(payment.last_payment_date) : new Date(paymentDate || new Date()));
            baseDate = new Date(initialBase);
            baseDate.setMonth(baseDate.getMonth() + 1);
        }

        // Calculate months to advance (at least 1 month per installment payment)
        const mAmount = Number(monthlyAmount || payment.monthly_amount || payment.monthly_installment || 0);
        let monthsToAdvance = 1;
        if (mAmount > 0 && payAmount >= mAmount * 1.8) {
            monthsToAdvance = Math.max(1, Math.round(payAmount / mAmount));
        }

        baseDate.setMonth(baseDate.getMonth() + monthsToAdvance);
        const y = baseDate.getFullYear();
        const m = String(baseDate.getMonth() + 1).padStart(2, "0");
        const d = String(baseDate.getDate()).padStart(2, "0");
        newDueDate = `${y}-${m}-${d}`;
    }

    // 1. Update payment document
    const paymentUpdatePayload = {
        balance: newBalance,
        payment_status: newStatus,
        last_payment_date: paymentDate || new Date().toISOString().split("T")[0],
        due_date: newDueDate,
        next_due_date: newDueDate,
    };
    if (mAmount > 0 && !payment.monthly_installment) {
        paymentUpdatePayload.monthly_installment = mAmount;
        paymentUpdatePayload.monthly_amount = mAmount;
    }
    await updatePayment(paymentId, paymentUpdatePayload);

    // 2. Add payment history document
    const historyRes = await createPaymentHistoryDocument(paymentId, {
        receipt,
        amount: payAmount,
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        paymentMethod,
        notes,
    });

    // 3. Log audit event
    try {
        await logAuditEvent({
            module: 'Payments',
            actionType: 'INSTALLMENT_COLLECTION',
            description: `Recorded payment of ₱${payAmount.toLocaleString()} (${historyRes.receipt}). New balance: ₱${newBalance.toLocaleString()}.`,
            targetItem: historyRes.receipt,
            details: {
                paymentId,
                receipt: historyRes.receipt,
                amount: payAmount,
                previousBalance: currentBalance,
                newBalance,
                paymentMethod,
                paymentStatus: newStatus,
            },
            performedBy
        });
    } catch (auditErr) {
        console.warn("Could not log audit event:", auditErr);
    }

    // 4. Create Notification
    try {
        const isFull = newBalance === 0;
        await createNotification({
            type: isFull ? "info" : "medium",
            category: "installment",
            title: isFull ? `Account Fully Paid (${historyRes.receipt})` : `Installment Payment: ${historyRes.receipt}`,
            message: isFull
                ? `Installment balance settled in full with payment of ₱${payAmount.toLocaleString()}. Balance is now ₱0.00.`
                : `Recorded ₱${payAmount.toLocaleString()} installment collection. Remaining balance: ₱${newBalance.toLocaleString()}. Next due: ${newDueDate || "N/A"}.`,
            action_link: "/staff/payments",
            user_id: "staff",
        });
    } catch (notifErr) {
        console.warn("Could not create notification for installment payment:", notifErr);
    }

    return {
        success: true,
        receipt: historyRes.receipt,
        newBalance,
        newStatus,
        newDueDate,
    };
}

/**
 * Resolves the next installment due date for a payment.
 * Handles explicit fields, fallback date calculation from creation/history,
 * and calculates relative badge indicators (e.g. "Due in 5 days", "3d Overdue", "Due Today").
 *
 * @param {Object} payment - Firestore payment record
 * @param {Object|null} burial - Optional linked burial record
 * @param {Array} paymentHistory - Array of transaction history records
 * @returns {Object} { isPaid, rawDate, formattedDate, displayBadge, badgeType, isOverdue, isDueToday, daysUntilDue }
 */
export function resolveDueDate(payment, burial = null, paymentHistory = [], referenceDate = null) {
    if (!payment) return null;

    const balance = Number(payment.balance ?? 0);
    const statusStr = (payment.payment_status || "").toLowerCase();

    // If fully paid or zero balance
    if (balance <= 0 || statusStr === "paid") {
        return {
            isPaid: true,
            rawDate: null,
            formattedDate: "Paid in Full",
            displayBadge: "Settled",
            badgeType: "success",
            isOverdue: false,
            isDueToday: false,
            daysUntilDue: null,
        };
    }

    // 1. Check explicit fields on payment document
    let rawDate =
        payment.due_date ||
        payment.next_due_date ||
        payment.nextDue ||
        payment.dueDate ||
        null;

    // If rawDate is a Firestore timestamp object
    if (rawDate && typeof rawDate === "object" && rawDate.toDate) {
        try {
            rawDate = rawDate.toDate().toISOString().split("T")[0];
        } catch {
            // ignore
        }
    }

    // 2. Fallback calculation if not stored directly
    if (!rawDate) {
        const matchingHist = Array.isArray(paymentHistory)
            ? paymentHistory.filter((h) => h.pay_id === payment.id || h.payId === payment.id)
            : [];

        let base = null;
        if (matchingHist.length > 0 && matchingHist[matchingHist.length - 1]?.payment_date) {
            base = new Date(matchingHist[matchingHist.length - 1].payment_date);
        } else if (payment.created_at?.toDate) {
            base = payment.created_at.toDate();
        } else if (payment.createdAt) {
            base = new Date(payment.createdAt);
        } else if (burial?.date_buried) {
            base = new Date(burial.date_buried);
        }

        if (base && !isNaN(base.getTime())) {
            const d = new Date(base);
            const installmentsPaid = Math.max(0, matchingHist.length - 1);
            d.setMonth(d.getMonth() + (installmentsPaid + 1));
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            rawDate = `${y}-${m}-${day}`;
        }
    }

    // Fallback: 1 month ahead if still null
    if (!rawDate) {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        rawDate = d.toISOString().split("T")[0];
    }

    // Calculate days until due
    let daysUntilDue = null;
    let isOverdue = false;
    let isDueToday = false;
    let displayBadge = "Upcoming";
    let badgeType = "upcoming";

    try {
        const dueDateObj = new Date(rawDate);
        if (!isNaN(dueDateObj.getTime())) {
            const sysDate = referenceDate instanceof Date
                ? referenceDate
                : referenceDate
                ? new Date(referenceDate)
                : getSystemDate();

            const sysZero = new Date(sysDate);
            sysZero.setHours(0, 0, 0, 0);

            const targetZero = new Date(dueDateObj);
            targetZero.setHours(0, 0, 0, 0);

            const diffTime = targetZero.getTime() - sysZero.getTime();
            daysUntilDue = Math.round(diffTime / (1000 * 60 * 60 * 24));

            // Park office closes at 18:00 (6:00 PM). If today is the due date and time is at or past 6 PM (18:00),
            // payment is overdue as today's payment window has closed!
            const sysHour = sysDate.getHours();
            const isPastCutoffToday = sysHour >= 18;

            if (daysUntilDue < 0 || (daysUntilDue === 0 && isPastCutoffToday)) {
                isOverdue = true;
                badgeType = "overdue";
                const overdueDays = daysUntilDue < 0 ? Math.abs(daysUntilDue) : 1;
                displayBadge = `${overdueDays}d Overdue`;
                if (daysUntilDue >= 0) {
                    daysUntilDue = -1;
                }
            } else if (daysUntilDue === 0) {
                isDueToday = true;
                badgeType = "due-today";
                displayBadge = "Due Today";
            } else if (daysUntilDue === 1) {
                badgeType = "due-soon";
                displayBadge = "Due Tomorrow";
            } else if (daysUntilDue <= 14) {
                badgeType = "due-soon";
                displayBadge = `Due in ${daysUntilDue} days`;
            } else {
                badgeType = "upcoming";
                displayBadge = `In ${daysUntilDue} days`;
            }
        }
    } catch (e) {
        console.warn("Due date calculation error:", e);
    }

    if (statusStr === "overdue") {
        isOverdue = true;
        badgeType = "overdue";
        if (!displayBadge.includes("Overdue")) {
            displayBadge = "Overdue";
        }
    }

    // Format friendly display date
    let formattedDate = rawDate;
    try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        }
    } catch {
        formattedDate = String(rawDate);
    }

    return {
        isPaid: false,
        rawDate,
        formattedDate,
        displayBadge,
        badgeType,
        isOverdue,
        isDueToday,
        daysUntilDue,
    };
}
