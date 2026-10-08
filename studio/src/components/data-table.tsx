import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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
};

export function DataTable<T>({
  data,
  columns,
  getRowId,
  getRowLabel,
  searchText,
  searchPlaceholder = "검색",
  caption,
  emptyMessage = "등록된 항목이 없어요.",
}: DataTableProps<T>) {
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
      </div>
      <Table variant="bordered">
        <TableCaption visuallyHidden>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
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
            {columns.map((column) => {
              const direction = sort?.id === column.id ? sort.direction : null;
              const Icon =
                direction === "asc"
                  ? ArrowUp
                  : direction === "desc"
                    ? ArrowDown
                    : ArrowUpDown;
              const nextAction =
                direction === "asc"
                  ? "내림차순 정렬"
                  : direction === "desc"
                    ? "정렬 해제"
                    : "오름차순 정렬";
              return (
                <TableHead
                  key={column.id}
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
                      size="sm"
                      aria-label={`${column.header} ${nextAction}`}
                      onClick={() => {
                        setSort((previous) =>
                          nextTableSort(previous, column.id),
                        );
                        setPage(0);
                      }}
                    >
                      {column.header}
                      <Icon aria-hidden="true" />
                    </Button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {current.rows.map((row) => {
            const id = getRowId(row);
            return (
              <TableRow
                key={id}
                data-state={selected.has(id) ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`${getRowLabel(row)} 선택`}
                    checked={selected.has(id)}
                    onCheckedChange={(checked) =>
                      selectRows([id], checked === true)
                    }
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell key={column.id}>{column.cell(row)}</TableCell>
                ))}
              </TableRow>
            );
          })}
          {current.rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length + 1} variant="empty">
                {query.trim() ? "검색 결과가 없어요." : emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {current.start}–{current.end} / {current.count}개
        </p>
        <div className="flex flex-wrap items-center gap-4">
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
          <span className="text-sm text-muted-foreground">
            {current.pageIndex + 1} / {current.pageCount} 페이지
          </span>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
