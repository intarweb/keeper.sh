import {
  Appearance,
  DynamicColorIOS,
  Platform,
  type ColorValue,
} from "react-native";

import {
  keeperPalettes,
  resolveKeeperPalette,
  type KeeperPalette,
} from "@/design/palette";

export {
  keeperPalettes,
  resolveKeeperPalette,
  type KeeperPalette,
} from "@/design/palette";

function adaptive(key: keyof KeeperPalette): ColorValue {
  if (Platform.OS === "ios") {
    return DynamicColorIOS({
      light: keeperPalettes.light[key],
      dark: keeperPalettes.dark[key],
    });
  }
  return resolveKeeperPalette(Appearance.getColorScheme())[key];
}

export const colors: Record<keyof KeeperPalette, ColorValue> = {
  get accent() {
    return adaptive("accent");
  },
  get background() {
    return adaptive("background");
  },
  get backgroundHover() {
    return adaptive("backgroundHover");
  },
  get backgroundInverse() {
    return adaptive("backgroundInverse");
  },
  get borderElevated() {
    return adaptive("borderElevated");
  },
  get card() {
    return adaptive("card");
  },
  get danger() {
    return adaptive("danger");
  },
  get dangerBackground() {
    return adaptive("dangerBackground");
  },
  get dangerBorder() {
    return adaptive("dangerBorder");
  },
  get foregroundInverse() {
    return adaptive("foregroundInverse");
  },
  get groupedBackground() {
    return adaptive("groupedBackground");
  },
  get highlight() {
    return adaptive("highlight");
  },
  get label() {
    return adaptive("label");
  },
  get ring() {
    return adaptive("ring");
  },
  get secondaryLabel() {
    return adaptive("secondaryLabel");
  },
  get separator() {
    return adaptive("separator");
  },
  get success() {
    return adaptive("success");
  },
  get template() {
    return adaptive("template");
  },
  get warning() {
    return adaptive("warning");
  },
};
