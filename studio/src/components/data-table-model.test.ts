import test from "node:test";
import assert from "node:assert/strict";
import {
  availableSelection,
  buildTablePage,
  nextTableSort,
  pageSelection,
  selectTableRows,
  type TableSort,
} from "./data-table-model.ts";

const data = Array.from({ length: 23 }, (_, index) => ({
  id: `domain-${index + 1}`,
  name: `도메인 ${23 - index}`,
  url: index % 2 === 0 ? "https://BANK.example" : "https://mobile.example",
  group: index % 2,
}));
const columns = [
  { id: "name", sortValue: (row: (typeof data)[number]) => row.name },
  { id: "group", sortValue: (row: (typeof data)[number]) => row.group },
];
function view(
  overrides: Partial<
    Parameters<typeof buildTablePage<(typeof data)[number]>>[0]
  > = {},
) {
  return buildTablePage({
    data,
    columns,
    searchText: (row) => `${row.name} ${row.url}`,
    query: "",
    sort: null,
    page: 0,
    pageSize: 10,
    ...overrides,
  });
}
const ids = (rows: typeof data) => rows.map((row) => row.id);

test("filter and sort operate before pagination without changing original order", () => {
  assert.deepEqual(ids(view({ page: 1 }).rows), ids(data.slice(10, 20)));
  const filtered = view({
    query: " ＢＡＮＫ ",
    sort: { id: "name", direction: "asc" },
  });
  assert.equal(filtered.count, 12);
  assert.equal(filtered.rows[0].name, "도메인 1");
  assert.equal(filtered.rows[9].name, "도메인 19");
  assert.equal(data[0].name, "도메인 23");
  assert.deepEqual(ids(view().rows), ids(data.slice(0, 10)));
});

test("sort cycles through both directions and original order; equal values remain stable", () => {
  let sort: TableSort = nextTableSort(null, "name");
  assert.equal(view({ sort }).rows[0].name, "도메인 1");
  sort = nextTableSort(sort, "name");
  assert.equal(view({ sort }).rows[0].name, "도메인 23");
  sort = nextTableSort(sort, "name");
  assert.equal(sort, null);
  const grouped = view({
    sort: { id: "group", direction: "desc" },
    pageSize: 50,
  });
  assert.deepEqual(
    ids(grouped.rows.slice(0, 11)),
    ids(data.filter((row) => row.group === 1)),
  );
  assert.deepEqual(nextTableSort({ id: "group", direction: "desc" }, "name"), {
    id: "name",
    direction: "asc",
  });
});

test("page selection preserves other pages and filtered-out selections, and reports mixed", () => {
  const firstPage = ids(view().rows);
  const secondPage = ids(view({ page: 1 }).rows);
  let selected = selectTableRows(new Set(), firstPage, true);
  assert.equal(pageSelection(selected, firstPage), true);
  assert.equal(pageSelection(selected, secondPage), false);
  selected = selectTableRows(selected, [secondPage[0]], true);
  assert.equal(pageSelection(selected, secondPage), "indeterminate");
  const searchPage = ids(view({ query: "mobile" }).rows);
  selected = selectTableRows(selected, searchPage, true);
  selected = selectTableRows(selected, firstPage, false);
  assert.ok(selected.has(secondPage[0]));
  assert.equal(selected.size, 6);
  assert.equal(pageSelection(selected, firstPage), false);
  const available = new Set(
    data.filter((row) => row.id !== secondPage[0]).map((row) => row.id),
  );
  const valid = availableSelection(selected, available);
  assert.equal(valid.size, 5);
  assert.ok(!valid.has(secondPage[0]));
  assert.ok(selected.has(secondPage[0]));
});

test("shrinking data clamps the page and empty results never produce phantom rows", () => {
  const last = view({ page: 2 });
  assert.deepEqual([last.start, last.end, last.pageCount], [21, 23, 3]);
  const shrunk = view({ data: data.slice(0, 3), page: 2 });
  assert.deepEqual([shrunk.pageIndex, shrunk.start, shrunk.end], [0, 1, 3]);
  const empty = view({ query: "nothing matches", page: 2 });
  assert.deepEqual(
    [empty.pageIndex, empty.start, empty.end, empty.count],
    [0, 0, 0, 0],
  );
  assert.deepEqual(empty.rows, []);
  assert.equal(pageSelection(new Set(["unrelated"]), []), false);
});
