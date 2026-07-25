import { ACCENT_VARS } from "./accents";
import type { AccentName } from "./types";

export const ACCENT_SWATCHES = Object.fromEntries(
  Object.entries(ACCENT_VARS).map(([name, vars]) => [name, vars.primary]),
) as Record<AccentName, string>;
