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
        description = "Manage cemetery graves, plot allocations, and interment records.";
    }

    if (page === "reports") {
        title = "Reports";
        description = "View and generate system reports.";
    }

    if (page === "settings") {
        title = "Settings";
        description = "Manage system settings and configurations.";
    }

    if (page === "pos" || page === "point-of-sale") {
        title = "Point of Sale";
        description = "Process purchases, payments, and cemetery service bookings.";
    }

    if (page === "wake-spaces") {
        title = "Wake Space Bookings";
        description = "Manage wake space reservations and active vigil schedules.";
    }

    return (
        <header>
            <h1>{title}</h1>
            <p>{description}</p>
        </header>
    );
}

export default Header;
