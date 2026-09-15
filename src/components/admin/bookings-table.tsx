"use client";

import { useMemo, useState } from "react";
import { formatDate, formatPence, formatTime } from "@/lib/format";
import { BookingStatusSelect } from "@/components/admin/booking-status-select";
import { SyncPaymentButton } from "@/components/admin/sync-payment-button";
import type { Booking, Cleaner, Customer, Service } from "@/lib/types";

type Row = Booking & { PS_CLEAN_services: Service; PS_CLEAN_cleaners: Cleaner; PS_CLEAN_customers: Customer };

type SortKey = "starts_at" | "customer" | "service" | "cleaner" | "amount_paid_pence" | "status";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "starts_at", label: "When" },
  { key: "customer", label: "Customer" },
  { key: "service", label: "Service" },
  { key: "cleaner", label: "Cleaner" },
  { key: "amount_paid_pence", label: "Paid" },
  { key: "status", label: "Status" },
];

const PAGE_SIZES = [10, 25, 50, 100];

function sortValue(row: Row, key: SortKey): string | number {
  switch (key) {
    case "customer":
      return row.PS_CLEAN_customers?.full_name ?? "";
    case "service":
      return row.PS_CLEAN_services?.name ?? "";
    case "cleaner":
      return row.PS_CLEAN_cleaners?.full_name ?? "";
    case "amount_paid_pence":
      return row.amount_paid_pence;
    case "status":
      return row.status;
    default:
      return row.starts_at;
  }
}

export function BookingsTable({ bookings }: { bookings: Row[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("starts_at");
  const [sortDesc, setSortDesc] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...bookings];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [bookings, sortKey, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
    setPage(0);
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="pb-2">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 font-medium hover:text-foreground"
                  >
                    {col.label}
                    {sortKey === col.key && <span aria-hidden="true">{sortDesc ? "▼" : "▲"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((b) => (
              <tr key={b.id} className={`border-t border-border ${b.status === "pending_payment" ? "bg-danger/5" : ""}`}>
                <td className="py-2">
                  {formatDate(b.starts_at)}
                  <br />
                  {formatTime(b.starts_at)}
                </td>
                <td className="py-2">{b.PS_CLEAN_customers?.full_name ?? "—"}</td>
                <td className="py-2">{b.PS_CLEAN_services?.name}</td>
                <td className="py-2">{b.PS_CLEAN_cleaners?.full_name}</td>
                <td className="py-2">{formatPence(b.amount_paid_pence)}</td>
                <td className="py-2">
                  <BookingStatusSelect bookingId={b.id} status={b.status} />
                  {b.status === "pending_payment" && <SyncPaymentButton bookingId={b.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>}
      </div>

      {bookings.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <label className="flex items-center gap-2">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-lg border border-border px-2 py-1 text-sm text-foreground"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-border px-2 py-1 disabled:opacity-40"
              >
                &larr;
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-2 py-1 disabled:opacity-40"
              >
                &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
