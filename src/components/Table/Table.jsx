import { ChevronsUpDown } from "lucide-react";
import "./Table.css";

function Table({ data, columns }) {

    return (
        <div className="table-wrapper">
            <table>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.key}
                                className={`th-${column.key} ${column.onSort ? "th-sortable" : ""}`}
                                onClick={column.onSort}
                            >
                                <div className="th-content">
                                    <span>{column.label || ""}</span>
                                    {Boolean(column.label) && column.key === "joined" && (
                                        <ChevronsUpDown size={14} className="sort-icon" />
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {data.map((row) => (
                        <tr key={row.id}>
                            {columns.map((column) => (
                                <td key={column.key} className={`td-${column.key}`}>
                                    {column.render
                                        ? column.render(row)
                                        : (row[column.key] ?? "—")
                                    }
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default Table;