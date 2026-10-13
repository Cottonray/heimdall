// Browser views own execution resources; saved tests remain independent of them.
const viewers = new Map<string, number>();
export function watching(id: string) {
  return (viewers.get(id) || 0) > 0;
}
export function join(id: string) {
  if (id) viewers.set(id, (viewers.get(id) || 0) + 1);
}
export function leave(id: string) {
  const count = (viewers.get(id) || 0) - 1;
  if (count > 0) viewers.set(id, count);
  else viewers.delete(id);
}
