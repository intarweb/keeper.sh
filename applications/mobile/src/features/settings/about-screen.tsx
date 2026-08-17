import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { View } from "react-native";

import { BrandMark, KeeperFooter } from "@/components/brand";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { EditorialHeading, MutedText } from "@/components/typography";

export function AboutScreen() {
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 10, paddingVertical: 16 }}>
        <BrandMark size={48} />
        <EditorialHeading level={2}>Keeper.sh</EditorialHeading>
        <MutedText style={{ textAlign: "center", maxWidth: 320 }}>
          Privacy-first calendar synchronization, built for every calendar you
          keep.
        </MutedText>
      </View>
      <Section title="App">
        <Row
          label="Version"
          detail={Constants.expoConfig?.version ?? "development"}
        />
        <Row
          label="Runtime"
          detail={`Expo ${Constants.expoConfig?.sdkVersion ?? "57"}`}
        />
      </Section>
      <Section title="Legal & project">
        <Row
          icon="safari"
          label="Keeper.sh website"
          onPress={() => Linking.openURL("https://keeper.sh")}
        />
        <Row
          icon="hand.raised"
          label="Privacy policy"
          onPress={() => Linking.openURL("https://keeper.sh/privacy")}
        />
        <Row
          icon="doc.text"
          label="Terms"
          onPress={() => Linking.openURL("https://keeper.sh/terms")}
        />
        <Row
          icon="chevron.left.forwardslash.chevron.right"
          label="Source code"
          onPress={() =>
            Linking.openURL("https://github.com/keeper-sh/keeper.sh")
          }
        />
      </Section>
      <KeeperFooter />
    </Screen>
  );
}
