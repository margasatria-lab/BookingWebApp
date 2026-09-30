import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: real authorization happens in the data access layer (src/lib/dal.ts).
export function proxy(req: NextRequest) {
  if (!req.cookies.get("sid")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/platform/:path*"] };
