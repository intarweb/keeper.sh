import { ActivityIndicator, View } from "react-native";

import { PrimaryButton } from "@/components/form-controls";
import { BodyText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii } from "@/design/tokens";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: 96,
        padding: 20,
        gap: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.secondaryLabel} />
      <MutedText>{label}</MutedText>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
  onAction,
}: {
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        padding: 16,
        gap: 4,
        borderRadius: keeperRadii.row,
        borderCurve: "continuous",
      }}
    >
      <BodyText style={{ fontFamily: keeperFonts.bodyMedium }}>
        {title}
      </BodyText>
      <MutedText>{message}</MutedText>
      {action && onAction ? (
        <View style={{ alignSelf: "flex-start", paddingTop: 6 }}>
          <PrimaryButton variant="elevated" label={action} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flex: 1,
        minHeight: 160,
        padding: 20,
        gap: 10,
        justifyContent: "center",
        backgroundColor: colors.background,
      }}
    >
      <BodyText
        accessibilityRole="alert"
        style={{ color: colors.danger, fontFamily: keeperFonts.bodyMedium }}
      >
        Couldn’t load this screen
      </BodyText>
      <MutedText>{message}</MutedText>
      {onRetry ? (
        <View style={{ alignSelf: "flex-start" }}>
          <PrimaryButton
            variant="elevated"
            label="Try Again"
            onPress={onRetry}
          />
        </View>
      ) : null}
    </View>
  );
}

export function StaleBanner({ updatedAt }: { updatedAt: number | null }) {
  return (
    <View
      style={{
        padding: 10,
        borderRadius: keeperRadii.control,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.borderElevated,
        backgroundColor: colors.card,
      }}
    >
      <MutedText style={{ color: colors.warning, fontSize: 12 }}>
        Offline copy · Last refreshed{" "}
        {updatedAt ? new Date(updatedAt).toLocaleString() : "earlier"}
      </MutedText>
    </View>
  );
}
