type Bounds = { left: number; top: number; width: number; height: number };

// object-contain can leave letterboxing inside the image element.
export function devicePoint(
  clientX: number,
  clientY: number,
  bounds: Bounds,
  screen: { width: number; height: number },
  clamp = false,
) {
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    screen.width <= 0 ||
    screen.height <= 0
  )
    return null;
  const scale = Math.min(
    bounds.width / screen.width,
    bounds.height / screen.height,
  );
  const left = bounds.left + (bounds.width - screen.width * scale) / 2;
  const top = bounds.top + (bounds.height - screen.height * scale) / 2;
  const x = (clientX - left) / scale;
  const y = (clientY - top) / scale;
  if (!clamp && (x < 0 || y < 0 || x >= screen.width || y >= screen.height))
    return null;
  return {
    x: Math.max(0, Math.min(screen.width - 1, Math.round(x))),
    y: Math.max(0, Math.min(screen.height - 1, Math.round(y))),
  };
}
