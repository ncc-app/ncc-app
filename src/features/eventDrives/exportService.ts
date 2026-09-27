import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import type { CadetWithResponse } from "./responseService";
import type { EventDrive } from "@/shared/types";
import { DRIVE_TYPE_LABELS, DRIVE_RESPONSE_LABELS } from "@/shared/config/constants";
import type { DriveType, DriveResponseType } from "@/shared/config/constants";

// ============ HELPERS ============

function getDriveTypeLabel(drive: EventDrive): string {
  if (drive.driveType === "other" && drive.customDriveType) {
    return drive.customDriveType;
  }
  return DRIVE_TYPE_LABELS[drive.driveType as DriveType] || drive.driveType;
}

function getResponseLabel(response: DriveResponseType | "no_response"): string {
  return DRIVE_RESPONSE_LABELS[response] || response;
}

// ============ EXCEL EXPORT ============

export async function exportResponsesAsExcel(
  drive: EventDrive & { id: string },
  cadets: CadetWithResponse[],
  filterLabel?: string,
): Promise<void> {
  const headers = [
    "S.No",
    "Name",
    "Register Number",
    "Division",
    "NCC Year",
    "Department",
    "Rank",
    "Phone",
    "Response",
    "Reason",
    "Responded At",
  ];

  const rows = cadets.map((c, idx) => [
    idx + 1,
    c.name,
    c.registerNumber || "",
    c.division,
    c.nccYear,
    c.department || "",
    c.rank || "CDT",
    c.phone || "",
    getResponseLabel(c.response),
    c.reason || "",
    c.respondedAt
      ? new Date(c.respondedAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        })
      : "",
  ]);

  const wsData: (string | number)[][] = [];

  // Title rows
  wsData.push([`Event Drive: ${drive.title}`]);
  wsData.push([`Type: ${getDriveTypeLabel(drive)}`]);
  wsData.push([`Date: ${drive.date}`]);
  wsData.push([
    `Target: ${drive.targetDivision} — ${drive.targetNccYear}`,
  ]);
  wsData.push([
    `Deadline: ${new Date(drive.deadline).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  ]);
  if (filterLabel) {
    wsData.push([`Filter: ${filterLabel}`]);
  }
  wsData.push([]); // empty row
  wsData.push(headers);
  wsData.push(...rows);

  // Summary row
  wsData.push([]);
  const optedIn = cadets.filter((c) => c.response === "opted_in").length;
  const optedOut = cadets.filter((c) => c.response === "opted_out").length;
  const noResponse = cadets.filter((c) => c.response === "no_response").length;
  wsData.push(["", "", "", "", "", "", "Opted In:", optedIn]);
  wsData.push(["", "", "", "", "", "", "Opted Out:", optedOut]);
  wsData.push(["", "", "", "", "", "", "No Response:", noResponse]);
  wsData.push(["", "", "", "", "", "", "Total:", cadets.length]);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 6 },  // S.No
    { wch: 28 }, // Name
    { wch: 18 }, // Register Number
    { wch: 8 },  // Division
    { wch: 10 }, // NCC Year
    { wch: 14 }, // Department
    { wch: 8 },  // Rank
    { wch: 14 }, // Phone
    { wch: 14 }, // Response
    { wch: 30 }, // Reason
    { wch: 22 }, // Responded At
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Responses");

  const safeTitle = drive.title.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 30);
  XLSX.writeFile(wb, `${safeTitle} - Responses.xlsx`);
}

// ============ PDF EXPORT ============

export async function exportResponsesAsPdf(
  drive: EventDrive & { id: string },
  cadets: CadetWithResponse[],
  filterLabel?: string,
): Promise<void> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 10;

  // Title
  pdf.setFontSize(14);
  pdf.text(`Event Drive: ${drive.title}`, margin, 15);

  pdf.setFontSize(10);
  pdf.text(`Type: ${getDriveTypeLabel(drive)}`, margin, 22);
  pdf.text(`Date: ${drive.date}`, margin, 27);
  pdf.text(
    `Target: ${drive.targetDivision} — ${drive.targetNccYear}`,
    margin,
    32,
  );
  pdf.text(
    `Deadline: ${new Date(drive.deadline).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    margin,
    37,
  );
  if (filterLabel) {
    pdf.text(`Filter: ${filterLabel}`, margin, 42);
  }

  // Table headers
  const startY = filterLabel ? 48 : 43;
  const colWidths = [10, 50, 35, 20, 25, 25, 20, 30, 55];
  const headers = [
    "S.No",
    "Name",
    "Register No.",
    "Division",
    "NCC Year",
    "Department",
    "Rank",
    "Response",
    "Reason",
  ];

  let y = startY;
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");

  let x = margin;
  for (let i = 0; i < headers.length; i++) {
    pdf.text(headers[i], x, y);
    x += colWidths[i];
  }
  y += 2;
  pdf.line(margin, y, pageWidth - margin, y);
  y += 4;

  pdf.setFont("helvetica", "normal");

  for (let idx = 0; idx < cadets.length; idx++) {
    if (y > pdf.internal.pageSize.getHeight() - 15) {
      pdf.addPage();
      y = 15;
    }
    const c = cadets[idx];
    x = margin;
    const row = [
      String(idx + 1),
      c.name,
      c.registerNumber || "",
      c.division,
      c.nccYear,
      c.department || "",
      c.rank || "CDT",
      getResponseLabel(c.response),
      c.reason || "",
    ];
    for (let i = 0; i < row.length; i++) {
      pdf.text(row[i].slice(0, 30), x, y);
      x += colWidths[i];
    }
    y += 5;
  }

  // Summary
  y += 5;
  if (y > pdf.internal.pageSize.getHeight() - 25) {
    pdf.addPage();
    y = 15;
  }
  pdf.setFont("helvetica", "bold");
  const optedIn = cadets.filter((c) => c.response === "opted_in").length;
  const optedOut = cadets.filter((c) => c.response === "opted_out").length;
  const noResponse = cadets.filter((c) => c.response === "no_response").length;
  pdf.text(`Opted In: ${optedIn}  |  Opted Out: ${optedOut}  |  No Response: ${noResponse}  |  Total: ${cadets.length}`, margin, y);

  const safeTitle = drive.title.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 30);
  pdf.save(`${safeTitle} - Responses.pdf`);
}
