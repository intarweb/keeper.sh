import { useMemo } from "react";
import { View } from "react-native";

import type { KeeperEvent } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { LoadingState } from "@/components/states";
import { MonoText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { keeperRadii } from "@/design/tokens";
import { useApp } from "@/providers/app-provider";

export function ActivityScreen() {
  const { api } = useApp();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + 8);
  to.setHours(23, 59, 59, 999);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const resource = useApiResource<KeeperEvent[]>(
    `/api/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    {
      load: (signal) =>
        api.client.listEvents({ from: fromIso, to: toIso }, signal),
    },
  );
  const days = useMemo(
    () =>
      Array.from({ length: 15 }, (_, index) => {
        const date = new Date(from);
        date.setDate(date.getDate() + index);
        const count = (resource.data ?? []).filter(
          (event) =>
            new Date(event.startTime).toDateString() === date.toDateString(),
        ).length;
        return { date, count };
      }),
    [resource.data],
  );
  const max = Math.max(1, ...days.map((day) => day.count));
  const today = new Date().toDateString();

  return (
    <Screen>
      {resource.loading && !resource.data ? (
        <LoadingState />
      ) : (
        <Section
          title="Calendar activity"
          footer="Emerald marks today. Future activity is shown with a lighter treatment."
        >
          <View style={{ padding: 14, gap: 12 }}>
            <View
              style={{
                height: 108,
                flexDirection: "row",
                gap: 3,
                alignItems: "flex-end",
              }}
            >
              {days.map((day) => {
                const isToday = day.date.toDateString() === today;
                const isFuture = day.date > new Date();
                return (
                  <View
                    key={day.date.toISOString()}
                    style={{ flex: 1, gap: 5, alignItems: "center" }}
                  >
                    <View
                      accessibilityLabel={`${day.count} events on ${day.date.toLocaleDateString()}`}
                      style={{
                        width: "100%",
                        minHeight: 5,
                        height: (72 * day.count) / max + 5,
                        borderRadius: keeperRadii.control / 2,
                        backgroundColor: isToday
                          ? colors.success
                          : colors.label,
                        opacity: isFuture ? 0.18 : isToday ? 1 : 0.42,
                      }}
                    />
                    <MonoText
                      style={{ color: colors.secondaryLabel, fontSize: 11 }}
                    >
                      {day.date.getDate()}
                    </MonoText>
                  </View>
                );
              })}
            </View>
            <MutedText style={{ textAlign: "center", fontSize: 12 }}>
              {(resource.data ?? []).length} events across the surrounding 15
              days
            </MutedText>
          </View>
        </Section>
      )}
    </Screen>
  );
}
