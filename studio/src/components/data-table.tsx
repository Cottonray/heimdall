import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  availableSelection,
  buildTablePage,
  nextTableSort,
  pageSelection,
  selectTableRows,
  type TableSort,
} from "./data-table-model";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  onCellClick?: (row: T) => void;
  cellActionLabel?: (row: T) => string;
};

type DataTableProps<T> = {
  data: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T) => string;
  getRowLabel: (row: T) => string;
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  caption: string;
  emptyMessage?: string;
  selectable?: boolean;
  onRowClick?: (row: T) => void;
  rowActions?: (
    row: T,
  ) => { label: string; onSelect: () => void; disabled?: boolean }[];
};

export function DataTable<T>({
  data,
  columns,
  getRowId,
  getRowLabel,
  searchText,
  searchPlaceholder = "검색",
  caption,
  rowActions,
  selectable = true,
  onRowClick,
  emptyMessage = "등록된 항목이 없어요.",
}: DataTableProps<T>) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TableSort>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const availableIds = new Set(data.map(getRowId));
  const selected = availableSelection(selectedIds, availableIds);
  const current = buildTablePage({
    data,
    columns,
    searchText,
    query,
    sort,
    page,
    pageSize,
  });
  const pageIds = current.rows.map(getRowId);

  function selectRows(ids: string[], checked: boolean) {
    setSelectedIds((previous) =>
      selectTableRows(availableSelection(previous, availableIds), ids, checked),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          className="w-full max-w-sm"
          aria-label={`${caption} 검색`}
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        {selectable && selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span role="status" className="text-sm text-muted-foreground">
              {selected.size}개 선택
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setSelectedIds(new Set())}
            >
              선택 해제
            </Button>
          </div>
        )}
      </div>
      <Table
        variant="bordered"
        fillColumnIndex={columns.length - (selectable ? 0 : 1)}
        columnWidths={[
          ...(selectable ? [40] : []),
          ...columns.map((column) => widths[column.id]),
          ...(rowActions ? [48] : []),
        ]}
      >
        <TableCaption visuallyHidden>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead scope="col" variant="selection">
                <Checkbox
                  aria-label="현재 페이지 전체 선택"
                  title="현재 페이지 전체 선택"
                  checked={pageSelection(selected, pageIds)}
                  disabled={pageIds.length === 0}
                  onCheckedChange={(checked) =>
                    selectRows(pageIds, checked === true)
                  }
                />
              </TableHead>
            )}
            {columns.map((column) => {
              const direction = sort?.id === column.id ? sort.direction : null;
              const Icon =
                direction === "asc"
                  ? ArrowUp
                  : direction === "desc"
                    ? ArrowDown
                    : ArrowUpDown;
              const nextAction =
                direction === "asc" ? "내림차순 정렬" : "오름차순 정렬";
              return (
                <TableHead
                  key={column.id}
                  variant="sortable"
                  resizeLabel={`${column.header} 너비 조절`}
                  onResize={(width) =>
                    setWidths((previous) => ({
                      ...previous,
                      [column.id]: width,
                    }))
                  }
                  scope="col"
                  aria-sort={
                    column.sortValue
                      ? direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                  }
                >
                  {column.sortValue ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="table-header"
                      aria-label={`${column.header} ${nextAction}`}
                      onClick={() => {
                        setSort((previous) =>
                          nextTableSort(previous, column.id),
                        );
                        setPage(0);
                      }}
                    >
                      <span className="truncate">{column.header}</span>
                      <Icon aria-hidden="true" />
                    </Button>
                  ) : (
                    <span className="block truncate px-3 pr-5">
                      {column.header}
                    </span>
                  )}
                </TableHead>
              );
            })}
            {rowActions && (
              <TableHead scope="col">
                <span className="sr-only">옵션</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {current.rows.map((row) => {
            const id = getRowId(row);
            return (
              <TableRow
                key={id}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={
                  onRowClick
                    ? (event) => {
                        const target = event.target as HTMLElement;
                        if (
                          event.defaultPrevented ||
                          target.closest(
                            'button, a, input, select, textarea, [role="menuitem"], [role="checkbox"], [data-row-options]',
                          )
                        )
                          return;
                        onRowClick(row);
                      }
                    : undefined
                }
                data-state={
                  selectable && selected.has(id) ? "selected" : undefined
                }
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      aria-label={`${getRowLabel(row)} 선택`}
                      checked={selected.has(id)}
                      onCheckedChange={(checked) =>
                        selectRows([id], checked === true)
                      }
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={
                      column.onCellClick
                        ? "relative text-primary hover:bg-accent/50"
                        : undefined
                    }
                  >
                    {column.onCellClick ? (
                      <>
                        <span className="pointer-events-none">
                          {column.cell(row)}
                        </span>
                        <button
                          type="button"
                          className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          aria-label={
                            column.cellActionLabel?.(row) ??
                            `${getRowLabel(row)} 상세`
                          }
                          onClick={() => column.onCellClick?.(row)}
                        />
                      </>
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}
                {rowActions && (
                  <TableCell data-row-options className="cursor-default">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${getRowLabel(row)} 옵션`}
                        >
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {rowActions(row).map((action) => (
                          <DropdownMenuItem
                            key={action.label}
                            disabled={action.disabled}
                            onSelect={action.onSelect}
                          >
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {current.rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={
                  columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)
                }
                variant="empty"
              >
                {query.trim() ? "검색 결과가 없어요." : emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="grid grid-cols-2 items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <p role="status" className="text-sm text-muted-foreground">
          총 {current.count}개
          {current.pageCount > 1
            ? ` · ${current.start}–${current.end}번째`
            : ""}
        </p>
        <div className="col-start-2 row-start-1 justify-self-end md:col-start-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">페이지당</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(0);
              }}
            >
              <SelectTrigger size="sm" aria-label="페이지당 행 수">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}개
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <nav
          aria-label="페이지 이동"
          className="col-span-2 row-start-2 flex items-center justify-center gap-1 md:col-span-1 md:col-start-2 md:row-start-1"
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="이전 페이지"
            disabled={current.pageIndex === 0}
            onClick={() => setPage(current.pageIndex - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          {Array.from(
            new Set([
              0,
              current.pageCount - 1,
              ...Array.from(
                { length: 5 },
                (_, offset) => current.pageIndex + offset - 2,
              ).filter((index) => index >= 0 && index < current.pageCount),
            ]),
          )
            .sort((a, b) => a - b)
            .map((index, position, pages) => (
              <span key={index} className="flex items-center gap-1">
                {position > 0 && index - pages[position - 1] > 1 && (
                  <span
                    aria-hidden="true"
                    className="px-1 text-muted-foreground"
                  >
                    …
                  </span>
                )}
                <Button
                  type="button"
                  variant={index === current.pageIndex ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={`${index + 1}페이지`}
                  aria-current={
                    index === current.pageIndex ? "page" : undefined
                  }
                  onClick={() => setPage(index)}
                >
                  {index + 1}
                </Button>
              </span>
            ))}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="다음 페이지"
            disabled={current.pageIndex + 1 >= current.pageCount}
            onClick={() => setPage(current.pageIndex + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  );
}
