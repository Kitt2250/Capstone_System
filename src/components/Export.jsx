import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


export const exportToCSV = (data, fileName = "export") => {
    if (!data || data.length === 0) {
        console.log("No data to export.");
        return;
    }

    const headers = Object.keys(data[0]);

    const rows = data.map((item) =>
        headers.map((header) => {
            let value = item[header];

            // Handle Firebase Timestamp
            if (value?.toDate) {
                value = value.toDate().toLocaleString();
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

    const jsonContent = JSON.stringify(data, null, 4);

    const blob = new Blob([jsonContent], {
        type: "application/json"
    });

    downloadFile(blob, `${fileName}.json`);
};


export const exportToPDF = (data, fileName = "export") => {
    if (!data || data.length === 0) {
        console.log("No data to export.");
        return;
    }

    console.log("PDF export:", data);
    console.log("File name:", fileName);

    const doc = new jsPDF();

    doc.autoTable({
        startY: 15,
        head: [headers],
        body: rows,
        theme: "striped",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [22, 163, 74] },
        didDrawPage: function (data) {
            doc.text("User   Data", 14, 10);
        }
    });

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