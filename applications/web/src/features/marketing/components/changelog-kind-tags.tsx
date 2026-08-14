import { Tag, TagDot, TagList } from "@/components/ui/primitives/tag";
import { changelogKindEmphasis, changelogKindLabel, type ChangelogKind } from "./changelog-kinds";

export function ChangelogKindDot({ kind }: { kind: ChangelogKind }) {
  return <TagDot emphasis={changelogKindEmphasis[kind]} />;
}

export function ChangelogKindTags({ kinds }: { kinds: ChangelogKind[] }) {
  if (kinds.length === 0) {
    return null;
  }

  return (
    <TagList label="What changed">
      {kinds.map((kind) => (
        <Tag key={kind} tone={kind === "added" ? "default" : "muted"}>
          <ChangelogKindDot kind={kind} />
          {changelogKindLabel[kind]}
        </Tag>
      ))}
    </TagList>
  );
}
