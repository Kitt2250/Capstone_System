import React, { useState, useEffect, useMemo } from "react";
import { Search, X, User, Phone, MapPin, Check, RefreshCw } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";
import Pagination from "../Pagination/Pagination";
import "./ExistingClientModal.css";

/**
 * ExistingClientModal
 * Search and select an existing client from Firestore's "clients" collection.
 *
 * Props:
 *  isOpen           {boolean}   – Controls visibility
 *  onClose          {Function}  – Callback to close modal
 *  onSelectClient   {Function}  – Callback when a client row is selected
 *  selectedClientId {string}    – Currently selected client document ID or user_id
 */
export default function ExistingClientModal({
    isOpen,
    onClose,
    onSelectClient,
    selectedClientId = null,
}) {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 7;

    // Real-time listener to Firestore "clients" and "users" collection
    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);
        const clientsRef = collection(db, "clients");
        const usersRef = collection(db, "users");
        let usersMap = {};

        // 1. Listen to users collection to catch user emails
        const unsubUsers = onSnapshot(
            usersRef,
            (uSnapshot) => {
                usersMap = {};
                uSnapshot.docs.forEach((uDoc) => {
                    const uData = uDoc.data();
                    usersMap[uDoc.id] = uData;
                    if (uData.uid) {
                        usersMap[uData.uid] = uData;
                    }
                    if (uData.user_id) {
                        usersMap[uData.user_id] = uData;
                    }
                    if (uData.email) {
                        usersMap[uData.email.toLowerCase()] = uData;
                    }
                });

                // Re-enrich clients if already loaded
                setClients((prev) =>
                    prev.map((c) => {
                        const uid = c.user_id || c.userId || c.uid || c.id;
                        const userDoc = usersMap[uid];
                        return {
                            ...c,
                            email: c.email || userDoc?.email || "",
                        };
                    })
                );
            },
            (err) => console.warn("Could not listen to users collection:", err)
        );

        // 2. Listen to clients collection
        const unsubClients = onSnapshot(
            clientsRef,
            (snapshot) => {
                const list = snapshot.docs.map((docSnap) => {
                    const data = docSnap.data();
                    const uid = data.user_id || data.userId || data.uid || docSnap.id;
                    const userDoc = usersMap[uid];
                    const email = data.email || userDoc?.email || "";

                    return {
                        id: docSnap.id,
                        ...data,
                        email,
                    };
                });

                // Sort alphabetically by full name
                list.sort((a, b) => {
                    const nameA = `${a.first_name || a.firstName || ""} ${a.last_name || a.lastName || ""}`.trim().toLowerCase() || (a.name || "").toLowerCase();
                    const nameB = `${b.first_name || b.firstName || ""} ${b.last_name || b.lastName || ""}`.trim().toLowerCase() || (b.name || "").toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                setClients(list);
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching clients from Firestore:", error);
                setLoading(false);
            }
        );

        return () => {
            unsubClients();
            unsubUsers();
        };
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                onClose?.();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Reset pagination when search query changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // Filter clients based on search query
    const filteredClients = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return clients;

        return clients.filter((c) => {
            const firstName = (c.first_name || c.firstName || "").toLowerCase();
            const lastName = (c.last_name || c.lastName || "").toLowerCase();
            const fullName = `${firstName} ${lastName}`.trim();
            const name = (c.name || "").toLowerCase();
            const email = (c.email || "").toLowerCase();
            const contact = (c.contact || c.contactNumber || c.phone || "").toLowerCase();
            const address = (c.address || "").toLowerCase();

            return (
                fullName.includes(query) ||
                name.includes(query) ||
                firstName.includes(query) ||
                lastName.includes(query) ||
                contact.includes(query) ||
                address.includes(query)
            );
        });
    }, [clients, searchQuery]);

    // Paginate results
    const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);
    const paginatedClients = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredClients.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredClients, currentPage]);

    if (!isOpen) return null;

    return (
        <div className="ecm-overlay" onClick={onClose}>
            <div className="ecm-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="ecm-header">
                    <div className="ecm-title-group">
                        <div className="ecm-header-icon">
                            <User size={20} />
                        </div>
                        <div>
                            <h3 className="ecm-title">Select Existing Client</h3>
                            <p className="ecm-subtitle">
                                Search and select a registered client from the <strong>clients</strong> collection
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ecm-close-btn"
                        onClick={onClose}
                        title="Close modal (Esc)"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Search Bar & Stats */}
                <div className="ecm-toolbar">
                    <div className="ecm-search-box">
                        <Search size={16} className="ecm-search-icon" />
                        <input
                            type="text"
                            className="ecm-search-input"
                            placeholder="Search by client name, contact number, or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className="ecm-search-clear"
                                onClick={() => setSearchQuery("")}
                                title="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="ecm-count-pill">
                        {filteredClients.length} {filteredClients.length === 1 ? "Client" : "Clients"}
                    </div>
                </div>

                {/* Table Container */}
                <div className="ecm-table-container">
                    {loading ? (
                        <div className="ecm-loading-state">
                            <RefreshCw className="ecm-spinner" size={26} />
                            <span>Loading clients from database...</span>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="ecm-empty-state">
                            <User size={36} className="ecm-empty-icon" />
                            <h4>No clients found</h4>
                            <p>
                                {searchQuery
                                    ? `No client matches "${searchQuery}". Try a different keyword.`
                                    : "No records found in the clients collection."}
                            </p>
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="ecm-clear-search-btn"
                                    onClick={() => setSearchQuery("")}
                                >
                                    Clear Search Query
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="ecm-table">
                            <thead>
                                <tr>
                                    <th>Client Name</th>
                                    <th>Contact Number</th>
                                    <th>Address</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: "right", paddingRight: "18px" }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedClients.map((client) => {
                                    const clientFirstName = client.first_name || client.firstName || "";
                                    const clientLastName = client.last_name || client.lastName || "";
                                    const fullName = `${clientFirstName} ${clientLastName}`.trim() || client.name || "Unnamed Client";
                                    const contact = client.contact || client.contactNumber || client.phone || "—";
                                    const address = client.address || "—";
                                    const isSelected =
                                        selectedClientId &&
                                        (selectedClientId === client.id ||
                                            selectedClientId === client.user_id ||
                                            selectedClientId === client.userId);

                                    const isActive =
                                        client.status === "active" ||
                                        client.isActivate === true ||
                                        client.is_activate === true;

                                    return (
                                        <tr
                                            key={client.id}
                                            className={`ecm-row ${isSelected ? "ecm-row-selected" : ""}`}
                                            onClick={() => onSelectClient?.(client)}
                                        >
                                            <td>
                                                <div className="ecm-name-cell">
                                                    <div className="ecm-avatar">
                                                        {fullName.charAt(0).toUpperCase() || "C"}
                                                    </div>
                                                    <div>
                                                        <div className="ecm-client-name">{fullName}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="ecm-contact-cell">
                                                    <Phone size={12} className="ecm-cell-icon" />
                                                    {contact}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="ecm-address-cell" title={address}>
                                                    <MapPin size={12} className="ecm-cell-icon" />
                                                    {address}
                                                </span>
                                            </td>
                                            <td>
                                                {isActive ? (
                                                    <span className="status-pill status-active">
                                                        <span className="status-dot"></span>
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="status-pill status-pending">
                                                        <span className="status-dot"></span>
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right", paddingRight: "18px" }}>
                                                {isSelected ? (
                                                    <span className="ecm-selected-badge">
                                                        <Check size={13} />
                                                        Selected
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="ecm-select-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onSelectClient?.(client);
                                                        }}
                                                    >
                                                        Select
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="ecm-footer">
                    <div className="ecm-footer-info">
                        Showing{" "}
                        <strong>
                            {filteredClients.length === 0
                                ? 0
                                : (currentPage - 1) * ITEMS_PER_PAGE + 1}
                        </strong>{" "}
                        to{" "}
                        <strong>
                            {Math.min(currentPage * ITEMS_PER_PAGE, filteredClients.length)}
                        </strong>{" "}
                        of <strong>{filteredClients.length}</strong> clients
                    </div>

                    <div className="ecm-footer-actions">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                        />
                        <button
                            type="button"
                            className="ecm-close-footer-btn"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
