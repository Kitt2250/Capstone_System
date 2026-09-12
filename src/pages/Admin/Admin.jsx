import { Outlet } from "react-router";
import Sidebar from "../../components/Sidebar/Sidebar";

function Admin() {
    return (
        <div className="layout-container">
            <Sidebar role="admin"/>
            <main className="layout-content">
                <Outlet />
            </main>
        </div>
    );
}

export default Admin;