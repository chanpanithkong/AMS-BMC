"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import {
  flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData, type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Page } from "@/lib/api/types/common";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match the library's
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Amount columns are right-aligned (SRS §14.1). */
    align?: "left" | "right" | "center";
    /** Label in the column chooser when the header is not plain text. */
    label?: string;
    /** Server field to sort by; omit for columns that cannot be sorted. */
    sortKey?: string;
  }
}

export interface PageRequest {
  cursor: string | null;
  limit: number;
  /** "field" ascending or "-field" descending (SRS §13.1). */
  sort?: string;
}

interface DataTableProps<T> {
  /** Stable id used to remember column visibility per user. */
  tableId: string;
  columns: ColumnDef<T, unknown>[];
  /** Query key including the filters, so that a filter change refetches from the first page. */
  queryKey: QueryKey;
  fetchPage: (request: PageRequest, signal: AbortSignal) => Promise<Page<T>>;
  getRowId: (row: T) => string;
  /** Sort value kept by the caller (usually in the URL). */
  sort?: string;
  onSortChange?: (sort: string) => void;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  caption: string;
  empty?: ReactNode;
  /** Extra controls rendered next to the column chooser. */
  toolbar?: ReactNode;
}

function loadVisibility(key: string): VisibilityState {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as VisibilityState) : {};
  } catch {
    return {};
  }
}

/**
 * List table with server-side cursor pagination and sorting, column visibility saved per user, and
 * row click → detail (SRS NFR-USA-007, prompt §6). Loading, empty and error states are built in.
 */
export function DataTable<T>({
  tableId, columns, queryKey, fetchPage, getRowId, sort, onSortChange, onRowClick, pageSize = 50, caption, empty, toolbar,
}: DataTableProps<T>) {
  const t = useTranslations("data.table");
  const userId = useSession((s) => s.user?.id ?? "anon");
  const storageKey = `ams.columns.${userId}.${tableId}`;
  const [visibility, setVisibility] = useState<VisibilityState>({});

  // Column preferences are per browser; read after mount to keep server and client markup equal.
  useEffect(() => setVisibility(loadVisibility(storageKey)), [storageKey]);

  const changeVisibility = (next: VisibilityState) => {
    setVisibility(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // storage unavailable: the choice lasts for this visit only
    }
  };

  const query = useInfiniteQuery({
    queryKey: [...queryKey, sort ?? "", pageSize],
    queryFn: ({ pageParam, signal }) => fetchPage({ cursor: pageParam, limit: pageSize, sort }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.page.next_cursor,
  });

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.page.total;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages its own memoisation
  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (updater) => changeVisibility(typeof updater === "function" ? updater(visibility) : updater),
  });

  const toggleSort = (key: string) => onSortChange?.(sort === key ? `-${key}` : sort === `-${key}` ? "" : key);
  const alignClass = (align?: string) => (align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left");
  const labelOf = (id: string, header: unknown, label?: string) => label ?? (typeof header === "string" ? header : id);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2" data-print="hide">
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {query.isSuccess && (total !== undefined ? t("shown", { shown: rows.length, total }) : t("shownNoTotal", { shown: rows.length }))}
        </p>
        <div className="flex items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 aria-hidden />
                {t("columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {labelOf(column.id, column.columnDef.header, column.columnDef.meta?.label)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative overflow-x-auto rounded-lg border bg-card">
        {query.isPending ? (
          <TableSkeleton columns={Math.min(columns.length, 6)} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          (empty ?? <EmptyState title={t("noResults")} />)
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-muted/50">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const key = meta?.sortKey;
                    const direction = key && sort === key ? "ascending" : key && sort === `-${key}` ? "descending" : undefined;
                    const content = flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={direction}
                        className={cn("px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground", alignClass(meta?.align))}
                      >
                        {key && onSortChange ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(key)}
                            className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={t("sortBy", { column: labelOf(header.column.id, header.column.columnDef.header, meta?.label) })}
                          >
                            {content}
                            {direction === "ascending" ? <ArrowUp className="size-3" aria-hidden /> : direction === "descending" ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-50" aria-hidden />}
                          </button>
                        ) : (
                          content
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t", onRowClick && "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none")}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row.original);
                  } : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-3 py-2", alignClass(cell.column.columnDef.meta?.align), cell.column.columnDef.meta?.align === "right" && "tabular-nums")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {query.hasNextPage && (
        <div className="flex justify-center" data-print="hide">
          <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
            {query.isFetchingNextPage ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
