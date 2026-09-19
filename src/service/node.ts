import type { IncomingMessage, ServerResponse } from "node:http";

/** Adapt the Web Request handler to Node/Express-compatible request and response objects. */
export function createNodeHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of request)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const origin = `http://${request.headers.host ?? "localhost"}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const method = request.method ?? "GET";
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const webResponse = await handler(
      new Request(new URL(request.url ?? "/", origin), {
        method,
        headers,
        ...(body === undefined || method === "GET" || method === "HEAD" ? {} : { body }),
      }),
    );
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  };
}
