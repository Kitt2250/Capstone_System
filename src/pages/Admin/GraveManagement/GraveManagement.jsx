import { useEffect, useState } from "react";
import Header from "../../../components/Header/Header";
import Table from "../../../components/Table/Table";
import Pagination from "../../../components/Pagination/Pagination";
import Button from "../../../components/Buttons/Buttons";
import { getGraveTypes, getIntermentFees } from "../../../services/graveServices";
import { createGraveTypeController, updateGraveTypeController } from "../../../controller/graveController";
import { Search, Settings, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import GraveUpdateModal from "../../../components/Modals/UpdateModal/GraveUpdateModal/GraveUpdateModal";
import GraveAddModal from "../../../components/Modals/AddModal/GraveAddModal/GraveAddModal";
import "./GraveManagement.css";

export default function GraveManagement() {
    const [activeTab, setActiveTab] = useState("config");

    // ── Grave Configuration states ──
    const [graveTypes, setGraveTypes] = useState([]);
    const [intermentFees, setIntermentFees] = useState([]);
    const [graveTypesLoading, setGraveTypesLoading] = useState(true);
    const [configSearch, setConfigSearch] = useState("");
    const [configPage, setConfigPage] = useState(1);
    const [selectedGrave, setSelectedGrave] = useState(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const configPerPage = 6;

    async function loadData() {
        try {
            setGraveTypesLoading(true);
            const [types, fees] = await Promise.all([
                getGraveTypes(),
                getIntermentFees()
            ]);
            setGraveTypes(types);
            setIntermentFees(fees);
        } catch (err) {
            console.error(err);
        } finally {
            setGraveTypesLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    const handleEdit = (grave) => {
        setSelectedGrave(grave);
        setShowUpdateModal(true);
    };

    const handleUpdate = async (formData) => {
        await updateGraveTypeController(selectedGrave.id, formData);
        setShowUpdateModal(false);
        setSelectedGrave(null);
        await loadData();
    };

    const handleAdd = async (payload, stagedInterments = []) => {
        const createdId = await createGraveTypeController(payload, stagedInterments);
        setShowAddModal(false);
        await loadData();
        return createdId;
    };

    useEffect(() => {
        setConfigPage(1);
    }, [configSearch]);

    // ── Helper: count interment fees for a grave type ID ──
    const getIntermentCount = (graveTypeId) => {
        return intermentFees.filter(
            (f) => (f.graveLot_type || f.grave_type_id) === graveTypeId
        ).length;
    };

    // ── Config filter & pagination ──
    const filteredGraveTypes = graveTypes.filter((gt) => {
        const query = configSearch.toLowerCase().trim();
        if (!query) return true;
        const name = (gt.grave_type || "").toLowerCase();
        return name.includes(query);
    });

    const configTotalPages = Math.ceil(filteredGraveTypes.length / configPerPage) || 1;
    const configStartIndex = (configPage - 1) * configPerPage;
    const paginatedGraveTypes = filteredGraveTypes.slice(configStartIndex, configStartIndex + configPerPage);

    // ── Config columns ──
    const configColumns = [
        {
            key: "grave_type_id",
            label: "#",
            render: (row, idx) => (
                <span className="config-index">{configStartIndex + idx + 1}</span>
            )
        },
        {
            key: "grave_type",
            label: "Grave Type",
            render: (row) => (
                <span className="config-type-name">
                    {row.grave_type || "—"}
                </span>
            )
        },
        {
            key: "lot_price",
            label: "Lot Price",
            render: (row) => (
                <span className="lot-price">
                    {row.lot_price != null ? `₱${Number(row.lot_price).toLocaleString()}` : "—"}
                </span>
            )
        },
        {
            key: "interment",
            label: "Interment",
            render: (row) => {
                const count = getIntermentCount(row.id);
                return (
                    <span className="interment-count">
                        {count}
                    </span>
                );
            }
        },
        {
            key: "installment",
            label: "Installment",
            render: (row) => {
                const hasInstallment = !!row.installment;
                return (
                    <span className={`installment-pill ${hasInstallment ? "installment-yes" : "installment-no"}`}>
                        {hasInstallment ? "Eligible" : "No"}
                    </span>
                );
            }
        },
        {
            key: "contract",
            label: "Ownership / Lease",
            render: (row) => (
                <span className={`config-contract ${!row.contract ? "contract-perpetual" : ""}`}>
                    {row.contract || "Perpetual"}
                </span>
            )
        },
        {
            key: "actions",
            label: "",
            render: (row) => (
                <div className="actions-cell">
                    <button
                        className="config-action-btn config-edit-btn"
                        onClick={() => handleEdit(row)}
                        title="Edit"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        className="config-action-btn config-delete-btn"
                        onClick={() => console.log("Delete grave type:", row)}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="grave-management-page">
            <Header page="grave" />

            <div className="grave-management-container">
                {/* ── Tab Switcher ── */}
                <div className="gm-tab-bar">
                    <button
                        className={`gm-tab-btn ${activeTab === "config" ? "gm-tab-active" : ""}`}
                        onClick={() => setActiveTab("config")}
                    >
                        <Settings size={15} />
                        <span>Grave Configuration</span>
                    </button>
                    <button
                        className={`gm-tab-btn ${activeTab === "lot" ? "gm-tab-active" : ""}`}
                        onClick={() => setActiveTab("lot")}
                    >
                        <LayoutGrid size={15} />
                        <span>Grave Lot</span>
                    </button>
                </div>

                {/* ── TAB: Grave Configuration ── */}
                {activeTab === "config" && (
                    <div className="gm-config-section">
                        <div className="page-title-bar">
                            <h2>Grave Type Configuration</h2>
                            <div className="page-actions-group">
                                <Button
                                    variant="create"
                                    onClick={() => setShowAddModal(true)}
                                    title="Add Type"
                                >
                                    Add Type
                                </Button>
                            </div>
                        </div>

                        <div className="filters-bar">
                            <div className="search-wrapper">
                                <Search size={16} className="search-icon" />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search grave type..."
                                    value={configSearch}
                                    onChange={(e) => setConfigSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {graveTypesLoading ? (
                            <p>Loading grave types...</p>
                        ) : (
                            <>
                                <Table
                                    data={paginatedGraveTypes}
                                    columns={configColumns}
                                />
                                <Pagination
                                    currentPage={configPage}
                                    totalPages={configTotalPages}
                                    onPageChange={setConfigPage}
                                />
                            </>
                        )}
                    </div>
                )}

                {/* ── TAB: Grave Lot (empty for now) ── */}
                {activeTab === "lot" && (
                    <div className="gm-lot-section">
                        <div className="page-title-bar">
                            <h2>Grave & Plot Records</h2>
                        </div>
                        <div className="gm-lot-empty">
                            <LayoutGrid size={40} strokeWidth={1.2} />
                            <p>Grave Lot coming soon</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Grave Update Modal ── */}
            <GraveUpdateModal
                isOpen={showUpdateModal}
                grave={selectedGrave}
                intermentFees={intermentFees}
                onClose={() => {
                    setShowUpdateModal(false);
                    setSelectedGrave(null);
                }}
                onUpdate={handleUpdate}
            />

            {/* ── Grave Add Modal ── */}
            <GraveAddModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onAdd={handleAdd}
            />
        </div>
    );
}