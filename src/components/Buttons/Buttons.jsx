import "./Buttons.css";
import { Eye, Pencil, Ban, MapPin, Plus, Trash2 } from "lucide-react";

const variantIcons = { view: Eye, edit: Pencil, delete: Trash2, deactivate: Ban, viewmap: MapPin, create: Plus, };

function Button({ variant = "default", onClick, title, children }) {
    const Icon = variantIcons[variant];
    const hasLabel = !!children;

    return (
        <button
            className={`btn btn-${variant}${hasLabel ? " btn-with-label" : ""}`}
            onClick={onClick}
            title={title || variant}
        >
            {Icon && <Icon size={16} />}
            {children}
        </button>
    );
}

export default Button;