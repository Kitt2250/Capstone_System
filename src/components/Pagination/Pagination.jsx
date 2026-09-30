import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./Pagination.css";

function Pagination({ currentPage, totalPages, onPageChange, maxVisible = 5 }) {
    if (!totalPages || totalPages <= 1) return null;

    const handlePrevious = () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    };

    // Group into 1-5, 6-10, 11-15, etc.
    const currentChunk = Math.floor((currentPage - 1) / maxVisible);
    const startPage = currentChunk * maxVisible + 1;
    const endPage = Math.min(startPage + maxVisible - 1, totalPages);

    const pages = [];
    for (let p = startPage; p <= endPage; p++) {
        pages.push(p);
    }

    const hasPrevChunk = startPage > 1;
    const hasNextChunk = endPage < totalPages;

    const handlePrevChunk = () => {
        const target = Math.max(1, startPage - 1);
        onPageChange(target);
    };

    const handleNextChunk = () => {
        const target = Math.min(totalPages, endPage + 1);
        onPageChange(target);
    };

    return (
        <div className="pagination">
            <button
                type="button"
                className="pagination-btn pagination-nav-btn"
                onClick={handlePrevious}
                disabled={currentPage === 1}
                aria-label="Previous Page"
                title="Previous Page"
            >
                <ChevronLeft size={16} />
            </button>

            {hasPrevChunk && (
                <button
                    type="button"
                    className="pagination-btn pagination-ellipsis-btn"
                    onClick={handlePrevChunk}
                    title={`Previous ${maxVisible} pages (${Math.max(1, startPage - maxVisible)} - ${startPage - 1})`}
                >
                    &hellip;
                </button>
            )}

            {pages.map((page) => (
                <button
                    type="button"
                    key={page}
                    onClick={() => onPageChange(page)}
                    className={`pagination-btn pagination-num-btn ${currentPage === page ? "active" : ""}`}
                >
                    {page}
                </button>
            ))}

            {hasNextChunk && (
                <button
                    type="button"
                    className="pagination-btn pagination-ellipsis-btn"
                    onClick={handleNextChunk}
                    title={`Next ${maxVisible} pages (${endPage + 1} - ${Math.min(totalPages, endPage + maxVisible)})`}
                >
                    &hellip;
                </button>
            )}

            <button
                type="button"
                className="pagination-btn pagination-nav-btn"
                onClick={handleNext}
                disabled={currentPage === totalPages}
                aria-label="Next Page"
                title="Next Page"
            >
                <ChevronRight size={16} />
            </button>
        </div>
    );
}

export default Pagination;