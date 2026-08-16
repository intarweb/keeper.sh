import type { DecodedGoogleError } from "./classify";
import { unimplemented } from "../unimplemented";

const decodeGaxiosError = (error: unknown): DecodedGoogleError => unimplemented(error);

export { decodeGaxiosError };
