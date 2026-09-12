import { useEffect, useState } from "react";
import Table from "../../../components/Table/Table";
import { getUsers } from "../../../services/userServices";
import Header from "../../../components/Header/Header";
import Button from "../../../components/Buttons/Buttons";
import { Users, Search } from "lucide-react";
import "./UserManagement.css";
import Pagination from "../../../components/Pagination/Pagination";

function UserManagement() {

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const [currentPage, setCurrentPage] = useState(1);

    const usersPerPage = 6;

    useEffect(() => {

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

        loadUsers();

    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, roleFilter, statusFilter]);

    const handleView = (row) => {
        console.log("View user", row);
    };

    const handleEdit = (row) => {
        console.log("Edit user", row);
    };

    const handleDeactivate = (row) => {
        console.log("Deactivate user", row);
    };

    const columns = [

        {
            key: "name",
            label: "Name"
        },
        {
            key: "email",
            label: "Email"
        },
        {
            key: "role",
            label: "Role"
        },
        {
            key: "status",
            label: "Status"
        },
        {
            key: "actions",
            label: "Actions",
            render: (row) => (
                <div className="actions-cell">
                    <Button variant="view" onClick={() => handleView(row)} title="View" />
                    <Button variant="edit" onClick={() => handleEdit(row)} title="Edit" />
                    <Button variant="deactivate" onClick={() => handleDeactivate(row)} title="Deactivate" />
                </div>
            )
        }
    ];

    const filteredUsers = users.filter((u) => {
        const query = searchQuery.toLowerCase().trim();
        const matchesSearch =
            !query ||
            (u.name && u.name.toLowerCase().includes(query)) ||
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.role && u.role.toLowerCase().includes(query));

        const matchesRole =
            roleFilter === "all" ||
            (u.role && u.role.toLowerCase() === roleFilter.toLowerCase());

        const matchesStatus =
            statusFilter === "all" ||
            (u.status && u.status.toLowerCase() === statusFilter.toLowerCase());

        return matchesSearch && matchesRole && matchesStatus;
    });

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const paginatedUsers = filteredUsers.slice(
        startIndex,
        startIndex + usersPerPage
    );

    if (loading) {
        return <p>Loading users...</p>;
    }

    if (error) {
        return <p>Error: {error}</p>;
    }


    return (
        <div className="user-management-page">

            <Header page="users" />

            <div className="user-management-container">
                <div className="page-title-bar">
                    <h2>
                        <Users size={22} className="page-title-icon" />
                        User Accounts
                        <span className="badge-count">{filteredUsers.length} total</span>
                    </h2>
                    <Button variant="create" onClick={() => { }} title="Create User">Create User</Button>
                </div>

                <div className="filters-bar">
                    <div className="search-wrapper">
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search by name, email, or role..."
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
                    </select>
                </div>

                <Table
                    data={paginatedUsers}
                    columns={columns}
                />

                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>

        </div>
    );
}


export default UserManagement;
