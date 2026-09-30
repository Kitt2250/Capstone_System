import { Outlet } from "react-router";
import Sidebar from "../../components/Sidebar/Sidebar";
import SystemDateBanner from "../../components/SystemDateBanner/SystemDateBanner";

function Admin() {
    return (
        <div className="layout-container">
            <Sidebar role="admin"/>
            <main className="layout-content">
                <SystemDateBanner />
                <Outlet />
            </main>
        </div>
    );
}

export default Admin;