import { NextResponse } from 'next/server';

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3001";
  return NextResponse.redirect(`${siteUrl}?logout=true`);
}
