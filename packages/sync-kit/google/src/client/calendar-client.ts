import type { calendar_v3 } from "@googleapis/calendar";
import { unimplemented } from "../unimplemented";

type GoogleAuthClient = NonNullable<calendar_v3.Options["auth"]>;

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface GoogleClientOptions {
  readonly fetch: FetchImplementation;
  readonly auth: GoogleAuthClient;
  readonly timeoutMs: number;
}

const createGoogleClient = (options: GoogleClientOptions): calendar_v3.Calendar =>
  unimplemented(options);

export { createGoogleClient };
export type { FetchImplementation, GoogleAuthClient, GoogleClientOptions };
