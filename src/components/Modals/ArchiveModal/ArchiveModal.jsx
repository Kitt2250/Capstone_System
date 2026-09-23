import { useState } from "react";
import "./ArchiveModal.css";

const ArchiveModal = ({ isOpen, user, onClose, onConfirm }) => {
    const [loading, setLoading] = useState(false);

    if (!isOpen || !user) {
        return null;
    }

    const handleConfirm = async () => {
        try {
            setLoading(true);

            await onConfirm(user);

        } catch (error) {
            console.error("Archive failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="archive-modal" onClick={(e) => e.stopPropagation()}>

                <div className="archive-modal-icon">
                    🗄️
                </div>

                <div className="archive-modal-content">
                    <h2>Archive User?</h2>

                    <p>
                        Are you sure you want to archive{" "}
                        <strong>{user.name}</strong>?
                    </p>

                    <p className="archive-warning">
                        This user will no longer appear in the active user
                        list. You can restore them later if needed.
                    </p>
                </div>

                <div className="archive-modal-actions">

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="cancel-button"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={loading}
                        className="archive-button"
                    >
                        {loading ? "Archiving..." : "Archive User"}
                    </button>

                </div>

            </div>
        </div>
    );
};

export default ArchiveModal;