import appium from "@/assets/appium.png";
import playwright from "@/assets/playwright.png";
import type { Engine } from "../../../contracts/studio";

export function EngineLogo({ engine }: { engine: Engine }) {
  const name = engine === "android" ? "Appium" : "Playwright";
  return (
    <img
      src={engine === "android" ? appium : playwright}
      alt={name}
      title={name}
      className="size-7 shrink-0 object-contain"
    />
  );
}
