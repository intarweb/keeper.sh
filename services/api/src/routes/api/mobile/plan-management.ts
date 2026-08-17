import { baseUrl, env } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";

const GET = withWideEvent(
  withAuth(() => {
    if (env.COMMERCIAL_MODE !== true) {
      return Response.json({ url: null });
    }
    const configured = env.MOBILE_PLAN_MANAGEMENT_URL;
    let url = new URL("/dashboard/upgrade", baseUrl);
    if (configured) {
      url = new URL(configured);
    }
    let safeUrl: string | null = null;
    if (
      url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.hash
    ) {
      safeUrl = url.toString();
    }
    return Response.json({
      // Mobile opens this in an authenticated browser.
      // The server does not expose Polar credentials or invent an in-app purchase path here.
      url: safeUrl,
    });
  }),
);

export { GET };
