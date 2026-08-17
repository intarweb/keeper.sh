import { Link } from "expo-router";
import { BrandMark } from "@/components/brand";
import { EditorialHeading, MutedText } from "@/components/typography";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
export default function NotFoundRoute() {
  return (
    <Screen
      contentContainerStyle={{
        maxWidth: 360,
        justifyContent: "center",
        flexGrow: 1,
      }}
    >
      <BrandMark size={36} />
      <EditorialHeading level={2}>Page not found</EditorialHeading>
      <MutedText>The Keeper page you followed is unavailable.</MutedText>
      <Link
        href="/"
        style={{ color: colors.label, textDecorationLine: "underline" }}
      >
        Return to Keeper.sh
      </Link>
    </Screen>
  );
}
