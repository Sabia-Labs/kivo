import { NextResponse } from 'next/server';

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://www.178.104.138.63.sslip.io";
  return NextResponse.redirect(`${siteUrl}?logout=true`);
}
