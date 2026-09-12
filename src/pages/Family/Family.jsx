import { Outlet } from "react-router";
import Sidebar from "../../components/Sidebar/Sidebar";

function Family() {
    return (
        <div className="layout-container">
            <Sidebar role="family" />
            <main className="layout-content">
                <Outlet />
            </main>
        </div>
    );
}

export default Family;