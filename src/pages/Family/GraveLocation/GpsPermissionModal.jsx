import React from "react";
import { MapPin, AlertCircle, RefreshCw, X, ShieldAlert } from "lucide-react";
import "./GpsPermissionModal.css";

export default function GpsPermissionModal({
  status = "prompt", // 'prompt' | 'blocked' | 'unsupported'
  errorMsg = "",
  deceasedNames = [],
  plot = null,
  onRequestPermission,
  onClose,
  isRequesting = false,
}) {
  return (
    <div className="gl-perm-overlay" onClick={onClose}>
      <div className="gl-perm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="gl-perm-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {status === "blocked" ? (
          <>
            <div className="gl-perm-icon-wrap gl-perm-icon--blocked">
              <ShieldAlert size={36} />
            </div>

            <h3 className="gl-perm-title">Location Access Blocked</h3>
            <p className="gl-perm-desc">
              Your browser has blocked location access. To navigate to this burial plot using GPS from where you are, please allow location access.
            </p>

            <div className="gl-perm-steps">
              <div className="gl-perm-step">
                <span className="gl-perm-step-num">1</span>
                <span>Click the <strong>tune / lock icon (🔒)</strong> on the left side of your browser address bar.</span>
              </div>
              <div className="gl-perm-step">
                <span className="gl-perm-step-num">2</span>
                <span>Toggle or change <strong>Location</strong> permission to <strong>Allow</strong>.</span>
              </div>
              <div className="gl-perm-step">
                <span className="gl-perm-step-num">3</span>
                <span>Click the <strong>Try Again</strong> button below.</span>
              </div>
            </div>

            {errorMsg && <div className="gl-perm-error-note">{errorMsg}</div>}

            <div className="gl-perm-actions">
              <button
                type="button"
                className="gl-perm-btn gl-perm-btn--primary"
                onClick={onRequestPermission}
                disabled={isRequesting}
              >
                <RefreshCw size={15} className={isRequesting ? "gl-spin" : ""} />
                {isRequesting ? "Checking Permission…" : "Try Again"}
              </button>
              <button
                type="button"
                className="gl-perm-btn gl-perm-btn--secondary"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        ) : status === "unsupported" ? (
          <>
            <div className="gl-perm-icon-wrap gl-perm-icon--blocked">
              <AlertCircle size={36} />
            </div>

            <h3 className="gl-perm-title">GPS Not Supported</h3>
            <p className="gl-perm-desc">
              Your current browser or device does not support GPS Geolocation. You can still use the <strong>Navigate from Entrance</strong> option.
            </p>

            <div className="gl-perm-actions">
              <button
                type="button"
                className="gl-perm-btn gl-perm-btn--secondary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="gl-perm-icon-wrap gl-perm-icon--prompt">
              <MapPin size={36} />
            </div>

            <h3 className="gl-perm-title">Allow Location Access</h3>
            <p className="gl-perm-desc">
              To guide you to the plot of{" "}
              <strong>{deceasedNames.length > 0 ? deceasedNames.join(" & ") : "your loved one"}</strong>{" "}
              {plot?.plotCode ? `(${plot.plotCode})` : ""} from your current position, please allow your browser to access your device GPS.
            </p>

            <div className="gl-perm-actions">
              <button
                type="button"
                className="gl-perm-btn gl-perm-btn--primary"
                onClick={onRequestPermission}
                disabled={isRequesting}
              >
                <MapPin size={15} />
                {isRequesting ? "Requesting Location…" : "Allow Location Access"}
              </button>
              <button
                type="button"
                className="gl-perm-btn gl-perm-btn--secondary"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
