import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, writeBatch } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import "./Notifications.css";
import FamilyTopbar from "./FamilyTopbar";

function NotifIcon({ type }) {
  if (type === "payment_reminder") return <i className="fas fa-wallet"></i>;
  if (type === "lease_expiration") return <i className="fas fa-exclamation-triangle"></i>;
  return <i className="fas fa-info-circle"></i>;
}

function iconColor(type) {
  if (type === "payment_reminder") return "fnotif-icon--blue";
  if (type === "lease_expiration") return "fnotif-icon--orange";
  return "fnotif-icon--gray";
}

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, "family_notifications"),
        where("userId", "==", user.uid)
      );

      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          if (snap.empty) {
            setNotifications([]);
          } else {
            const notifs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setNotifications(notifs);
          }
          setLoading(false);
        },
        (err) => {
          console.error("Failed to load notifications:", err);
          setNotifications([]);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    });

    return () => unsubAuth();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    try {
      const batch = writeBatch(db);
      const unread = notifications.filter((n) => !n.read);
      unread.forEach((n) => {
        const docRef = doc(db, "family_notifications", n.id);
        batch.update(docRef, { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const markRead = async (id) => {
    try {
      const docRef = doc(db, "family_notifications", id);
      await writeBatch(db).update(docRef, { read: true }).commit();
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  return (
    <div className="fam-page-wrapper">
      {/* Top Bar */}
      <FamilyTopbar
        title="Notifications"
        greeting={
          unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
            : "You are all caught up"
        }
      />

      <div className="fam-container">
        <div className="fnotif-header">
          <h2>
            <i className="fas fa-inbox" style={{ color: "#d4af37", marginRight: "8px" }}></i> Inbox
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="fam-btn-secondary"
              style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}
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
          <div
            className="fam-notif-empty"
            style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}
          >
            <i className="fas fa-bell-slash" style={{ fontSize: "2rem", marginBottom: "1rem" }}></i>
            <p>No notifications found.</p>
          </div>
        ) : (
          <div className="fnotif-list">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`fnotif-item ${!n.read ? "fnotif-item--unread" : ""}`}
                onClick={() => markRead(n.id)}
              >
                <div className={`fnotif-icon-wrap ${iconColor(n.type)}`}>
                  <NotifIcon type={n.type} />
                </div>
                <div className="fnotif-body">
                  <div className="fnotif-row">
                    <span className="fnotif-title">{n.title}</span>
                    {!n.read && <span className="fnotif-dot" />}
                  </div>
                  <p className="fnotif-message">{n.message}</p>
                  <span className="fnotif-time">
                    <i className="fas fa-clock" style={{ marginRight: 4 }}></i>
                    {n.time}
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
