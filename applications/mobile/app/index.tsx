import { Redirect } from "expo-router";
import { useApp } from "@/providers/app-provider";
export default function IndexRoute() {
  const { session } = useApp();
  return <Redirect href={session ? "/(tabs)/today" : "/(auth)/login"} />;
}
