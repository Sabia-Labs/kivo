import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '';
  const user = searchParams.get('user') || '';
  const workspaceId = searchParams.get('workspaceId') || '';
  const path = searchParams.get('path') || '/teams';
  const kivoWebUrl = process.env.NEXT_PUBLIC_KIVO_WEB_URL || process.env.KIVO_WEB_URL || "http://localhost:3000";
  
  let url = `${kivoWebUrl}${path}`;
  if (token && user) {
    url += `?token=${token}&user=${user}`;
    if (workspaceId) url += `&workspaceId=${workspaceId}`;
  }
  return NextResponse.redirect(url);
}
