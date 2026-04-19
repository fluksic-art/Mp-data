import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "mpg_admin_session";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

async function verifyToken(cookie: string, secret: string): Promise<boolean> {
  const lastDot = cookie.lastIndexOf(".");
  if (lastDot === -1) return false;

  const token = cookie.slice(0, lastDot);
  const signature = cookie.slice(lastDot + 1);
  const expected = await hmacSha256(secret, token);

  if (signature.length !== expected.length) return false;
  const a = hexToBytes(signature);
  const b = hexToBytes(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie || !(await verifyToken(cookie, secret))) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
