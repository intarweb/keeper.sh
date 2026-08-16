import type { Client, Middleware } from "@microsoft/microsoft-graph-client";
import { unimplemented } from "../unimplemented";

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface GraphClientOptions {
  readonly fetch: FetchImplementation;
  readonly getAccessToken: () => Promise<string>;
  readonly timeoutMs: number;
}

const graphMiddlewareChain = (options: GraphClientOptions): readonly Middleware[] =>
  unimplemented(options);

const createGraphClient = (options: GraphClientOptions): Client => unimplemented(options);

export { createGraphClient, graphMiddlewareChain };
export type { FetchImplementation, GraphClientOptions };
