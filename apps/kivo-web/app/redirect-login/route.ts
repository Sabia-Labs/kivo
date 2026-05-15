import { NextResponse } from 'next/server';

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
  
  if (!siteUrl) {
    console.error("[redirect-login] Error: SITE_URL is not defined");
    return NextResponse.json({ error: "Missing SITE_URL" }, { status: 500 });
  }
  return NextResponse.redirect(`${siteUrl}?logout=true`);
}
