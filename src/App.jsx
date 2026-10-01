import { useEffect, useState } from "react"
import Login from "./pages/Login/Login"
import { BrowserRouter, Routes, Route, Navigate } from "react-router"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { auth } from "./firebase/config"
import Admin from "./pages/Admin/Admin"
import { getUserData } from "./services/userServices"
import Staff from "./pages/Staff/Staff"
import Family from "./pages/Family/Family"
import UserManagement from "./pages/Admin/UserManagement/UserManagement"
import Dashboard from "./pages/Admin/Dashboard/Dashboard"
import GraveManagement from "./pages/Admin/GraveManagement/GraveManagement"
import AuditLogs from "./pages/Admin/Audit Logs/AuditLogs"
import MapManagement from "./pages/Admin/MapManagement/MapManagement"
import AdminAbuse from "./pages/Admin/AdminAbuse/AdminAbuse"
import AdminReports from "./pages/Admin/Reports/AdminReports"
import AdminSettings from "./pages/Admin/Settings/AdminSettings"
import AdminBackup from "./pages/Admin/Backup/AdminBackup"
import WakeSpace from "./pages/Staff/WakeSpace/Wakespace"
import PointOfSale from "./pages/Staff/PointOfSale/PointOfSale"
import Payments from "./pages/Staff/Payments/Payments"
import Interment from "./pages/Staff/Interment/Interment"
import Burials from "./pages/Staff/Burials/Burials"
import Notifications from "./pages/Staff/Notifications/Notifications"
import Renewals from "./pages/Staff/Renewals/Renewals"
import StaffDashboard from "./pages/Staff/Dashboard/StaffDashboard"
import StaffMyAccount from "./pages/Staff/MyAccount/StaffMyAccount"
import { initWakeSpaceAutoSync } from "./controller/wakeSpaceController"
import { initOperationalAlertsAutoSync } from "./controller/notificationController"
function App() {

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState()
  const [userDataRole, setUserDataRole] = useState()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        try {
          const userData = await getUserData(user.uid);
          setUserDataRole(userData.role);
        } catch (err) {
          console.error("Failed to fetch user role:", err);
          setUserDataRole(null);
        }
      } else {
        setUser(null);
        setUserDataRole(null);
      }
      setLoading(false); // only now — after user AND role are both resolved
    });

    return () => unsubscribe();
  }, []);

  // ── Auto-sync Wake Space booking lifecycle against System Date (PHT) ──
  useEffect(() => {
    const unsub = initWakeSpaceAutoSync();
    return () => unsub();
  }, []);

  // ── Auto-sync Operational Alerts (Installment due dates, Overdue, Vigils) ──
  useEffect(() => {
    const unsub = initOperationalAlertsAutoSync();
    return () => unsub();
  }, []);

  if (loading) return <></>

  const role = (userDataRole || "").toLowerCase();

  return (
    <>
      <BrowserRouter>
        <Routes>

          {!user && (
            <>
              <Route path="/login" element={<Login />} />
              <Route
                path="*"
                element={<Navigate to="/login" replace />}
              />
            </>
          )}

          {user && role === "admin" && (
            <>
              <Route path="/admin" element={<Admin />}>
                <Route index element={<Dashboard />} />
                <Route path="users-management" element={<UserManagement />} />
                <Route path="audit-log" element={<AuditLogs />} />
                <Route path="map" element={<MapManagement />} />
                <Route path="grave-management" element={<GraveManagement />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="backup" element={<AdminBackup />} />
                <Route path="admin-configuration" element={<AdminAbuse />} />
                <Route path="admin-test" element={<Navigate to="/admin/admin-configuration" replace />} />
                <Route path="admin-abuse" element={<Navigate to="/admin/admin-configuration" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/admin" replace />} />
            </>
          )}

          {user && role === "staff" && (
            <>
              <Route path="/staff" element={<Staff />}>
                <Route index element={<StaffDashboard />} />
                <Route path="grave-management" element={<GraveManagement isStaff={true} />} />
                <Route path="point-of-sale" element={<PointOfSale />} />
                <Route path="interment" element={<Interment />} />
                <Route path="burials" element={<Burials />} />
                <Route path="payments" element={<Payments />} />
                <Route path="wake-spaces" element={<WakeSpace />} />
                <Route path="renewals" element={<Renewals />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="my-accounts" element={<StaffMyAccount />} />
              </Route>
              <Route
                path="*"
                element={<Navigate to="/staff" replace />}
              />
            </>
          )}

          {user && role === "family" && (
            <>
              <Route path="/family/*" element={<Family />} />
              <Route
                path="*"
                element={<Navigate to="/family" replace />}
              />
            </>
          )}

          {user && !["admin", "staff", "family"].includes(role) && (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}

        </Routes>
      </BrowserRouter>
    </>
  )
}
export default App