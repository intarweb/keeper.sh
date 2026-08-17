import { useState } from "react";
import { BodyText as Text } from "@/components/typography";

import { Field, PrimaryButton, ToggleRow } from "@/components/form-controls";
import { Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";

export function SupportScreen({ type }: { type: "feedback" | "report" }) {
  const { api } = useApp();
  const [message, setMessage] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await api.client.submitFeedback({
        type,
        message: message.trim(),
        wantsFollowUp: type === "report" ? followUp : false,
      });
      setMessage("");
      setStatus(
        type === "feedback"
          ? "Thank you for helping improve Keeper.sh."
          : "Your report has been submitted.",
      );
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Text selectable style={{ color: colors.secondaryLabel, lineHeight: 20 }}>
        {type === "feedback"
          ? "Tell us what would make Keeper.sh better."
          : "Describe what happened and what you expected. Event details are not attached automatically."}
      </Text>
      <Field
        label={type === "feedback" ? "Feedback" : "Problem Description"}
        value={message}
        onChangeText={setMessage}
        multiline
        autoCapitalize="sentences"
      />
      {type === "report" ? (
        <Section>
          <ToggleRow
            label="Notify me when addressed"
            value={followUp}
            onValueChange={setFollowUp}
          />
        </Section>
      ) : null}
      <PrimaryButton
        busy={busy}
        disabled={!message.trim()}
        label={type === "feedback" ? "Send Feedback" : "Submit Report"}
        onPress={submit}
      />
      {status ? (
        <Text
          selectable
          style={{
            color:
              status.startsWith("Thank") || status.startsWith("Your")
                ? colors.success
                : colors.danger,
          }}
        >
          {status}
        </Text>
      ) : null}
    </Screen>
  );
}
