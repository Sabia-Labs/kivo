import { NextResponse } from 'next/server';

export async function GET() {
  const siteUrl = 
    process.env.SITE_URL || 
    process.env.ADMIN_WEB_URL || 
    process.env.NEXT_PUBLIC_ADMIN_WEB_URL || 
    process.env.NEXT_PUBLIC_SITE_URL || 
    "";
  
  if (!siteUrl) {
    console.error("[redirect-login] Error: Redirect URL is not defined");
    return NextResponse.json({ error: "Missing redirect URL" }, { status: 500 });
  }
  return NextResponse.redirect(`${siteUrl}?logout=true`);
}
