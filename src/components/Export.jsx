import jsPDF from "jspdf";
import autoTable, { applyPlugin } from "jspdf-autotable";

// Ensure autoTable plugin is registered on jsPDF constructor
try {
    applyPlugin(jsPDF);
} catch (e) {
    // Already registered or in bundle environment
}

const formatDateValue = (date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
};

const formatCellValue = (value, key = "") => {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    // Firestore Timestamp with .toDate() method
    if (value?.toDate && typeof value.toDate === "function") {
        return formatDateValue(value.toDate());
    }

    // Firestore Timestamp representation with seconds
    if (typeof value === "object" && typeof value.seconds === "number") {
        return formatDateValue(new Date(value.seconds * 1000));
    }

    // Native Date instance
    if (value instanceof Date) {
        return formatDateValue(value);
    }

    // String date detection for date-like keys
    if (
        (key.toLowerCase().includes("date") || key.toLowerCase().includes("at")) &&
        typeof value === "string"
    ) {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime()) && value.length > 5 && !/^\d+$/.test(value)) {
            return formatDateValue(parsed);
        }
    }

    // Format role / status values to Title Case
    if (key.toLowerCase() === "role" || key.toLowerCase() === "status") {
        const str = String(value);
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    // Format arrays or nested objects
    if (Array.isArray(value)) {
        return value.join(", ");
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
};

export const exportToCSV = (data, fileName = "export") => {
    if (!data || data.length === 0) {
        console.log("No data to export.");
        return;
    }

    const sensitiveKeys = new Set(["password", "confirmpassword", "token", "secret", "hash", "salt", "__v"]);
    const headers = Object.keys(data[0]).filter((k) => !sensitiveKeys.has(k.toLowerCase()));

    const rows = data.map((item) =>
        headers.map((header) => {
            let value = item[header];

            // Handle Firebase Timestamp
            if (value?.toDate && typeof value.toDate === "function") {
                value = value.toDate().toLocaleString();
            } else if (typeof value === "object" && typeof value?.seconds === "number") {
                value = new Date(value.seconds * 1000).toLocaleString();
            }

            // Handle arrays/objects
            if (typeof value === "object" && value !== null) {
                value = JSON.stringify(value);
            }

            // Escape quotes
            value = String(value ?? "").replace(/"/g, '""');

            return `"${value}"`;
        }).join(",")
    );

    const csvContent = [
        headers.join(","),
        ...rows
    ].join("\n");

    const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;"
    });

    downloadFile(blob, `${fileName}.csv`);
};


export const exportToJSON = (data, fileName = "export") => {
    if (!data || data.length === 0) {
        console.log("No data to export.");
        return;
    }

    const sensitiveKeys = new Set(["password", "confirmpassword", "token", "secret", "hash", "salt", "__v"]);
    const sanitizedData = data.map((item) => {
        if (!item || typeof item !== "object") return item;
        const copy = {};
        for (const [key, val] of Object.entries(item)) {
            if (!sensitiveKeys.has(key.toLowerCase())) {
                copy[key] = val;
            }
        }
        return copy;
    });

    const jsonContent = JSON.stringify(sanitizedData, null, 4);

    const blob = new Blob([jsonContent], {
        type: "application/json"
    });

    downloadFile(blob, `${fileName}.json`);
};


export const exportToPDF = (data, fileName = "export", options = {}) => {
    if (!data || data.length === 0) {
        console.log("No data to export.");
        return;
    }

    console.log("PDF export:", data);
    console.log("File name:", fileName);

    // Collect all unique keys from dataset
    const allKeys = Array.from(
        new Set(data.flatMap((item) => (item && typeof item === "object" ? Object.keys(item) : [])))
    );

    const sensitiveKeys = new Set(["password", "confirmpassword", "token", "secret", "hash", "salt", "__v"]);

    // If we have readable fields (e.g. name/email) and id is a long Firestore auto-generated UID, omit id from printable report
    const hasDescriptiveField = allKeys.some((k) =>
        ["name", "email", "title", "username"].includes(k.toLowerCase())
    );
    const hasLongFirestoreId = data.some(
        (item) => typeof item?.id === "string" && item.id.length >= 18
    );

    let keys = options?.columns;
    if (!keys) {
        keys = allKeys.filter((k) => {
            const lower = k.toLowerCase();
            if (sensitiveKeys.has(lower)) return false;
            if (lower === "id" && hasDescriptiveField && hasLongFirestoreId) return false;
            return true;
        });

        // Preferred order for user / general record display
        const preferredOrder = [
            "name",
            "email",
            "contactno",
            "role",
            "status",
            "createdat",
            "updatedat"
        ];

        keys.sort((a, b) => {
            const idxA = preferredOrder.indexOf(a.toLowerCase());
            const idxB = preferredOrder.indexOf(b.toLowerCase());
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });
    }

    // Friendly column labels
    const labelMap = {
        name: "Name",
        email: "Email",
        contactNo: "Contact No",
        contactno: "Contact No",
        role: "Role",
        status: "Status",
        createdAt: "Joined Date",
        createdat: "Joined Date",
        updatedAt: "Updated Date",
        updatedat: "Updated Date",
        date: "Date"
    };

    const headerLabels = keys.map((key) => {
        if (typeof key === "object" && key?.label) return key.label;
        const keyStr = typeof key === "object" ? key.key : key;
        if (labelMap[keyStr]) return labelMap[keyStr];
        const lower = keyStr.toLowerCase();
        if (labelMap[lower]) return labelMap[lower];
        return keyStr
            .replace(/_/g, " ")
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s) => s.toUpperCase())
            .trim();
    });

    const keyStrings = keys.map((k) => (typeof k === "object" ? k.key : k));

    const rows = data.map((item) =>
        keyStrings.map((key) => formatCellValue(item?.[key], key))
    );

    const isLandscape = keys.length > 5;
    const doc = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "mm",
        format: "a4"
    });

    const reportTitle =
        options?.title ||
        (fileName.toLowerCase().includes("user")
            ? "User Management Report"
            : `${fileName.charAt(0).toUpperCase() + fileName.slice(1)} Report`);

    const tableOptions = {
        startY: 32,
        head: [headerLabels],
        body: rows,
        theme: "striped",
        styles: {
            font: "helvetica",
            fontSize: 9,
            cellPadding: 3.5,
            textColor: [30, 41, 59],
            overflow: "linebreak",
            valign: "middle"
        },
        headStyles: {
            fillColor: [0, 77, 140], // App primary Navy color
            textColor: [255, 255, 255],
            fontStyle: "bold",
            halign: "left"
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252] // Slate 50
        },
        margin: { top: 20, right: 14, bottom: 20, left: 14 },
        didDrawPage: (hookData) => {
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // Header only on first page
            if (hookData.pageNumber === 1) {
                doc.setFontSize(16);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(15, 23, 42); // #0f172a
                doc.text(reportTitle, 14, 16);

                doc.setFontSize(8.5);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(100, 116, 139); // #64748b
                const now = new Date();
                const dateStr = now.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });
                doc.text(`Generated on: ${dateStr}   |   Total Records: ${data.length}`, 14, 23);

                doc.setDrawColor(226, 232, 240); // #e2e8f0
                doc.setLineWidth(0.5);
                doc.line(14, 27, pageWidth - 14, 27);
            }

            // Page number in footer on all pages
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184); // #94a3b8
            doc.text(
                `Page ${hookData.pageNumber}`,
                pageWidth - 14,
                pageHeight - 10,
                { align: "right" }
            );
        }
    };

    if (typeof doc.autoTable === "function") {
        doc.autoTable(tableOptions);
    } else {
        autoTable(doc, tableOptions);
    }

    doc.save(`${fileName}.pdf`);
};



const downloadFile = (blob, fileName) => {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
};