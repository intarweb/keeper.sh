import type { PropsWithChildren } from "react";
import { Provider } from "jotai";

export function CalendarGridProvider({ children }: PropsWithChildren) {
  return <Provider>{children}</Provider>;
}
