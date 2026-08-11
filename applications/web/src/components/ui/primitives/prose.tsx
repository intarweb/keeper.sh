import { Streamdown } from "streamdown";
import { markdownComponents } from "./markdown-component-map";

export function Prose({ children }: { children: string }) {
  return (
    <article className="flex flex-col gap-2">
      <Streamdown components={markdownComponents}>{children}</Streamdown>
    </article>
  );
}
