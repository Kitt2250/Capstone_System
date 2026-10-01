import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSystemDate } from "../../utils/systemDate";
import "./WakeSpaceCalendar.css";

// ── Helper: Map booking to its facility number/name ──
export function getBookingSpaceInfo(b) {
    if (!b) return null;

    let raw = "";
    if (b.wake != null && String(b.wake).trim()) {
        raw = String(b.wake).trim();
    } else if (b.spaceId != null && String(b.spaceId).trim()) {
        raw = String(b.spaceId).trim();
    } else if (b.spaceName != null && String(b.spaceName).trim()) {
        raw = String(b.spaceName).trim();
    } else if (b.details?.wake != null) {
        raw = String(b.details.wake).trim();
    } else if (b.details?.spaceId != null) {
        raw = String(b.details.spaceId).trim();
    }

    const upper = raw.toUpperCase();

    // Facility 1 / A / WAS-001
    if (
        upper === "1" ||
        upper === "A" ||
        upper === "WAS-001" ||
        upper === "WS001" ||
        upper.includes("SPACE 1") ||
        upper.includes("SPACE A") ||
        upper.includes("WAKE 1") ||
        upper.includes("WAKE A")
    ) {
        return { num: 1, letter: "A", name: "Wake Space 1", shortName: "WS 1" };
    }

    // Facility 2 / B / WAS-002
    if (
        upper === "2" ||
        upper === "B" ||
        upper === "WAS-002" ||
        upper === "WS002" ||
        upper.includes("SPACE 2") ||
        upper.includes("SPACE B") ||
        upper.includes("WAKE 2") ||
        upper.includes("WAKE B")
    ) {
        return { num: 2, letter: "B", name: "Wake Space 2", shortName: "WS 2" };
    }

    // Facility 3 / C / WAS-003
    if (
        upper === "3" ||
        upper === "C" ||
        upper === "WAS-003" ||
        upper === "WS003" ||
        upper.includes("SPACE 3") ||
        upper.includes("SPACE C") ||
        upper.includes("WAKE 3") ||
        upper.includes("WAKE C")
    ) {
        return { num: 3, letter: "C", name: "Wake Space 3", shortName: "WS 3" };
    }

    const digitMatch = raw.match(/\d+/);
    if (digitMatch) {
        const num = parseInt(digitMatch[0], 10);
        return { num, letter: String(num), name: `Wake Space ${num}`, shortName: `WS ${num}` };
    }

    return { num: 1, letter: upper || "A", name: b.spaceName || `Wake Space ${upper || "1"}`, shortName: `WS ${upper || "1"}` };
}

// ── Helper: Format occupancy label for a day ──
export function getOccupancyDisplay(spaceNums, totalFacilities = 3) {
    if (!spaceNums || spaceNums.length === 0) return null;

    const count = spaceNums.length;

    // All wake spaces occupied (all facilities)
    if (
        count >= totalFacilities ||
        (spaceNums.includes(1) && spaceNums.includes(2) && spaceNums.includes(3))
    ) {
        return {
            type: "all",
            badgeText: "All Occupied",
            compactText: "All",
            description: "All Wake Spaces (1, 2, and 3) are Occupied",
            spaceNums
        };
    }

    // 2 wake spaces occupied
    if (count === 2) {
        return {
            type: "partial",
            badgeText: `Wake Space ${spaceNums.join(" & ")}`,
            compactText: `WS ${spaceNums.join(" & ")}`,
            description: `Wake Space ${spaceNums.join(" and ")} Occupied`,
            spaceNums
        };
    }

    // 1 wake space occupied
    return {
        type: "single",
        badgeText: `Wake Space ${spaceNums[0]}`,
        compactText: `WS ${spaceNums[0]}`,
        description: `Wake Space ${spaceNums[0]} Occupied`,
        spaceNums
    };
}

/**
 * WakeSpaceCalendar
 *
 * Props:
 *  bookings      – array of booking objects { startDate, endDate } ("YYYY-MM-DD")
 *  wakeSpaces    – optional array of wake space facility objects
 *  selectedDate  – Date or string ("YYYY-MM-DD") for the active start selection
 *  endDate       – Date or string ("YYYY-MM-DD") for the active end selection
 *  onDateSelect  – (date: Date) => void  called when a non-past, current-month cell is clicked
 *  initialDate   – optional Date to start the calendar on (defaults to system date)
 */
function WakeSpaceCalendar({
    bookings = [],
    wakeSpaces = [],
    selectedDate = null,
    endDate = null,
    onDateSelect,
    onOccupiedDateClick = null,
    initialDate
}) {
    const [currentDate, setCurrentDate] = useState(initialDate ?? getSystemDate());

    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December",
    ];
    const dayNames = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

    const firstDayOfMonth  = new Date(year, month, 1).getDay();
    const daysInMonth      = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth  = new Date(year, month, 0).getDate();
    const today            = getSystemDate();

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const handleToday     = () => setCurrentDate(getSystemDate());

    // ── Compute per-date occupancy and space assignment from bookings ──
    const dateOccupancyMap = useMemo(() => {
        const map = new Map();

        bookings.forEach((b) => {
            if (!b.startDate || !b.endDate) return;
            const status = (b.status || "").toLowerCase();
            if (status === "cancelled" || status === "rejected") return;

            const spaceInfo = getBookingSpaceInfo(b);
            if (!spaceInfo) return;

            const sParts = String(b.startDate).split("-").map(Number);
            const eParts = String(b.endDate).split("-").map(Number);
            if (sParts.length < 3 || eParts.length < 3) return;

            const start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
            const end   = new Date(eParts[0], eParts[1] - 1, eParts[2]);

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                if (!map.has(key)) {
                    map.set(key, {
                        spaces: new Set(),
                        bookings: [],
                    });
                }
                const entry = map.get(key);
                entry.spaces.add(spaceInfo.num);
                entry.bookings.push(b);
            }
        });

        return map;
    }, [bookings]);

    const getCellOccupancy = (y, m, d) => {
        const key = `${y}-${m}-${d}`;
        const entry = dateOccupancyMap.get(key);
        if (!entry || entry.spaces.size === 0) return null;

        const sorted = Array.from(entry.spaces).sort((a, b) => a - b);
        const total = wakeSpaces?.length || 3;
        return getOccupancyDisplay(sorted, total);
    };

    // ── Build 6-week grid (42 cells) ─────────────────────────────────────────
    const cells = [];
    for (let i = firstDayOfMonth - 1; i >= 0; i--)
        cells.push({ day: daysInPrevMonth - i, currentMonth: false });
    for (let d = 1; d <= daysInMonth; d++)
        cells.push({ day: d, currentMonth: true });
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++)
        cells.push({ day: d, currentMonth: false });

    const isToday = (cell) =>
        cell.currentMonth &&
        cell.day   === today.getDate()  &&
        month      === today.getMonth() &&
        year       === today.getFullYear();

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const bookingsThisMonth = bookings.filter((b) => {
        if (!b.startDate) return false;
        const s = new Date(b.startDate);
        return s.getMonth() === month && s.getFullYear() === year;
    });

    const isSameDay = (d1, d2) => {
        if (!d1 || !d2) return false;
        const a = new Date(d1);
        const b = new Date(d2);
        return (
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate()
        );
    };

    const isInRange = (d, start, end) => {
        if (!d || !start || !end) return false;
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const sDate = new Date(start);
        const eDate = new Date(end);
        const s = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate()).getTime();
        const e = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate()).getTime();
        return target >= s && target <= e;
    };

    // ── Cell click ────────────────────────────────────────────────────────────
    const handleCellClick = (cell) => {
        if (!cell.currentMonth) return;
        const cellDate = new Date(year, month, cell.day);
        const isPast   = cellDate < todayStart;
        if (isPast) return;

        // Block occupied dates from being selected
        const occInfo = getCellOccupancy(year, month, cell.day);
        if (occInfo) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
            const conf = bookings.find((b) => {
                if (b.status === "cancelled" || b.status === "rejected") return false;
                return b.startDate <= dateStr && b.endDate >= dateStr;
            });
            onOccupiedDateClick?.(cellDate, conf, occInfo);
            return;
        }

        onDateSelect?.(cellDate);
    };

    return (
        <div className="ws-calendar-wrapper">
            {/* Nav bar */}
            <div className="ws-calendar-nav">
                <div className="ws-calendar-month-title">
                    <span className="ws-calendar-month-icon">📅</span>
                    <span className="ws-calendar-month-text">{monthNames[month]} {year}</span>
                    <span className="ws-booking-badge">
                        {bookingsThisMonth.length} {bookingsThisMonth.length === 1 ? "Booking" : "Bookings"} this month
                    </span>
                </div>
                <div className="ws-calendar-controls">
                    <button className="ws-nav-btn" onClick={handlePrevMonth}>
                        <ChevronLeft size={16} />
                    </button>
                    <button className="ws-today-btn" onClick={handleToday}>Today</button>
                    <button className="ws-nav-btn" onClick={handleNextMonth}>
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Scrollable calendar container with bottom scroller */}
            <div className="ws-calendar-scroll-body">
                <div className="ws-calendar-scroll-content">
                    {/* Day labels */}
                    <div className="ws-calendar-grid ws-day-labels">
                        {dayNames.map((d) => (
                            <div key={d} className="ws-day-label">{d}</div>
                        ))}
                    </div>

                    {/* Cells */}
                    <div className="ws-calendar-grid ws-cells-grid">
                        {cells.map((cell, idx) => {
                            const cellDate        = new Date(year, month, cell.day);
                            const isPast          = cell.currentMonth && cellDate < todayStart;
                            const occInfo         = cell.currentMonth && !isPast ? getCellOccupancy(year, month, cell.day) : null;
                            const occupied        = Boolean(occInfo);
                            const available       = cell.currentMonth && !isPast && !occupied;
                            const todayCell       = isToday(cell);
                            const isSelectedStart = cell.currentMonth && isSameDay(cellDate, selectedDate);
                            const isSelectedEnd   = cell.currentMonth && isSameDay(cellDate, endDate);
                            const isSelectedRange = cell.currentMonth && isInRange(cellDate, selectedDate, endDate);

                            const cellClassList = [
                                "ws-cell",
                                !cell.currentMonth ? "ws-cell-out" : "",
                                isPast ? "ws-cell-past" : "",
                                todayCell ? "ws-cell-today" : "",
                                occupied ? "ws-cell-occupied" : "",
                                occupied && occInfo?.type === "all" ? "ws-cell-occupied-all" : "",
                                occupied && occInfo?.type === "partial" ? "ws-cell-occupied-partial" : "",
                                occupied && occInfo?.type === "single" ? "ws-cell-occupied-single" : "",
                                available ? "ws-cell-available" : "",
                                isSelectedStart ? "ws-cell-selected ws-cell-range-start" : "",
                                isSelectedEnd ? "ws-cell-range-end" : "",
                                isSelectedRange ? "ws-cell-in-range" : "",
                            ].filter(Boolean).join(" ");

                            return (
                                <div
                                    key={idx}
                                    className={cellClassList}
                                    onClick={() => handleCellClick(cell)}
                                    title={
                                        !cell.currentMonth ? "" :
                                        isPast ? "Past date" :
                                        occupied ? occInfo?.description || "Occupied" :
                                        isSelectedStart ? "Selected check-in date" :
                                        "Click to book"
                                    }
                                >
                                    <div className="ws-cell-header">
                                        <span className="ws-cell-day">{cell.day}</span>
                                        {todayCell && <span className="ws-today-pill">Today</span>}
                                    </div>

                                    {cell.currentMonth && !isPast && (
                                        <div className="ws-cell-body">
                                            {occupied ? (
                                                <div className={`ws-occ-badge ws-occ-${occInfo.type}`}>
                                                    <span className="ws-occ-dot">●</span>
                                                    <span className="ws-occ-text">{occInfo.badgeText}</span>
                                                </div>
                                            ) : (
                                                <div className="ws-avail-badge">
                                                    <span className="ws-avail-dot">●</span>
                                                    <span className="ws-avail-text">Available</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="ws-calendar-legend">
                        <span className="ws-legend-item ws-legend-occupied-all">● All Occupied</span>
                        <span className="ws-legend-item ws-legend-occupied-partial">● Wake Space 1 & 2 (Partial)</span>
                        <span className="ws-legend-item ws-legend-occupied-single">● Wake Space 1 (Single)</span>
                        <span className="ws-legend-item ws-legend-available">● Available</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default WakeSpaceCalendar;
