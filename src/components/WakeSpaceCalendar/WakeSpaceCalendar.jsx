import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./WakeSpaceCalendar.css";

/**
 * WakeSpaceCalendar
 *
 * Props:
 *  bookings      – array of booking objects { startDate, endDate } ("YYYY-MM-DD")
 *  onDateSelect  – (date: Date) => void  called when a non-past, current-month cell is clicked
 *  initialDate   – optional Date to start the calendar on (defaults to today)
 */
function WakeSpaceCalendar({ bookings = [], onDateSelect, initialDate }) {
    const [currentDate, setCurrentDate] = useState(initialDate ?? new Date());

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
    const today            = new Date();

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const handleToday     = () => setCurrentDate(new Date());

    // ── Compute occupied dates from bookings ──────────────────────────────────
    const occupiedDates = new Set();
    bookings.forEach((b) => {
        if (b.startDate && b.endDate) {
            const start = new Date(b.startDate);
            const end   = new Date(b.endDate);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                occupiedDates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
            }
        }
    });

    const isOccupied = (y, m, d) => occupiedDates.has(`${y}-${m}-${d}`);

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

    // ── Cell click ────────────────────────────────────────────────────────────
    const handleCellClick = (cell) => {
        if (!cell.currentMonth) return;
        const date     = new Date(year, month, cell.day);
        const isPast   = date < todayStart;
        if (isPast) return;
        onDateSelect?.(date);
    };

    return (
        <div className="ws-calendar-wrapper">
            {/* Nav bar */}
            <div className="ws-calendar-nav">
                <div className="ws-calendar-month-title">
                    <span className="ws-calendar-month-icon">📅</span>
                    <span className="ws-calendar-month-text">{monthNames[month]} {year}</span>
                    <span className="ws-booking-badge">
                        {bookingsThisMonth.length} Booking this month
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

            {/* Day labels */}
            <div className="ws-calendar-grid ws-day-labels">
                {dayNames.map((d) => (
                    <div key={d} className="ws-day-label">{d}</div>
                ))}
            </div>

            {/* Cells */}
            <div className="ws-calendar-grid ws-cells-grid">
                {cells.map((cell, idx) => {
                    const cellDate  = new Date(year, month, cell.day);
                    const isPast    = cell.currentMonth && cellDate < todayStart;
                    const occupied  = cell.currentMonth && !isPast && isOccupied(year, month, cell.day);
                    const available = cell.currentMonth && !isPast && !occupied;
                    const todayCell = isToday(cell);

                    return (
                        <div
                            key={idx}
                            className={[
                                "ws-cell",
                                !cell.currentMonth ? "ws-cell-out"       : "",
                                isPast            ? "ws-cell-past"       : "",
                                todayCell         ? "ws-cell-today"      : "",
                                occupied          ? "ws-cell-occupied"   : "",
                                available         ? "ws-cell-available"  : "",
                            ].join(" ")}
                            onClick={() => handleCellClick(cell)}
                            title={
                                !cell.currentMonth ? "" :
                                isPast             ? "Past date" :
                                occupied           ? "Occupied" :
                                "Click to book"
                            }
                        >
                            <span className="ws-cell-day">{cell.day}</span>
                            {cell.currentMonth && !isPast && (
                                <span className="ws-cell-status-dot">
                                    {occupied ? "●" : ""}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="ws-calendar-legend">
                <span className="ws-legend-item ws-legend-occupied">● Occupied</span>
                <span className="ws-legend-item ws-legend-available">● Available</span>
            </div>
        </div>
    );
}

export default WakeSpaceCalendar;
