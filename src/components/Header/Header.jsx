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

    if (page === "backup" || page === "backup-restore") {
        title = "Backup & Restore";
        description = "Manage system backups, database snapshots, and restoration points.";
    }

    if (page === "pos" || page === "point-of-sale") {
        title = "Point of Sale";
        description = "Process purchases, payments, and cemetery service bookings.";
    }

    if (page === "interment") {
        title = "Interment Services";
        description = "Record burial services, transfers, and exhumations for owned cemetery plots.";
    }

    if (page === "payments") {
        title = "Payments & Installments";
        description = "Track installment accounts, record milestone payments, and review receipt history.";
    }

    if (page === "wake-spaces") {
        title = "Wake Space Bookings";
        description = "Manage wake space reservations and active vigil schedules.";
    }

    if (page === "notifications") {
        title = "Notifications & Alerts";
        description = "Monitor operational alerts, vigil schedules, installment due dates, and system updates.";
    }

    if (page === "burials" || page === "burial") {
        title = "Burial Records";
        description = "Comprehensive registry of deceased records, interment details, and grave allocations.";
    }

    if (page === "renewals" || page === "renewal") {
        title = "Contract Renewals";
        description = "Track grave lot lease durations, monitor expiration cycles, and process contract renewals.";
    }

    if (page === "my-accounts" || page === "my-account" || page === "account") {
        title = "My Account";
        description = "Manage your staff profile, credentials, and account settings.";
    }

    return (
        <header>
            <h1>{title}</h1>
            <p>{description}</p>
        </header>
    );
}

export default Header;
