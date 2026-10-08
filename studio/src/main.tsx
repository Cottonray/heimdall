import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { installDragFeedback } from "./lib/drag-feedback";
const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
installDragFeedback();
createRoot(root).render(<App />);
