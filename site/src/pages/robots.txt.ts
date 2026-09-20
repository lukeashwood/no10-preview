import type { APIRoute } from 'astro';
// A preview build tells search engines to stay away; the launched site welcomes them.
export const GET: APIRoute = () => new Response(import.meta.env.PUBLIC_PREVIEW === '1' ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } });
