import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createKeeperMcpHandler } from "../src/mcp-handler";
import { createKeeperMcpToolset } from "../src/toolset";

/* The www host, which serves directly. The apex redirects, and a registry
   entry cannot be edited once published, so both the endpoint and the
   documentation URL have to sit on this origin. */
const CANONICAL_ORIGIN = "https://www.keeper.sh";

const REGISTRY_NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const REGISTRY_DESCRIPTION_MAX_LENGTH = 100;
const REGISTRY_TITLE_MAX_LENGTH = 100;

const manifestSchema = z.object({
  $schema: z.string().url(),
  name: z.string().max(200).regex(REGISTRY_NAME_PATTERN),
  title: z.string().max(REGISTRY_TITLE_MAX_LENGTH),
  description: z.string().max(REGISTRY_DESCRIPTION_MAX_LENGTH),
  version: z.string(),
  websiteUrl: z.string().url(),
  repository: z.object({
    url: z.string().url(),
    source: z.literal("github"),
    subfolder: z.string(),
  }),
  icons: z.array(z.object({
    src: z.string().startsWith("https://"),
    mimeType: z.enum(["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]),
    sizes: z.array(z.string().regex(/^\d+x\d+$|^any$/)),
    theme: z.enum(["light", "dark"]),
  })).min(1),
  remotes: z.array(z.object({
    type: z.literal("streamable-http"),
    url: z.string().url(),
  })).length(1),
});

const initializeResultSchema = z.object({
  result: z.object({
    serverInfo: z.object({
      name: z.string(),
      version: z.string(),
    }),
  }),
});

const manifest = manifestSchema.parse(
  JSON.parse(readFileSync(new URL("../../../server.json", import.meta.url), "utf8")),
);

const [namespace, serverSegment] = manifest.name.split("/");

const readAnnouncedServerInfo = async (): Promise<{ name: string; version: string }> => {
  const handler = createKeeperMcpHandler({
    auth: {
      api: {
        getMcpSession: () => Promise.resolve({
          scopes: "keeper.read",
          userId: "user-123",
        }),
      },
    },
    mcpPublicUrl: "https://mcp.keeper.sh",
    apiBaseUrl: "https://keeper.sh",
    toolset: createKeeperMcpToolset(),
  });

  const response = await handler(
    new Request("https://mcp.keeper.sh/mcp", {
      body: JSON.stringify({
        id: "1",
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
          protocolVersion: "2025-06-18",
        },
      }),
      headers: {
        "Accept": "application/json, text/event-stream",
        "Authorization": "Bearer test-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );

  const { result } = initializeResultSchema.parse(await response.json());
  return result.serverInfo;
};

describe("registry manifest", () => {
  it("claims the namespace backed by the domain we can verify", () => {
    expect(namespace).toBe("sh.keeper");
  });

  it("advertises the hosted endpoint on the canonical host, which does not redirect", () => {
    expect(manifest.remotes[0]?.url).toBe(`${CANONICAL_ORIGIN}/mcp`);
  });

  it("documents itself on the canonical host", () => {
    expect(manifest.websiteUrl.startsWith(`${CANONICAL_ORIGIN}/`)).toBe(true);
  });

  it("carries the name and version the server announces on initialize", async () => {
    const serverInfo = await readAnnouncedServerInfo();

    expect(serverInfo).toEqual({
      name: serverSegment,
      version: manifest.version,
    });
  });
});
