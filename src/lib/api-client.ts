/**
 * Cliente de API (browser-safe) que aponta para o backend NestJS.
 * - Usa NEXT_PUBLIC_BACKEND_URL (build-time) e cookies via `credentials: include`.
 *
 * Para chamadas a partir de React Server Components, use `@/lib/server-api`.
 */

export const PUBLIC_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080/api";

/**
 * `apiFetch` — drop-in replacement de `fetch` para chamadas autenticadas no
 * browser. Mantém a mesma assinatura/retorno de `fetch` (devolve `Response`)
 * para minimizar refactor em código existente.
 *
 * Uso:
 *   const res = await apiFetch("/drawings", { method: "POST", body: ... });
 *   if (!res.ok) ...
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${PUBLIC_BACKEND_URL}${path}`;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type") && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
}
