import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import "./Notifications.css";
import FamilyTopbar from "./FamilyTopbar";

function NotifIcon({ type }) {
  if (type === "urgent") return <i className="fas fa-exclamation-circle" />;
  if (type === "high") return <i className="fas fa-exclamation-triangle" />;
  return <i className="fas fa-wallet" />;
}

function iconClass(type) {
  if (type === "urgent") return "fnotif-icon--orange";
  if (type === "high") return "fnotif-icon--blue";
  return "fnotif-icon--gray";
}

function borderColor(type) {
  if (type === "urgent") return "#c0392b";
  if (type === "high") return "#d97706";
  return "#94a3b8";
}

function formatDate(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);

  // 1. Get current user UID
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
      if (!user) setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to notifications where family_user_id == uid
  useEffect(() => {
    if (!uid) return;

    setLoading(true);
    const q = query(
      collection(db, "notifications"),
      where("family_user_id", "==", uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            // Sort: unread first, then by created_at desc
            if (!a.is_read && b.is_read) return -1;
            if (a.is_read && !b.is_read) return 1;
            const aTime = a.created_at?.toDate?.()?.getTime?.() ?? 0;
            const bTime = b.created_at?.toDate?.()?.getTime?.() ?? 0;
            return bTime - aTime;
          });
        setNotifications(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load family notifications:", err);
        setNotifications([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        is_read: true,
        read_at: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const markAllRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.is_read);
      await Promise.all(
        unread.map((n) =>
          updateDoc(doc(db, "notifications", n.id), {
            is_read: true,
            read_at: serverTimestamp(),
          })
        )
      );
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  return (
    <div className="fam-page-wrapper">
      <FamilyTopbar
        title="Notifications"
        greeting={
          unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
            : "You're all caught up"
        }
      />

      <div className="fam-container">
        <div className="fnotif-header">
          <h2>
            <i className="fas fa-bell" style={{ color: "#d4af37", marginRight: "8px" }}></i>
            Payment Alerts ({notifications.length})
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="fnotif-mark-all-btn"
              type="button"
            >
              <i className="fas fa-check-double"></i> Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ color: "#6a8aaa", padding: "20px 0" }}>
            <i className="fas fa-spinner fa-spin"></i> Loading notifications...
          </p>
        ) : notifications.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
            <i
              className="fas fa-check-circle"
              style={{ fontSize: "2.5rem", color: "#27ae60", marginBottom: "1rem", display: "block" }}
            ></i>
            <p style={{ fontWeight: 600, color: "#1a3d5c", marginBottom: "0.4rem" }}>
              No payment notifications
            </p>
            <p style={{ fontSize: "0.9rem" }}>
              Payment reminders and overdue alerts will appear here.
            </p>
          </div>
        ) : (
          <div className="fnotif-list">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`fnotif-item ${!n.is_read ? "fnotif-item--unread" : ""}`}
                style={{ borderLeftColor: !n.is_read ? borderColor(n.type) : undefined, cursor: "pointer" }}
                onClick={() => !n.is_read && markRead(n.id)}
              >
                <div className={`fnotif-icon-wrap ${iconClass(n.type)}`}>
                  <NotifIcon type={n.type} />
                </div>
                <div className="fnotif-body">
                  <div className="fnotif-row">
                    <span className="fnotif-title">{n.title}</span>
                    {!n.is_read && <span className="fnotif-dot" />}
                  </div>
                  <p className="fnotif-message">{n.message}</p>
                  <span className="fnotif-time">
                    <i className="fas fa-clock" style={{ marginRight: 4 }}></i>
                    {n.due_date
                      ? `Due: ${n.due_date}`
                      : formatDate(n.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;
