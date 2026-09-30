import {
    collection,
    doc,
    addDoc,
    getDocs,
    getDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    query,
    orderBy,
    where,
    writeBatch
} from "firebase/firestore";
import { db } from "../firebase/config";

const COLLECTION = "notifications";

/**
 * Generates an auto-incrementing / readable notification ID if none provided.
 */
export function generateNextNotificationId(existing = []) {
    let maxNum = 1000;
    existing.forEach((n) => {
        const idNum = Number(n.notification_id);
        if (!isNaN(idNum) && idNum > maxNum) {
            maxNum = idNum;
        }
    });
    return maxNum + 1;
}

/**
 * Creates a notification record adhering strictly to the database schema.
 *
 * @param {Object} data
 * @param {string} [data.user_id="staff"] - User or group receiving notification
 * @param {string} data.type - "urgent" | "high" | "medium" | "low" | "info"
 * @param {string} data.category - "installment" | "wake" | "payments" | "renewals" | "system"
 * @param {string} data.title - Notification title
 * @param {string} data.message - Detailed notification text
 * @param {string} [data.action_link="/staff"] - Page route to take action
 * @param {boolean} [data.is_read=false]
 * @returns {Promise<{ id: string, notification_id: number }>}
 */
export async function createNotification(data) {
    try {
        const existing = await getNotifications();
        const notification_id = data.notification_id || generateNextNotificationId(existing);

        const payload = {
            ...data,
            notification_id,
            user_id: data.user_id || "staff",
            type: data.type || "info", // urgent, high, medium, low, info
            category: data.category || "system", // installment, wake, payments, renewals, system
            title: data.title || "New Notification",
            message: data.message || "",
            action_link: data.action_link || "/staff",
            is_read: Boolean(data.is_read ?? false),
            created_at: serverTimestamp(),
            read_at: data.is_read ? serverTimestamp() : null,
        };

        const docRef = await addDoc(collection(db, COLLECTION), payload);
        return { id: docRef.id, notification_id };
    } catch (error) {
        console.error("Error creating notification:", error);
        throw error;
    }
}

/**
 * Retrieves all notifications, optionally filtered by user_id.
 */
export async function getNotifications(userId = null) {
    try {
        let q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));
        const snap = await getDocs(q);

        const list = snap.docs.map((d) => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                created_at: data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : data.created_at,
                read_at: data.read_at?.toDate?.() ? data.read_at.toDate().toISOString() : data.read_at,
            };
        });

        if (userId && userId !== "all") {
            return list.filter((n) => n.user_id === userId || n.user_id === "all" || n.user_id === "staff");
        }

        return list;
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return [];
    }
}

/**
 * Subscribes to real-time notification updates.
 */
export function subscribeNotifications(onData, userId = null) {
    try {
        const q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));

        return onSnapshot(
            q,
            (snap) => {
                const list = snap.docs.map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        created_at: data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : data.created_at,
                        read_at: data.read_at?.toDate?.() ? data.read_at.toDate().toISOString() : data.read_at,
                    };
                });

                if (userId && userId !== "all") {
                    const filtered = list.filter(
                        (n) => n.user_id === userId || n.user_id === "all" || n.user_id === "staff"
                    );
                    onData(filtered);
                } else {
                    onData(list);
                }
            },
            (error) => {
                console.warn("Notifications subscription error:", error);
                onData([]);
            }
        );
    } catch (err) {
        console.error("Error setting up notifications listener:", err);
        return () => {};
    }
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(docId) {
    if (!docId) return;
    try {
        const docRef = doc(db, COLLECTION, docId);
        await updateDoc(docRef, {
            is_read: true,
            read_at: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        throw error;
    }
}

/**
 * Marks all notifications as read for a user / staff.
 */
export async function markAllNotificationsAsRead(notifications = []) {
    try {
        const batch = writeBatch(db);
        let count = 0;

        notifications.forEach((n) => {
            if (!n.is_read && n.id) {
                const ref = doc(db, COLLECTION, n.id);
                batch.update(ref, {
                    is_read: true,
                    read_at: serverTimestamp(),
                });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
        }
        return count;
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        throw error;
    }
}

/**
 * Deletes a single notification.
 */
export async function deleteNotification(docId) {
    if (!docId) return;
    try {
        await deleteDoc(doc(db, COLLECTION, docId));
    } catch (error) {
        console.error("Error deleting notification:", error);
        throw error;
    }
}

/**
 * Clears multiple or all read notifications.
 */
export async function clearReadNotifications(notifications = []) {
    try {
        const batch = writeBatch(db);
        let count = 0;

        notifications.forEach((n) => {
            if (n.is_read && n.id) {
                batch.delete(doc(db, COLLECTION, n.id));
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
        }
        return count;
    } catch (error) {
        console.error("Error clearing read notifications:", error);
        throw error;
    }
}
