import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import "./BurialRecords.css";
import FamilyTopbar from "./FamilyTopbar";

function BurialRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setRecords([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, "family_burial_records"),
        where("userId", "==", user.uid)
      );

      const unsubscribeSnapshot = onSnapshot(
        q,
        (snap) => {
          if (snap.empty) {
            setRecords([]);
          } else {
            const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setRecords(data);
          }
          setLoading(false);
        },
        (err) => {
          console.error("Failed to load burial records:", err);
          setRecords([]);
          setLoading(false);
        }
      );

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <div className="fam-page-wrapper">
      {/* Top Bar */}
      <FamilyTopbar title="Burial Records" greeting="View details and manage your plots" />

      {/* Main Content */}
      <div className="fam-container">
        <div className="fbr-header-row">
          <h2>
            <i className="fas fa-file-alt" style={{ color: "#d4af37", marginRight: "8px" }}></i>
            My Records
          </h2>
        </div>

        {loading ? (
          <p style={{ color: "#6a8aaa", padding: "20px 0" }}>
            <i className="fas fa-spinner fa-spin"></i> Loading records...
          </p>
        ) : records.length === 0 ? (
          <div className="fmp-empty" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <i
              className="fas fa-folder-open"
              style={{ fontSize: "2.5rem", color: "#d1d5db", marginBottom: "1rem" }}
            ></i>
            <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#1a3d5c" }}>
              No burial records found.
            </p>
          </div>
        ) : (
          <div className="fbr-grid">
            {records.map((record) => (
              <div key={record.id} className="fbr-card">
                {/* Card Header */}
                <div className="fbr-card-header">
                  <div className="fbr-card-title-group">
                    <h2 className="fbr-card-name">{record.name}</h2>
                    <p className="fbr-card-id">
                      <i className="fas fa-hashtag" style={{ marginRight: 4, color: "#8aaccc" }}></i>
                      Record {record.recordId}
                    </p>
                  </div>
                  <span
                    className={`fbr-badge fbr-badge--${(record.status || "active").toLowerCase()}`}
                  >
                    <i className="fas fa-check-circle" style={{ marginRight: 4 }}></i>
                    {record.status}
                  </span>
                </div>

                <div className="fbr-divider" />

                {/* Card Body */}
                <div className="fbr-card-body">
                  {/* Personal Information */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Personal Information</p>
                    <div className="fbr-field-row">
                      <i className="fas fa-user" style={{ color: "#9ca3af", width: 16 }}></i>
                      <span>{record.personal?.name}</span>
                    </div>
                    <div className="fbr-field-row">
                      <i className="fas fa-calendar-alt" style={{ color: "#9ca3af", width: 16 }}></i>
                      <span>{record.personal?.dates}</span>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Location</p>
                    <div className="fbr-field-row">
                      <i className="fas fa-map-marker-alt" style={{ color: "#d4af37", width: 16 }}></i>
                      <span style={{ fontWeight: 600, color: "#1a3d5c" }}>
                        {record.location?.grave}
                      </span>
                    </div>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Section / Block:</span>
                      <span className="fbr-kv-value">
                        {record.location?.section} / {record.location?.block}
                      </span>
                    </div>
                  </div>

                  {/* Burial Details */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Burial Details</p>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Date Buried:</span>
                      <span className="fbr-kv-value fbr-kv-value--bold">
                        {record.burial?.dateBuried}
                      </span>
                    </div>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Type:</span>
                      <span className="fbr-kv-value fbr-kv-value--bold">
                        {record.burial?.type}
                      </span>
                    </div>
                  </div>

                  {/* Lease Information */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Lease Information</p>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Lease Start:</span>
                      <span className="fbr-kv-value fbr-kv-value--bold">
                        {record.lease?.start}
                      </span>
                    </div>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Lease Expiry:</span>
                      <span className="fbr-kv-value fbr-kv-value--bold">
                        {record.lease?.expiry}
                      </span>
                    </div>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Payment:</span>
                      <span
                        className="fbr-kv-value"
                        style={{ color: "#27ae60", fontWeight: 600 }}
                      >
                        {record.lease?.payment}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="fbr-card-footer">
                  <button className="fam-btn-secondary">
                    <i className="fas fa-download"></i> Download Certificate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BurialRecords;
