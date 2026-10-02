import jsPDF from "jspdf";

/**
 * Generates and downloads the Official Certificate of Burial & Interment PDF.
 * @param {Object} record - The formatted burial record object.
 */
export const downloadCertificate = (record) => {
  const docPdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Outer border - Gold
  docPdf.setDrawColor(212, 175, 55);
  docPdf.setLineWidth(1.5);
  docPdf.rect(10, 10, 190, 277);

  // Inner border - Deep Blue
  docPdf.setDrawColor(0, 77, 140);
  docPdf.setLineWidth(0.5);
  docPdf.rect(13, 13, 184, 271);

  // Header
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(20);
  docPdf.setTextColor(0, 77, 140);
  docPdf.text("CHERUBIM OF HEAVEN", 105, 32, { align: "center" });

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(11);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text("MEMORIAL PARK & SERVICES", 105, 39, { align: "center" });

  // Gold divider
  docPdf.setDrawColor(212, 175, 55);
  docPdf.setLineWidth(0.8);
  docPdf.line(40, 44, 170, 44);

  // Title
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(16);
  docPdf.setTextColor(15, 23, 42);
  docPdf.text("CERTIFICATE OF BURIAL & INTERMENT", 105, 58, { align: "center" });

  docPdf.setFont("helvetica", "italic");
  docPdf.setFontSize(10);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text(
    "This certifies that the official records of Cherubim of Heaven Memorial Park attest to the following interment details:",
    105,
    66,
    { align: "center", maxWidth: 160 }
  );

  // Details box
  docPdf.setFillColor(248, 250, 252);
  docPdf.roundedRect(25, 78, 160, 120, 3, 3, "F");
  docPdf.setDrawColor(226, 232, 240);
  docPdf.roundedRect(25, 78, 160, 120, 3, 3, "D");

  let y = 92;
  const addRow = (label, value) => {
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(10);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text(label, 32, y);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(10);
    docPdf.setTextColor(15, 23, 42);
    docPdf.text(String(value || "—"), 85, y);

    y += 11;
  };

  addRow("Name of Deceased:", record.name);
  addRow("Record / Plot Code:", record.recordId);
  addRow("Interment Type:", record.burial?.type || "Standard Burial");
  addRow("Date Buried / Interred:", record.burial?.dateBuried || "—");
  addRow("Dates of Life:", record.personal?.dates || "—");
  addRow("Grave Location:", record.location?.grave || "—");
  addRow("Section / Block:", `${record.location?.section || "—"} / ${record.location?.block || "—"}`);
  addRow("Record Status:", record.status || "Active");
  if (record.contract?.isPerpetual || record.lease?.isPerpetual) {
    addRow("Contract Type:", "Perpetual Ownership");
  } else {
    addRow("Contract / Lease Term:", record.contract?.type || record.lease?.contractType || "Renewable Lease");
    addRow("Lease Expiry:", record.contract?.leaseExpiry || record.lease?.expiry || "—");
  }
  const paymentStatus = record.contract?.paymentStatus || record.lease?.payment;
  if (paymentStatus) {
    addRow("Payment Status:", paymentStatus);
  }
  const nextDue = record.contract?.nextDue || record.lease?.nextDue;
  const isPaid = record.contract ? record.contract.isPaid : record.lease?.isPaid;
  if (nextDue && !isPaid) {
    addRow("Next Due Date:", nextDue);
  }

  // Official Signature section
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text(
    `Issued on: ${new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`,
    32,
    220
  );
  docPdf.text("Cherubim Memorial Administration Office", 32, 226);

  docPdf.line(130, 235, 175, 235);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9);
  docPdf.setTextColor(30, 41, 59);
  docPdf.text("Authorized Registrar", 152.5, 241, { align: "center" });

  const safeName = (record.name || "Burial").replace(/[^a-zA-Z0-9]/g, "_");
  docPdf.save(`Burial_Certificate_${safeName}.pdf`);
};

export const downloadBurialCertificate = downloadCertificate;

/**
 * Generates and downloads the Official Real Contract / Deed Agreement PDF.
 * @param {Object} record - The formatted burial record object with contract details.
 */
export const downloadContractPDF = (record) => {
  const docPdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const isPerpetual = Boolean(record.contract?.isPerpetual);

  // Outer border - Gold
  docPdf.setDrawColor(212, 175, 55);
  docPdf.setLineWidth(1.5);
  docPdf.rect(10, 10, 190, 277);

  // Inner border - Deep Navy
  docPdf.setDrawColor(0, 77, 140);
  docPdf.setLineWidth(0.5);
  docPdf.rect(13, 13, 184, 271);

  // Header
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(18);
  docPdf.setTextColor(0, 77, 140);
  docPdf.text("CHERUBIM OF HEAVEN MEMORIAL PARK", 105, 28, { align: "center" });

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9.5);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text("OFFICE OF CEMETERY RECORDS & CONTRACT ADMINISTRATION", 105, 34, { align: "center" });

  // Gold divider
  docPdf.setDrawColor(212, 175, 55);
  docPdf.setLineWidth(0.8);
  docPdf.line(35, 38, 175, 38);

  // Title
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(13);
  docPdf.setTextColor(15, 23, 42);
  const docTitle = isPerpetual
    ? "DEED OF PERPETUAL OWNERSHIP & EXCLUSIVE BURIAL GRANT"
    : "GRAVE LOT LEASE & INTERMENT AGREEMENT";
  docPdf.text(docTitle, 105, 47, { align: "center" });

  docPdf.setFont("helvetica", "italic");
  docPdf.setFontSize(9);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text(
    `Contract Reference No: ${record.contract?.contractNo || record.recordId}  |  Official Registry File`,
    105,
    53,
    { align: "center" }
  );

  // Details box
  docPdf.setFillColor(248, 250, 252);
  docPdf.roundedRect(20, 58, 170, 70, 3, 3, "F");
  docPdf.setDrawColor(226, 232, 240);
  docPdf.roundedRect(20, 58, 170, 70, 3, 3, "D");

  let y = 67;
  const addRow = (label, value) => {
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text(label, 26, y);

    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(9);
    docPdf.setTextColor(15, 23, 42);
    docPdf.text(String(value || "—"), 80, y);

    y += 8;
  };

  addRow("Contract / Document No:", record.contract?.contractNo || record.recordId);
  addRow("Grantee / Family Representative:", record.contract?.grantee || record.name);
  addRow("Registered Deceased:", record.name);
  addRow("Assigned Grave Lot:", `${record.location?.grave} (${record.contract?.graveTypeName || "Standard Grave"})`);
  addRow("Cemetery Section & Block:", `${record.location?.section} / ${record.location?.block}`);
  addRow("Contract Agreement Type:", record.contract?.type || "Standard Grant");
  if (!isPerpetual) {
    addRow("Tenure & Validity:", record.contract?.tenure || "Renewable");
  }
  if (isPerpetual) {
    addRow("Grant Date / Acquired:", record.contract?.acquiredDate || "—");
  } else {
    addRow("Lease Term Period:", `${record.contract?.leaseStart || "—"} to ${record.contract?.leaseExpiry || "—"}`);
  }

  // Legal Clauses Box
  let clauseY = 138;
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  docPdf.setTextColor(0, 77, 140);
  docPdf.text("TERMS, COVENANTS, AND REGULATIONS", 20, clauseY);
  clauseY += 6;

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(51, 65, 85);

  const clause1 = isPerpetual
    ? "1. PERPETUAL GRANT: Cherubim of Heaven Memorial Park hereby grants unto the Grantee perpetual, permanent, and exclusive rights of sepulture in the specified grave lot. Said rights are permanent and held in perpetuity by the Grantee and heirs, without periodic expiration or renewable lease obligations."
    : `1. LEASE TERM & RENEWAL: The Grantee is granted exclusive interment rights for an initial term of ${record.contract?.tenure}. Upon expiration, rights may be renewed pursuant to cemetery policies at the established annual rate (₱3,500/year).`;

  const clause2 =
    "2. PERPETUAL CARE & MAINTENANCE: The Memorial Park guarantees regular ground upkeep, grass cutting, landscaping, and perimeter security as part of the memorial park's endowment and perpetual maintenance trust fund.";

  const clause3 =
    "3. MEMORIAL MONUMENTS & IMPROVEMENTS: All markers, headstones, and interments must comply with the approved architectural standards and cemetery guidelines of Cherubim of Heaven Memorial Park.";

  const clause4 =
    "4. GOVERNING LAW & RECORD OF TITLE: This instrument is duly registered in the official cemetery archives and certifies binding ownership rights under the civil code and memorial park regulations of the Republic of the Philippines.";

  const split1 = docPdf.splitTextToSize(clause1, 170);
  docPdf.text(split1, 20, clauseY);
  clauseY += split1.length * 4.2 + 3;

  const split2 = docPdf.splitTextToSize(clause2, 170);
  docPdf.text(split2, 20, clauseY);
  clauseY += split2.length * 4.2 + 3;

  const split3 = docPdf.splitTextToSize(clause3, 170);
  docPdf.text(split3, 20, clauseY);
  clauseY += split3.length * 4.2 + 3;

  const split4 = docPdf.splitTextToSize(clause4, 170);
  docPdf.text(split4, 20, clauseY);
  clauseY += split4.length * 4.2 + 6;

  // Account / Financial Note
  if (record.contract?.hasPayment) {
    docPdf.setFillColor(241, 245, 249);
    docPdf.roundedRect(20, clauseY, 170, 16, 2, 2, "F");
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(30, 41, 59);
    docPdf.text("FINANCIAL SETTLEMENT STANDING:", 25, clauseY + 6);
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(71, 85, 105);
    const pmtNote = record.contract?.isPaid
      ? "Account is fully settled. Perpetual ownership deed is unencumbered and active."
      : `Account is active on installment schedule (${record.contract?.paymentStatus}). Next payment due: ${record.contract?.nextDue || "On schedule"}.`;
    docPdf.text(pmtNote, 25, clauseY + 11);
  }

  // Official Seal & Signatures
  const sigY = 246;
  docPdf.setDrawColor(203, 213, 225);
  docPdf.line(25, sigY, 80, sigY);
  docPdf.line(130, sigY, 185, sigY);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(8.5);
  docPdf.setTextColor(30, 41, 59);
  docPdf.text("Authorized Park Administrator", 52.5, sigY + 5, { align: "center" });
  docPdf.text("Grantee / Family Representative", 157.5, sigY + 5, { align: "center" });

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(7.5);
  docPdf.setTextColor(148, 163, 184);
  docPdf.text("Cherubim of Heaven Memorial Park", 52.5, sigY + 9, { align: "center" });
  docPdf.text("Signature over Printed Name", 157.5, sigY + 9, { align: "center" });

  const safeName = (record.contract?.contractNo || record.name || "Contract").replace(/[^a-zA-Z0-9]/g, "_");
  docPdf.save(`Official_Contract_${safeName}.pdf`);
};

export const downloadBurialContract = downloadContractPDF;
