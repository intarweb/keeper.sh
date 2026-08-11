import type { PropsWithChildren, ReactNode } from "react";
import { Heading1, Heading2, Heading3 } from "@/components/ui/primitives/heading";
import { Text } from "@/components/ui/primitives/text";
import { ExternalTextLink } from "@/components/ui/primitives/text-link";
import type { CompareRow, CompareSource } from "@/lib/compare";

export function ComparePageLayout({ children }: PropsWithChildren) {
  return <div className="flex flex-col gap-12 py-16">{children}</div>;
}

export function ComparePageHeader({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <Text size="xs" tone="muted" className="uppercase opacity-75">
        {eyebrow}
      </Text>
      <Heading1>{title}</Heading1>
      <Text size="base" tone="muted" className="max-w-[68ch] leading-6">
        {summary}
      </Text>
    </header>
  );
}

export function CompareSection({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: ReactNode }>) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Heading2 as="h2">{title}</Heading2>
        {description ? (
          <Text size="sm" tone="muted" className="max-w-[68ch] leading-6">
            {description}
          </Text>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function CompareProse({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-col gap-3 max-w-[68ch]">
      {children}
    </div>
  );
}

function CompareCitation({ sourceIds, sources }: { sourceIds: string[]; sources: CompareSource[] }) {
  const positions = sourceIds
    .map((sourceId) => sources.findIndex((source) => source.id === sourceId))
    .filter((index) => index >= 0);

  if (positions.length === 0) return null;

  return (
    <sup className="ml-1 tabular-nums">
      {positions.map((position, index) => (
        <span key={sources[position].id}>
          {index > 0 ? <span className="text-foreground-disabled">,</span> : null}
          <a
            href={`#source-${sources[position].id}`}
            className="text-foreground-muted hover:text-foreground underline underline-offset-2"
          >
            {position + 1}
          </a>
        </span>
      ))}
    </sup>
  );
}

export function CompareTable({
  rivalName,
  rows,
  sources,
  caption,
}: {
  rivalName: string;
  rows: CompareRow[];
  sources: CompareSource[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-interactive-border bg-background shadow-xs">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm tracking-tight">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-interactive-border">
            <th scope="col" className="w-1/4 px-4 py-3 font-medium text-foreground">
              Dimension
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-foreground">
              Keeper.sh
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-foreground">
              {rivalName}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dimension} className="border-b border-interactive-border last:border-b-0">
              <th scope="row" className="px-4 py-3 align-top font-normal text-foreground">
                {row.dimension}
              </th>
              <td className="px-4 py-3 align-top text-foreground-muted">{row.keeper}</td>
              <td className="px-4 py-3 align-top text-foreground-muted">
                {row.rival}
                {row.sourceIds ? (
                  <CompareCitation sourceIds={row.sourceIds} sources={sources} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompareVerdictGrid({ children }: PropsWithChildren) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>;
}

export function CompareVerdictCard({
  title,
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-interactive-border bg-background p-5 shadow-xs">
      <Heading3 as="h3">{title}</Heading3>
      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm tracking-tight text-foreground-muted">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </article>
  );
}

export function CompareProjectList({ children }: PropsWithChildren) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

export function CompareProjectCard({
  name,
  href,
  summary,
  facts,
  sourceIds,
  sources,
}: {
  name: string;
  href: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  sourceIds: string[];
  sources: CompareSource[];
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-interactive-border bg-background p-5 shadow-xs">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <Heading3 as="h3">{name}</Heading3>
          <ExternalTextLink
            align="left"
            href={href}
            rel="noopener noreferrer nofollow"
            size="xs"
            target="_blank"
            tone="muted"
          >
            {href.replace(/^https?:\/\//, "")}
          </ExternalTextLink>
          <CompareCitation sourceIds={sourceIds} sources={sources} />
        </div>
        <Text size="sm" tone="muted" className="leading-6">
          {summary}
        </Text>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col gap-0.5">
            <dt className="text-xs tracking-tight text-foreground-disabled">{fact.label}</dt>
            <dd className="text-sm tracking-tight text-foreground-muted">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function CompareSourceList({ sources }: { sources: CompareSource[] }) {
  return (
    <ol className="flex list-none flex-col gap-2">
      {sources.map((source, index) => (
        <li
          key={source.id}
          id={`source-${source.id}`}
          className="flex gap-2 scroll-mt-24 text-xs tracking-tight text-foreground-muted"
        >
          <span className="tabular-nums text-foreground-disabled">{index + 1}.</span>
          <span className="flex flex-col gap-0.5">
            <span>{source.label}</span>
            <ExternalTextLink
              align="left"
              href={source.url}
              rel="noopener noreferrer nofollow"
              size="xs"
              target="_blank"
              tone="muted"
              className="break-all"
            >
              {source.url}
            </ExternalTextLink>
            <span className="text-foreground-disabled">Checked {source.checkedAt}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
