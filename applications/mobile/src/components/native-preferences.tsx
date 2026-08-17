import { ToggleRow } from "@/components/form-controls";
import { Section } from "@/components/native-list";

export interface NativePreference {
  disabled?: boolean;
  key: string;
  label: string;
  value: boolean;
}

export function NativePreferences({
  title,
  footer,
  items,
  onChange,
}: {
  title: string;
  footer?: string;
  items: NativePreference[];
  onChange(key: string, value: boolean): void;
}) {
  return (
    <Section title={title} footer={footer}>
      {items.map((item) => (
        <ToggleRow
          key={item.key}
          label={item.label}
          value={item.value}
          disabled={item.disabled}
          onValueChange={(value) => onChange(item.key, value)}
        />
      ))}
    </Section>
  );
}
