export function formatDate(val, format = "date") {
    if (!val) return "—";

    let date = val;

    if (val?.toDate) {
        date = val.toDate();
    } else if (val?.seconds) {
        date = new Date(val.seconds * 1000);
    } else if (!(val instanceof Date)) {
        date = new Date(val);
    }

    if (isNaN(date.getTime())) return "—";

    if (format === "full") {
        return date.toLocaleString();
    }

    const day = String(date.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
}

function DateFormatter({ value, format = "date" }) {
    return formatDate(value, format);
}

export default DateFormatter;