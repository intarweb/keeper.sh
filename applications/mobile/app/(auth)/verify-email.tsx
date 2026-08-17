import { Link } from "expo-router";
import { EditorialHeading, MutedText } from "@/components/typography";
import { BrandMark } from "@/components/brand";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
export default function VerifyEmailRoute() {
  return (
    <Screen
      contentContainerStyle={{
        maxWidth: 360,
        justifyContent: "center",
        flexGrow: 1,
      }}
    >
      <BrandMark size={36} />
      <EditorialHeading level={2}>Check your email</EditorialHeading>
      <MutedText>
        Open the verification link on this device, then return to sign in.
      </MutedText>
      <Link
        href="/(auth)/login"
        style={{ color: colors.label, textDecorationLine: "underline" }}
      >
        Back to sign in
      </Link>
    </Screen>
  );
}
