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
                <Route path="reports" element={<></>} />
                <Route path="settings" element={<></>} />
                <Route path="backup" element={<></>} />
              </Route>

              <Route path="*" element={<Navigate to="/admin" replace />} />
            </>
          )}

          {user && role === "staff" && (
            <>
              <Route path="/staff/*" element={<Staff />} />
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