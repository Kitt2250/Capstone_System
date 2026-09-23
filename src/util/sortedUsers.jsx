export function getTimestamp(val) {
    if (!val) return 0;
    if (val?.toDate) return val.toDate().getTime();
    if (val?.seconds) return val.seconds * 1000;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function sortUsersByJoined(users, sortOrder) {
    if (!sortOrder || !Array.isArray(users)) return users;

    return [...users].sort((a, b) => {
        const timeA = getTimestamp(a.createdAt);
        const timeB = getTimestamp(b.createdAt);
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
    });
}

export default sortUsersByJoined;
