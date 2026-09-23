import { useEffect, useState } from "react";
import { X, UserCheck, AlertCircle } from "lucide-react";
import "./UpdateModal.css";

function UpdateUserModal({ isOpen, user, onClose, onUpdate }) {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        contactNo: "",
        role: "staff",
        status: "active"
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Load selected user's data into the form
    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || "",
                email: user.email || "",
                contactNo: user.contactNo || "",
                role: (user.role || "staff").toLowerCase(),
                status: (user.status || "active").toLowerCase()
            });
            setError("");
        }
    }, [user, isOpen]);

    if (!isOpen || !user) {
        return null;
    }

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));

        if (error) setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await onUpdate(formData);
            handleClose();
        } catch (err) {
            setError(err.message || "Failed to update user.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setError("");
        setLoading(false);
        onClose();
    };

    return (
        <div className="update-modal-overlay" onClick={handleClose}>
            <div className="update-modal" onClick={(e) => e.stopPropagation()}>

                <div className="update-modal-header">
                    <div className="update-modal-title">
                        <UserCheck size={20} />
                        <h2>Update User</h2>
                    </div>

                    <button
                        type="button"
                        className="update-modal-close-btn"
                        onClick={handleClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="update-modal-error">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>

                    {/* Name */}
                    <div className="update-modal-form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Enter full name"
                            required
                        />
                    </div>

                    {/* Email */}
                    <div className="update-modal-form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="Enter email address"
                            required
                        />
                    </div>

                    {/* Contact Number */}
                    <div className="update-modal-form-group">
                        <label>Contact Number</label>
                        <input
                            type="text"
                            name="contactNo"
                            value={formData.contactNo}
                            onChange={handleChange}
                            placeholder="Enter contact number"
                        />
                    </div>

                    {/* Role */}
                    <div className="update-modal-form-group">
                        <label>Role</label>
                        <select
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                        >
                            <option value="admin">Admin</option>
                            <option value="staff">Staff</option>
                            <option value="family">Family</option>
                        </select>
                    </div>

                    {/* Status */}
                    <div className="update-modal-form-group">
                        <label>Status</label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>

                    {/* Buttons */}
                    <div className="update-modal-actions">
                        <button
                            type="button"
                            className="update-modal-btn-cancel"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            className="update-modal-btn-submit"
                            disabled={loading}
                        >
                            {loading ? "Updating..." : "Update User"}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

export default UpdateUserModal;