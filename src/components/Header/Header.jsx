function Header({ page }) {

    let title = "";
    let description = "";

    if (page === "dashboard") {
        title = "Dashboard";
        description = "View an overview of the memorial services system.";
    }

    if (page === "users") {
        title = "User Management";
        description = "Manage system users, roles, and account status.";
    }

    if (page === "audit-log") {
        title = "Audit Log";
        description = "View records of activities performed in the system.";
    }

    if (page === "map") {
        title = "Map Management";
        description = "Manage cemetery plots and their locations.";
    }

    if (page === "grave") {
        title = "Grave Management";
        description = "no descript.";
    }

    if (page === "reports") {
        title = "Reports";
        description = "View and generate system reports.";
    }

    if (page === "settings") {
        title = "Settings";
        description = "Manage system settings and configurations.";
    }

    return (
        <header>
            <h1>{title}</h1>
            <p>{description}</p>
        </header>
    );
}

export default Header;
