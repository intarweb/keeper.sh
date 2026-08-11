import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(marketing)/compare")({
  component: CompareRouteLayout,
});

function CompareRouteLayout() {
  return <Outlet />;
}
