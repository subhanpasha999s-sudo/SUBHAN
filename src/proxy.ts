import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ADMIN_HOSTS = new Set(["admin.tulmin.com"]);
const PUBLIC_APP_HOSTS = new Set(["app.tulmin.com", "www.tulmin.com", "tulmin.com"]);

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
}

export function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_ADMIN_HOSTS.has(hostname) && pathname === "/") {
    return NextResponse.redirect(new URL("/admin/blogs", request.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/export-labels", request.url));
  }

  if (
    pathname.startsWith("/admin") &&
    PUBLIC_APP_HOSTS.has(hostname) &&
    !isLocalHost(hostname)
  ) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/"],
};
