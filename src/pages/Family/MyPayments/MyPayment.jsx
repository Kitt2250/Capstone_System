import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import "./MyPayment.css";
import FamilyTopbar from "./FamilyTopbar";

const peso = (n) => "₱" + (n || 0).toLocaleString("en-PH");

function MyPayments() {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setSummary(null);
        setHistory([]);
        setLoading(false);
        return;
      }

      // Listen to Payment Summary without seeding dummy data
      const qSummary = query(
        collection(db, "family_payment_summary"),
        where("userId", "==", user.uid)
      );
      const unsubSummary = onSnapshot(
        qSummary,
        (snap) => {
          if (snap.empty) {
            setSummary(null);
          } else {
            setSummary(snap.docs[0].data());
          }
        },
        (err) => {
          console.error("Failed to load payment summary:", err);
          setSummary(null);
        }
      );

      // Listen to Payment History without seeding dummy data
      const qHistory = query(
        collection(db, "family_payments"),
        where("userId", "==", user.uid)
      );
      const unsubHistory = onSnapshot(
        qHistory,
        (snap) => {
          if (snap.empty) {
            setHistory([]);
          } else {
            const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setHistory(data);
          }
          setLoading(false);
        },
        (err) => {
          console.error("Failed to load payment history:", err);
          setHistory([]);
          setLoading(false);
        }
      );

      return () => {
        unsubSummary();
        unsubHistory();
      };
    });

    return () => unsubAuth();
  }, []);

  const progress =
    summary && summary.total > 0
      ? Math.round(((summary.paid || 0) / summary.total) * 100)
      : 0;

  return (
    <div className="fam-page-wrapper">
      {/* Top Bar */}
      <FamilyTopbar
        title="My Payments"
        greeting="View payment history and outstanding balance"
      />

      {loading ? (
        <p style={{ color: "#6a8aaa", padding: "20px 0" }}>
          <i className="fas fa-spinner fa-spin"></i> Loading payment data...
        </p>
      ) : !summary && history.length === 0 ? (
        <div className="fam-container" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <i
            className="fas fa-wallet"
            style={{ fontSize: "2.5rem", color: "#d1d5db", marginBottom: "1rem" }}
          ></i>
          <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#1a3d5c" }}>
            No payment records found.
          </p>
          <p style={{ color: "#6a8aaa", fontSize: "0.9rem" }}>
            Payment history and balance details will appear here once transactions are recorded.
          </p>
        </div>
      ) : (
        <div className="fmpay-grid">
          {/* Payment Summary Card */}
          <div className="fam-container fmpay-summary-col">
            <div className="fmpay-section-header">
              <h2 className="fmpay-title">
                <i
                  className="fas fa-wallet"
                  style={{ color: "#d4af37", marginRight: "8px" }}
                ></i>
                Payment Summary
              </h2>
              {summary?.lot && <span className="fmpay-lot-badge">{summary.lot}</span>}
            </div>

            <div className="fmpay-stats-grid">
              <div className="fmpay-stat-card">
                <span className="fmpay-stat-label">Total Amount</span>
                <span className="fmpay-stat-value">{peso(summary?.total)}</span>
              </div>
              <div className="fmpay-stat-card">
                <span className="fmpay-stat-label">Amount Paid</span>
                <span className="fmpay-stat-value" style={{ color: "#27ae60" }}>
                  {peso(summary?.paid)}
                </span>
              </div>
              <div className="fmpay-stat-card fmpay-stat-card--highlight">
                <span className="fmpay-stat-label" style={{ color: "#c0392b" }}>
                  Outstanding Balance
                </span>
                <span className="fmpay-stat-value" style={{ color: "#c0392b" }}>
                  {peso(summary?.outstanding)}
                </span>
              </div>
              <div className="fmpay-stat-card">
                <span className="fmpay-stat-label">Next Due Date</span>
                <span className="fmpay-stat-value" style={{ fontSize: "1.1rem" }}>
                  {summary?.nextDue || "N/A"}
                </span>
              </div>
            </div>

            <div className="fmpay-progress-section">
              <div className="fmpay-progress-header">
                <span className="fmpay-progress-label">Payment Progress</span>
                <span className="fmpay-progress-pct">{progress}%</span>
              </div>
              <div className="fmpay-progress-track">
                <div className="fmpay-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="fmpay-progress-footer">
                <span>
                  <i className="fas fa-info-circle"></i> Monthly Installment:{" "}
                  <strong>{peso(summary?.monthly)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Payment History Card */}
          <div className="fam-container fmpay-history-col">
            <div className="fmpay-section-header">
              <h2 className="fmpay-title">
                <i
                  className="fas fa-history"
                  style={{ color: "#6a8aaa", marginRight: "8px" }}
                ></i>
                Payment History
              </h2>
            </div>

            <div className="fam-table-container">
              <table className="fam-table">
                <thead>
                  <tr>
                    <th>Receipt No.</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        style={{ textAlign: "center", padding: "2rem", color: "#6a8aaa" }}
                      >
                        No payment history found.
                      </td>
                    </tr>
                  ) : (
                    history.map((row) => (
                      <tr key={row.id}>
                        <td className="fam-td-bold" style={{ color: "#3670AF" }}>
                          {row.receiptId}
                        </td>
                        <td>{row.date}</td>
                        <td className="fam-td-bold">{peso(row.amount)}</td>
                        <td>{row.method}</td>
                        <td>
                          <span className="fam-badge fam-badge--success">
                            <i className="fas fa-check-circle" style={{ marginRight: 4 }}></i>{" "}
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <button className="fam-icon-btn" title="View Receipt">
                            <i className="fas fa-eye"></i>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="fmpay-footer-note">
              <i className="fas fa-headset" style={{ color: "#d4af37" }}></i> For payment
              inquiries, please visit the office or call (044) 123-4567.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPayments;
