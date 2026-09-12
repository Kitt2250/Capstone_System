import { Outlet } from "react-router";
import Sidebar from "../../components/Sidebar/Sidebar";

function Staff() {
    return (
        <div className="layout-container">
            <Sidebar role="staff" />
            <main className="layout-content">
                <Outlet />
            </main>
        </div>
    );
}

export default Staff;