/** Disable native dragging while preserving clicks and editable text selection. */
export function installDragFeedback() {
  document.addEventListener(
    "dragstart",
    (event) => event.preventDefault(),
    true,
  );
}
