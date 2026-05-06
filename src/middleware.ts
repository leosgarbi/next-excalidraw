import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Tudo é privado por padrão. Páginas públicas:
const PUBLIC_PAGES = ["/login", "/register"];

// /invites/<token> é público (login obrigatório só para o aceite).
function isPublicInvitePreview(pathname: string): boolean {
  return pathname.startsWith("/invites/") && pathname.split("/").length === 3;
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(?:png|jpe?g|gif|svg|ico|webp|css|js|map|woff2?|ttf)$/i.test(pathname)
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isStaticAsset(pathname)) return NextResponse.next();

  const isAuthed = Boolean(req.cookies.get("token")?.value);
  const isPublicPage = PUBLIC_PAGES.includes(pathname);

  if (isAuthed && isPublicPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (isAuthed) return NextResponse.next();

  if (isPublicPage || isPublicInvitePreview(pathname)) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
