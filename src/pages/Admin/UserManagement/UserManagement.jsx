import { useEffect, useState } from "react";
import Table from "../../../components/Table/Table";
import { getUsers } from "../../../services/userServices";
import Header from "../../../components/Header/Header";
import Button from "../../../components/Buttons/Buttons";
import { Users, Search } from "lucide-react";
import "./UserManagement.css";
import Pagination from "../../../components/Pagination/Pagination";
import { archiveUserController, createUserController, updateUserController } from "../../../controller/userController";
import CreateUserModal from "../../../components/Modals/CreateUserModal";
import ViewModal from "../../../components/Modals/ViewModal/ViewModal";
import { exportToCSV, exportToJSON, exportToPDF } from "../../../components/Export";
import { formatDate } from "../../../components/DateFormatter/Date";
import ExportModal from "../../../components/Modals/ExportModal/Export";
import { sortUsersByJoined } from "../../../util/sortedUsers";
import UpdateUserModal from "../../../components/Modals/UpdateModal/UpdateModal";
import ArchiveModal from "../../../components/Modals/ArchiveModal/ArchiveModal";

function UserManagement() {

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [sortOrder, setSortOrder] = useState(null);

    const usersPerPage = 6;

    async function loadUsers() {
        try {
            const data = await getUsers();
            setUsers(data);
        } catch (error) {
            console.error(error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, roleFilter, statusFilter]);

    const handleView = (row) => {
        setSelectedUser(row);
        setIsViewModalOpen(true);
    };

    const handleEdit = (user) => {
        setSelectedUser(user);
        setShowUpdateModal(true);
    };

    const handleArchiveClick = (user) => {
        setSelectedUser(user);
        setShowArchiveModal(true);
    };

    const handleCreateUser = async (userData) => {
        await createUserController(userData);

        setIsCreateModalOpen(false);

        const data = await getUsers();
        setUsers(data);
    };

    const handleUpdate = async (formData) => {
        await updateUserController(selectedUser.id, formData);

        setShowUpdateModal(false);
        setSelectedUser(null);

        const data = await getUsers();
        setUsers(data);
    };


    const handleArchive = async (user) => {
        try {
            await archiveUserController(user.id);

            setShowArchiveModal(false);
            setSelectedUser(null);

            await loadUsers();
        } catch (error) {
            console.error("Failed to archive user:", error);
        }
    };

    const handleExport = (format) => {
        if (format === "csv") {
            exportToCSV(users, "users");
        }

        if (format === "json") {
            exportToJSON(users, "users");
        }

        if (format === "pdf") {
            exportToPDF(users, "users");
        }
    };

    // Avatar color generator based on name
    const AVATAR_PALETTES = [
        { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" }, // Blue
        { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" }, // Green
        { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" }, // Purple
        { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" }, // Orange
        { bg: "#fdf2f8", text: "#be185d", border: "#fbcfe8" }, // Pink
        { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" }  // Cyan
    ];

    const getAvatarStyle = (name = "") => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % AVATAR_PALETTES.length;
        return AVATAR_PALETTES[index];
    };

    //TABLE SECTION
    const columns = [
        {
            key: "name",
            label: "Name",
            render: (row) => {
                const initial = (row.name?.trim()?.[0] || "?").toUpperCase();
                const palette = getAvatarStyle(row.name || "");

                return (
                    <div className="user-name-cell">
                        <span
                            className="user-avatar-badge"
                            style={{
                                backgroundColor: palette.bg,
                                color: palette.text,
                                borderColor: palette.border
                            }}
                        >
                            {initial}
                        </span>
                        <div className="user-info-text">
                            <span className="user-name-text">{row.name || "—"}</span>
                            <span className="user-email-text">{row.email || ""}</span>
                        </div>
                    </div>
                );
            }
        },
        {
            key: "role",
            label: "Role",
            render: (row) => (
                <span className="role-cell-text">{row.role || "—"}</span>
            )
        },
        {
            key: "status",
            label: "Status",
            render: (row) => {
                const status = (row.status || "").toLowerCase();
                if (status === "archived") {
                    return (
                        <span className="status-pill status-archived">
                            <span className="status-dot"></span>
                            Archived
                        </span>
                    );
                }
                const isActive = status === "active";
                return (
                    <span className={`status-pill ${isActive ? "status-active" : "status-inactive"}`}>
                        <span className="status-dot"></span>
                        {isActive ? "Active" : "Inactive"}
                    </span>
                );
            }
        },
        {
            key: "joined",
            label: "Joined",
            onSort: () => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc")),
            render: (row) => (
                <span className="joined-cell-text">{formatDate(row.createdAt)}</span>
            )
        },
        {
            key: "actions",
            label: "",
            render: (row) => {
                const role = (row.role || "").toLowerCase().trim();
                const isArchived = (row.status || "").toLowerCase().trim() === "archived";
                const isStaffOrAdmin = role === "admin" || role === "staff";
                const isFamily = role === "family" || !isStaffOrAdmin;

                return (
                    <div className="actions-cell">
                        <Button
                            variant="view"
                            onClick={() => handleView(row)}
                            title="View"
                        />

                        <Button
                            variant="edit"
                            onClick={() => handleEdit(row)}
                            title="Edit"
                        />

                        {isStaffOrAdmin && !isArchived && (
                            <Button
                                variant="deactivate"
                                onClick={() => handleArchiveClick(row)}
                                title="Deactivate"
                            />
                        )}

                        {isFamily && !isArchived && (
                            <Button
                                variant="deactivate"
                                disabled={true}
                                title="Deactivate (Cannot deactivate family accounts)"
                            />
                        )}
                    </div>
                );
            }
        }
    ];

    // VIEW SECTION
    const userViewFields = [
        {
            name: "name",
            label: "Name"
        },
        {
            name: "email",
            label: "Email"
        },
        {
            name: "role",
            label: "Role"
        },
        {
            name: "status",
            label: "Status"
        },
        {
            name: "createdAt",
            label: "Date Created",
            type: "date"
        }
    ];

    const nonArchivedUsers = users.filter((u) => (u.status || "").toLowerCase() !== "archived");

    const filteredUsers = users.filter((u) => {
        const userStatus = (u.status || "").toLowerCase();
        const filterStatus = statusFilter.toLowerCase();

        // If status filter is "all", exclude archived users by default
        if (filterStatus === "all" && userStatus === "archived") {
            return false;
        }

        const matchesStatus =
            filterStatus === "all" ||
            userStatus === filterStatus;

        const query = searchQuery.toLowerCase().trim();
        const matchesSearch =
            !query ||
            (u.name && u.name.toLowerCase().includes(query)) ||
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.role && u.role.toLowerCase().includes(query));

        const matchesRole =
            roleFilter === "all" ||
            (u.role && u.role.toLowerCase() === roleFilter.toLowerCase());

        return matchesSearch && matchesRole && matchesStatus;
    });

    const sortedUsers = sortUsersByJoined(filteredUsers, sortOrder);
    const totalPages = Math.ceil(sortedUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const paginatedUsers = sortedUsers.slice(
        startIndex,
        startIndex + usersPerPage
    );

    if (loading) {
        return <p>Loading users...</p>;
    }

    if (error) {
        return <p>Error: {error}</p>;
    }


    const totalUsersCount = nonArchivedUsers.length;
    const activeUsersCount = nonArchivedUsers.filter((u) => (u.status || "").toLowerCase() === "active").length;
    const staffUsersCount = nonArchivedUsers.filter((u) => (u.role || "").toLowerCase() === "staff").length;
    const adminUsersCount = nonArchivedUsers.filter((u) => (u.role || "").toLowerCase() === "admin").length;

    const hasActiveFilters = searchQuery.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

    const handleRemoveFilters = () => {
        setSearchQuery("");
        setRoleFilter("all");
        setStatusFilter("all");
    };

    return (
        <div className="user-management-page">

            <Header page="users" />

            <div className="user-management-container">
                <div className="page-title-bar">
                    <h2>
                        Users
                    </h2>
                    <div className="page-actions-group">
                        <Button
                            variant="export"
                            onClick={() => setIsExportModalOpen(true)}
                            title="Export"
                        >
                            Export
                        </Button>
                        <Button
                            variant="create"
                            onClick={() => setIsCreateModalOpen(true)}
                            title="Create User">Create User</Button>
                    </div>
                </div>

                {/* 4 Summary Metric Cards matching screenshot */}
                <div className="um-kpi-grid">
                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">Total Accounts</span>
                            <span className="um-kpi-pill green">Active</span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{totalUsersCount}</span>
                            <span className="um-kpi-unit">ppl</span>
                        </div>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">Active Users</span>
                            <span className="um-kpi-pill green">Online</span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{activeUsersCount}</span>
                            <span className="um-kpi-unit">ppl</span>
                        </div>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">Staff Members</span>
                            <span className="um-kpi-pill blue">Team</span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{staffUsersCount}</span>
                            <span className="um-kpi-unit">ppl</span>
                        </div>
                    </div>

                    <div className="um-kpi-card">
                        <div className="um-kpi-card-header">
                            <span className="um-kpi-label">Administrators</span>
                            <span className="um-kpi-pill purple">Access</span>
                        </div>
                        <div className="um-kpi-card-body">
                            <span className="um-kpi-value">{adminUsersCount}</span>
                            <span className="um-kpi-unit">ppl</span>
                        </div>
                    </div>
                </div>

                <div className="filters-bar">
                    <div className="search-wrapper">
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        className="filter-select"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="all">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="family">Family</option>
                    </select>
                    <select
                        className="filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="Archived">Archived</option>
                    </select>

                    {hasActiveFilters && (
                        <Button
                            variant="reset"
                            onClick={handleRemoveFilters}
                            title="Remove Filter"
                        >
                            Remove Filter
                        </Button>
                    )}
                </div>

                <Table
                    data={paginatedUsers}
                    columns={columns}
                />

                <div className="um-pagination-bar">
                    <span className="um-showing-text">
                        Showing {sortedUsers.length === 0 ? 0 : startIndex + 1} to{' '}
                        {Math.min(startIndex + usersPerPage, sortedUsers.length)} of{' '}
                        {sortedUsers.length} users
                    </span>
                    {totalPages > 1 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                        />
                    )}
                </div>
            </div>

            <CreateUserModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreate={handleCreateUser}
            />

            <ViewModal
                isOpen={isViewModalOpen}
                onClose={() => setIsViewModalOpen(false)}
                title="User Details"
                data={selectedUser}
                fields={userViewFields}
            />

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                title="Export Users"
                onExport={handleExport}
            />

            <UpdateUserModal
                isOpen={showUpdateModal}
                user={selectedUser}
                onClose={() => {
                    setShowUpdateModal(false);
                    setSelectedUser(null);
                }}
                onUpdate={handleUpdate}
            />

            <ArchiveModal
                isOpen={showArchiveModal}
                user={selectedUser}
                onClose={() => {
                    setShowArchiveModal(false);
                    setSelectedUser(null);
                }}
                onConfirm={handleArchive}
            />

        </div>
    );
}


export default UserManagement;
