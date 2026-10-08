import wordmark from "@/assets/heimdall-wordmark.png";
import darkWordmark from "@/assets/heimdall-wordmark-dark.png";

export function HeimdallWordmark() {
  return (
    <span role="img" aria-label="heimdall" className="block h-9 w-32 shrink-0">
      <img
        src={wordmark}
        alt=""
        className="h-full w-full object-cover dark:hidden"
      />
      <img
        src={darkWordmark}
        alt=""
        className="hidden h-full w-full object-cover dark:block"
      />
    </span>
  );
}
