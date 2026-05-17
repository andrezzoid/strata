type RequestContext = { httpVersion: string };
type ResponseHeaders = Record<string, string>;
type Body = string;
type Size = "sm" | "lg";
type Position = "center" | "top";
declare const req: RequestContext;
declare const body: Body;

export function createHttpResponse(request: RequestContext, version: string, status: number, headers: ResponseHeaders, body: Body) {}

createHttpResponse(req, "HTTP/1.1", 200, {}, body);
createHttpResponse(req, "HTTP/1.1", 404, {}, body);
createHttpResponse(req, "HTTP/1.1", 201, {}, body);
createHttpResponse(req, "HTTP/1.1", 500, {}, body);

export function openModal(title: string, size?: Size, position?: Position, autofocus?: boolean) {}

openModal("Delete account", undefined, undefined, true);
