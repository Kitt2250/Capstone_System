import { Outlet } from "react-router";
import Sidebar from "../../components/Sidebar/Sidebar";
import SystemDateBanner from "../../components/SystemDateBanner/SystemDateBanner";

function Staff() {
    return (
        <div className="layout-container">
            <Sidebar role="staff" />
            <main className="layout-content">
                <SystemDateBanner />
                <Outlet />
            </main>
        </div>
    );
}

export default Staff;