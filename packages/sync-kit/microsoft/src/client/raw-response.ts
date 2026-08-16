import { unimplemented } from "../unimplemented";

type ReadBody =
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "empty" };

interface HeldResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: ReadBody;
}

const holdResponse = (response: Response): Promise<HeldResponse> => unimplemented(response);

const discardResponse = (response: Response): Promise<void> => unimplemented(response);

export { discardResponse, holdResponse };
export type { HeldResponse, ReadBody };
