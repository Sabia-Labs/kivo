import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Try to read runtime env variables (dynamically at request-time)
  let siteUrl = 
    process.env.SITE_URL || 
    process.env.ADMIN_WEB_URL || 
    "";
  
  // 2. If not defined, try to construct it dynamically from the request headers
  if (!siteUrl) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https"; // Default to secure in production
    
    if (host) {
      if (host.includes("kivo.sabialabs.de")) {
        siteUrl = `https://auth.sabialabs.de`;
      } else if (host.includes("app.kivo-staging.34-141-70-109.nip.io")) {
        siteUrl = `https://www.kivo-staging.34-141-70-109.nip.io`;
      } else if (host.includes("sabialabs.de")) {
        siteUrl = `https://auth.sabialabs.de`;
      } else if (host.includes("kivo.localhost")) {
        siteUrl = `http://auth.localhost`;
      } else if (host.includes("localhost:3000")) {
        siteUrl = `http://localhost:3001`;
      } else if (host.startsWith("kivo.")) {
        siteUrl = `${proto}://${host.replace(/^kivo\./, "auth.")}`;
      } else if (host.startsWith("app.")) {
        siteUrl = `${proto}://${host.replace(/^app\./, "www.")}`;
      }
    }
  }
  
  // 3. Last-resort fallback to baked build-time variables
  if (!siteUrl) {
    siteUrl = 
      process.env.NEXT_PUBLIC_ADMIN_WEB_URL || 
      process.env.NEXT_PUBLIC_SITE_URL || 
      "";
  }
  
  if (!siteUrl) {
    console.error("[redirect-login] Error: Redirect URL is not defined");
    return NextResponse.json({ error: "Missing redirect URL" }, { status: 500 });
  }
  
  return NextResponse.redirect(`${siteUrl}?logout=true`);
}
