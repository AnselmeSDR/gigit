import type { IncomingMessage, ServerResponse } from "node:http"

export declare function createApi(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => Promise<void>
