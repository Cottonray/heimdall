/** Block accidental native dragging, except explicitly reorderable workspace tabs. */
export function installDragFeedback() {
  document.addEventListener(
    "dragstart",
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-slot="workspace-tab"][draggable="true"]') &&
        !target.closest('[data-slot="button"]')
      )
        return;
      event.preventDefault();
    },
    true,
  );
}
