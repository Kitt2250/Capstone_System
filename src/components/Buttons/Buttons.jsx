import "./Buttons.css";
import { Eye, Pencil, Ban, MapPin, UserPlus, Trash2, Download, RotateCcw } from "lucide-react";

const variantIcons = {
    view: Eye,
    edit: Pencil,
    delete: Trash2,
    deactivate: Ban,
    viewmap: MapPin,
    create: UserPlus,
    export: Download,
    reset: RotateCcw,
};

function Button({ variant = "default", onClick, title, children }) {
    const Icon = variantIcons[variant];
    const hasLabel = !!children;

    return (
        <button
            type="button"
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