import type { KeeperAuthClient } from "@/auth/auth-client";
import {
  createKeeperApiClient,
  type KeeperApiClient,
} from "@keeper.sh/api-client";

export class MobileApi {
  readonly client: KeeperApiClient;

  constructor(
    readonly baseUrl: string,
    private readonly auth: KeeperAuthClient,
  ) {
    this.client = createKeeperApiClient({
      baseUrl,
      authTransport: (request) => {
        const headers = new Headers(request.headers);
        const cookie = this.auth.getCookie();
        if (cookie) headers.set("Cookie", cookie);
        return new Request(request, { headers });
      },
    });
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const body =
      typeof init.body === "string"
        ? (JSON.parse(init.body) as unknown)
        : init.body;
    return this.client.request<T>(path, {
      body,
      headers: init.headers,
      method: (init.method ?? "GET") as
        | "GET"
        | "POST"
        | "PUT"
        | "PATCH"
        | "DELETE",
      signal: init.signal ?? undefined,
    });
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body == null ? undefined : JSON.stringify(body),
    });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: body == null ? undefined : JSON.stringify(body),
    });
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  delete<T = void>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "DELETE",
      body: body == null ? undefined : JSON.stringify(body),
    });
  }
}
