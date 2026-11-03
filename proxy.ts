import { NextResponse, type NextRequest } from "next/server";

/** The site is being reworked: every page path lands on the work-in-progress page at `/`. */
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  // everything but `/` itself, the API, Next's own assets and files with an extension (models, images, the Draco decoder)
  matcher: ["/((?!api/|_next/|.*\\..*).+)"],
};
