export type TableSort = { id: string; direction: "asc" | "desc" } | null;
export type SortColumn<T> = {
  id: string;
  sortValue?: (row: T) => string | number;
};
const collator = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});
const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ko");

export function nextTableSort(current: TableSort, id: string): TableSort {
  if (current?.id !== id) return { id, direction: "asc" };
  return current.direction === "asc" ? { id, direction: "desc" } : null;
}

export function buildTablePage<T>({
  data,
  columns,
  searchText,
  query,
  sort,
  page,
  pageSize,
}: {
  data: readonly T[];
  columns: readonly SortColumn<T>[];
  searchText: (row: T) => string;
  query: string;
  sort: TableSort;
  page: number;
  pageSize: number;
}) {
  const needle = normalize(query.trim());
  let rows = data
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) => !needle || normalize(searchText(row)).includes(needle),
    );
  const sortValue = columns.find((column) => column.id === sort?.id)?.sortValue;
  if (sort && sortValue) {
    const direction = sort.direction === "asc" ? 1 : -1;
    rows = rows.sort((a, b) => {
      const av = sortValue(a.row),
        bv = sortValue(b.row);
      const comparison =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : collator.compare(String(av), String(bv));
      return comparison * direction || a.index - b.index;
    });
  }
  const count = rows.length;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const pageIndex = Math.max(0, Math.min(page, pageCount - 1));
  const offset = pageIndex * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize).map(({ row }) => row),
    count,
    pageCount,
    pageIndex,
    start: count ? offset + 1 : 0,
    end: Math.min(offset + pageSize, count),
  };
}

export function availableSelection(
  selected: ReadonlySet<string>,
  available: ReadonlySet<string>,
) {
  return new Set([...selected].filter((id) => available.has(id)));
}

export function selectTableRows(
  selected: ReadonlySet<string>,
  ids: readonly string[],
  checked: boolean,
) {
  const next = new Set(selected);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function pageSelection(
  selected: ReadonlySet<string>,
  ids: readonly string[],
): boolean | "indeterminate" {
  const count = ids.filter((id) => selected.has(id)).length;
  return count === 0 ? false : count === ids.length ? true : "indeterminate";
}
