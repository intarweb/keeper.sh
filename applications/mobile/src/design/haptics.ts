import * as Haptics from "expo-haptics";

/** Haptics are intentionally reserved for explicit, committed actions on iOS. */
export async function committedActionHaptic(): Promise<void> {
  if (process.env.EXPO_OS !== "ios") return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics can be unavailable in simulators, Low Power Mode, and some devices.
  }
}

export async function successHaptic(): Promise<void> {
  if (process.env.EXPO_OS !== "ios") return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Feedback is an enhancement and must never block the completed action.
  }
}
