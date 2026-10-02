import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase/config";
import { logAuditEvent } from "../../../utils/auditLogger";
import "./AdminSettings.css";
import Header from "../../../components/Header/Header";

const DEFAULT_SETTINGS = {
  siteName: "Cherubim of Heaven Memorial Park",
  contactPhone: "10001 000-0000",
  timezone: "Asia/Manila",
  currency: "PHP",
  expiryDays: "30",
  contactEmail: "admin@cherubim.ph",
  address: "Hagonoy, Bulacan, Philippines",
  coordinates: "14.8367° N, 120.7323° E",
  operatingHours: "8:00 AM - 6:00 PM",
  backupFrequency: "daily",
  sessionTimeout: "30",
  emailAlerts: true,
  contractExpiryAlerts: true,
  paymentReminders: true,
  systemUpdates: false,
  autoBackup: true,
  twoFactorAuth: false
};

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`set-toast set-toast-${toast.type} ${toast.visible ? "set-toast-show" : ""}`}>
      <span>{toast.message}</span>
      <button className="set-toast-close" onClick={onClose}>×</button>
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "settings", "system2"));
        if (snap.exists()) {
          setSettings((prev) => ({ ...prev, ...snap.data() }));
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const showToast = (message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSetting = (name, key, isEnabled) => {
    updateSetting(key, isEnabled);
    showToast(`🔔 ${name} ${isEnabled ? 'enabled' : 'disabled'}`, 'info');
  };

  const confirmSave = async () => {
    setShowSaveModal(false);
    try {
      await setDoc(doc(db, "settings", "system2"), settings);
      await logAuditEvent({
        module: "Settings",
        actionType: "UPDATE",
        description: "Updated system settings",
        targetItem: "System Configuration",
        performedBy: {
          name: auth.currentUser?.email || "Admin",
          email: auth.currentUser?.email || "",
          role: "Admin"
        }
      });
      showToast('✅ All settings saved successfully!', 'success');
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast('❌ Failed to save settings', 'error');
    }
  };

  const confirmReset = () => {
    setShowResetModal(false);
    setSettings(DEFAULT_SETTINGS);
    showToast('🔄 All settings reset to defaults', 'warning');
  };

  if (loading) {
    return (
      <div className="user-management-page" style={{ padding: "2rem", textAlign: "center", color: "#6a8aaa" }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: "2rem", marginBottom: "1rem" }}></i>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="set-wrapper">
      <Header page="settings" />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* ── SETTINGS CONTAINER ── */}
      <div className="set-container">

        {/* Header */}
        <div className="set-header">
          <div className="set-header-left">
            <h2><i className="fas fa-sliders-h" style={{ color: "#d4af37", marginRight: 8 }}></i>Preferences</h2>
          </div>
          <div className="set-header-right">
            <button className="set-btn-secondary" onClick={() => setShowResetModal(true)}>
              <i className="fas fa-undo"></i> Reset Defaults
            </button>
            <button className="set-btn-primary" onClick={() => setShowSaveModal(true)}>
              <i className="fas fa-save"></i> Save Changes
            </button>
          </div>
        </div>

        {/* Settings Grid */}
        <div className="set-grid">

          {/* Notification Settings */}
          <div className="set-section">
            <div className="set-section-title">
              <i className="fas fa-bell"></i> Notification Settings
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Email Alerts</div>
                <div className="set-desc">Send email notifications to users</div>
              </div>
              <label className="set-toggle">
                <input type="checkbox" checked={settings.emailAlerts} onChange={(e) => toggleSetting('Email Alerts', 'emailAlerts', e.target.checked)} />
                <span className="set-toggle-slider"></span>
              </label>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Contract Expiry Alerts</div>
                <div className="set-desc">Notify families about expiring lease contracts</div>
              </div>
              <label className="set-toggle">
                <input type="checkbox" checked={settings.contractExpiryAlerts} onChange={(e) => toggleSetting('Contract Expiry Alerts', 'contractExpiryAlerts', e.target.checked)} />
                <span className="set-toggle-slider"></span>
              </label>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Payment Reminders</div>
                <div className="set-desc">Send reminders for overdue installments</div>
              </div>
              <label className="set-toggle">
                <input type="checkbox" checked={settings.paymentReminders} onChange={(e) => toggleSetting('Payment Reminders', 'paymentReminders', e.target.checked)} />
                <span className="set-toggle-slider"></span>
              </label>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">System Updates</div>
                <div className="set-desc">Notify admin of system updates and maintenance</div>
              </div>
              <label className="set-toggle">
                <input type="checkbox" checked={settings.systemUpdates} onChange={(e) => toggleSetting('System Updates', 'systemUpdates', e.target.checked)} />
                <span className="set-toggle-slider"></span>
              </label>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Expiry Alert Days</div>
                <div className="set-desc">Days before contract expiry to send alert</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" className="set-input" style={{ width: 80 }} value={settings.expiryDays} onChange={(e) => updateSetting("expiryDays", e.target.value)} />
                <span style={{ fontSize: "0.8rem", color: "#7a9fbe" }}>days</span>
              </div>
            </div>
          </div>

          {/* System Configuration */}
          <div className="set-section">
            <div className="set-section-title">
              <i className="fas fa-server"></i> System Configuration
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Site Name</div>
                <div className="set-desc">Name of the memorial park</div>
              </div>
              <input type="text" className="set-input" value={settings.siteName} onChange={(e) => updateSetting("siteName", e.target.value)} />
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Contact Phone</div>
                <div className="set-desc">Main contact number</div>
              </div>
              <input type="text" className="set-input" value={settings.contactPhone} onChange={(e) => updateSetting("contactPhone", e.target.value)} />
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Timezone</div>
                <div className="set-desc">System timezone</div>
              </div>
              <select className="set-select" value={settings.timezone} onChange={(e) => updateSetting("timezone", e.target.value)}>
                <option value="Asia/Manila">Asia/Manila (UTC+8)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                <option value="America/New_York">America/New_York (UTC-5)</option>
                <option value="Europe/London">Europe/London (UTC+0)</option>
              </select>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Currency</div>
                <div className="set-desc">Default currency for transactions</div>
              </div>
              <select className="set-select" value={settings.currency} onChange={(e) => updateSetting("currency", e.target.value)}>
                <option value="PHP">PHP (₱) - Philippine Peso</option>
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
              </select>
            </div>
          </div>

          {/* Security */}
          <div className="set-section">
            <div className="set-section-title">
              <i className="fas fa-shield-alt"></i> Security
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Auto Backup</div>
                <div className="set-desc">Automatically backup system data</div>
              </div>
              <label className="set-toggle">
                <input type="checkbox" checked={settings.autoBackup} onChange={(e) => toggleSetting('Auto Backup', 'autoBackup', e.target.checked)} />
                <span className="set-toggle-slider"></span>
              </label>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Backup Frequency</div>
                <div className="set-desc">How often to create backups</div>
              </div>
              <select className="set-select" value={settings.backupFrequency} onChange={(e) => updateSetting("backupFrequency", e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Two-Factor Authentication</div>
                <div className="set-desc">Require 2FA for admin logins</div>
              </div>
              <label className="set-toggle">
                <input type="checkbox" checked={settings.twoFactorAuth} onChange={(e) => toggleSetting('Two-Factor Authentication', 'twoFactorAuth', e.target.checked)} />
                <span className="set-toggle-slider"></span>
              </label>
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Session Timeout</div>
                <div className="set-desc">Auto-logout after inactivity</div>
              </div>
              <select className="set-select" value={settings.sessionTimeout} onChange={(e) => updateSetting("sessionTimeout", e.target.value)}>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </div>
          </div>

          {/* Contact & Address */}
          <div className="set-section">
            <div className="set-section-title">
              <i className="fas fa-address-card"></i> Contact & Location
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Contact Email</div>
                <div className="set-desc">Primary support email</div>
              </div>
              <input type="email" className="set-input" value={settings.contactEmail} onChange={(e) => updateSetting("contactEmail", e.target.value)} />
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Address</div>
                <div className="set-desc">Physical location of park</div>
              </div>
              <input type="text" className="set-input" value={settings.address} onChange={(e) => updateSetting("address", e.target.value)} />
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Map Coordinates</div>
                <div className="set-desc">Google Maps coordinates</div>
              </div>
              <input type="text" className="set-input" value={settings.coordinates} onChange={(e) => updateSetting("coordinates", e.target.value)} />
            </div>

            <div className="set-item">
              <div className="set-info">
                <div className="set-label">Operating Hours</div>
                <div className="set-desc">Daily operating hours</div>
              </div>
              <input type="text" className="set-input" value={settings.operatingHours} onChange={(e) => updateSetting("operatingHours", e.target.value)} />
            </div>
          </div>

        </div>
      </div>



      {/* ── SAVE MODAL ── */}
      {showSaveModal && (
        <div className="set-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <div className="set-modal-icon" style={{ color: "#27ae60" }}>
              <i className="fas fa-check-circle"></i>
            </div>
            <h3>Save Changes?</h3>
            <p className="set-modal-subtitle">Are you sure you want to save all settings changes?</p>
            <div className="set-modal-actions">
              <button className="set-btn-cancel" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="set-btn-confirm" onClick={confirmSave}>
                <i className="fas fa-save"></i> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET MODAL ── */}
      {showResetModal && (
        <div className="set-modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <div className="set-modal-icon" style={{ color: "#c0392b" }}>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Reset to Defaults?</h3>
            <p className="set-modal-subtitle">This will restore all settings to their default values. This action cannot be undone.</p>
            <div className="set-modal-actions">
              <button className="set-btn-cancel" onClick={() => setShowResetModal(false)}>Cancel</button>
              <button className="set-btn-danger" onClick={confirmReset}>
                <i className="fas fa-undo"></i> Reset Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
