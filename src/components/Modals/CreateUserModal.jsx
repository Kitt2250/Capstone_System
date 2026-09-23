import { useState } from "react";
import { X, UserPlus, AlertCircle } from "lucide-react";
import "./CreateUserModal.css";

function CreateUserModal({ isOpen, onClose, onCreate }) {

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "staff"
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

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
            await onCreate(formData);
            handleClose();
        } catch (err) {
            setError(err.message || "Failed to create user.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFormData({ name: "", email: "", password: "", role: "staff" });
        setError("");
        setLoading(false);
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="create-modal-overlay" onClick={handleClose}>

            <div className="create-modal" onClick={(e) => e.stopPropagation()}>

                <div className="create-modal-header">
                    <div className="create-modal-title">
                        <UserPlus size={20} />
                        <h2>Create User</h2>
                    </div>

                    <button
                        type="button"
                        className="create-modal-close-btn"
                        onClick={handleClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="create-modal-error">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>

                    {/* Name */}
                    <div className="create-modal-form-group">
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
                    <div className="create-modal-form-group">
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

                    {/* Password */}
                    <div className="create-modal-form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Enter password"
                            required
                            minLength={6}
                        />
                    </div>

                    {/* Role */}
                    <div className="create-modal-form-group">
                        <label>Role</label>
                        <select
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                        >
                            <option value="admin">Admin</option>
                            <option value="staff">Staff</option>
                        </select>
                    </div>

                    {/* Buttons */}
                    <div className="create-modal-actions">

                        <button
                            type="button"
                            className="create-modal-btn-cancel"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            className="create-modal-btn-submit"
                            disabled={loading}
                        >
                            {loading ? "Creating..." : "Create User"}
                        </button>

                    </div>

                </form>

            </div>

        </div>
    );
}

export default CreateUserModal;