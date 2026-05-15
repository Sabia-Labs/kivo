import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const user = searchParams.get('user') || '';
  const workspaceId = searchParams.get('workspaceId') || '';
  const lang = searchParams.get('lang') || '';
  const path = searchParams.get('path') || '/teams';
  const kivoWebUrl = process.env.NEXT_PUBLIC_KIVO_WEB_URL || process.env.KIVO_WEB_URL || "";
  
  if (!kivoWebUrl) {
    console.error("[redirect-app] Error: KIVO_WEB_URL is not defined in environment variables");
    return NextResponse.json({ error: "Configuration error: Missing KIVO_WEB_URL" }, { status: 500 });
  }
  
  let url = `${kivoWebUrl}${path}`;
  const queryParams = new URLSearchParams();
  if (token) queryParams.set('token', token);
  if (user) queryParams.set('user', user);
  if (workspaceId) queryParams.set('workspaceId', workspaceId);
  if (lang) queryParams.set('lang', lang);

  const queryString = queryParams.toString();
  if (queryString) url += `?${queryString}`;
  
  return NextResponse.redirect(url);
}
