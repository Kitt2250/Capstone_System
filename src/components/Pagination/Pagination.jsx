import "./Pagination.css";

function Pagination({ currentPage, totalPages, onPageChange }) {

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

    return (
        <div className="pagination">

            <button
                onClick={handlePrevious}
                disabled={currentPage === 1}
            >
                ‹
            </button>

            {Array.from({ length: totalPages }, (_, index) => {
                const page = index + 1;

                return (
                    <button
                        key={page}
                        onClick={() => onPageChange(page)}
                        className={currentPage === page ? "active" : ""}
                    >
                        {page}
                    </button>
                );
            })}

            <button
                onClick={handleNext}
                disabled={currentPage === totalPages}
            >
                ›
            </button>

        </div>
    );
}

export default Pagination;