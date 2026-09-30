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

function Button({
    variant = "default",
    onClick,
    title,
    disabled = false,
    className = "",
    children,
    ...props
}) {
    const Icon = variantIcons[variant];
    const hasLabel = !!children;

    return (
        <button
            type="button"
            className={`btn btn-${variant}${hasLabel ? " btn-with-label" : ""}${disabled ? " btn-disabled" : ""}${className ? ` ${className}` : ""}`}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            aria-disabled={disabled}
            title={title || variant}
            {...props}
        >
            {Icon && <Icon size={16} />}
            {children}
        </button>
    );
}

export default Button;