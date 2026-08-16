import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { AuthenticationHandler, Client } from "@microsoft/microsoft-graph-client";
import { createHeldTokenAuthenticationProvider } from "./authentication";

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface GraphClientOptions {
  readonly fetch: FetchImplementation;
  readonly getAccessToken: () => Promise<string>;
  readonly timeoutMs: number;
}

class GraphTransportHandler implements Middleware {
  private readonly send: FetchImplementation;

  private readonly ceilingMs: number;

  constructor(send: FetchImplementation, ceilingMs: number) {
    this.send = send;
    this.ceilingMs = ceilingMs;
  }

  async execute(context: Context): Promise<void> {
    context.response = await this.send(context.request, context.options);
  }

  requestCeilingMs(): number {
    return this.ceilingMs;
  }
}

const graphVersion = "v1.0";

const checkedCeiling = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`a Graph client needs a positive request ceiling, not "${timeoutMs}"`);
  }
  return timeoutMs;
};

const graphMiddlewareChain = (options: GraphClientOptions): readonly Middleware[] => [
  new AuthenticationHandler(createHeldTokenAuthenticationProvider(options)),
  new GraphTransportHandler(options.fetch, checkedCeiling(options.timeoutMs)),
];

const createGraphClient = (options: GraphClientOptions): Client =>
  Client.initWithMiddleware({
    middleware: [...graphMiddlewareChain(options)],
    defaultVersion: graphVersion,
  });

export { createGraphClient, graphMiddlewareChain, GraphTransportHandler };
export type { FetchImplementation, GraphClientOptions };
