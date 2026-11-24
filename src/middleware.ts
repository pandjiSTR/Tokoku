import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(req: NextRequest) {
  // Pratinjau tema: ?pv= diteruskan ke server sebagai header internal. Header kiriman klien selalu dibuang
  // agar tidak bisa dipalsukan; layout tetap memeriksa bahwa pemintanya anggota toko.
  const headers = new Headers(req.headers);
  headers.delete('x-theme-preview');
  const pv = req.nextUrl.searchParams.get('pv');
  if (pv && pv.length <= 1500 && req.nextUrl.pathname.startsWith('/s/')) headers.set('x-theme-preview', pv);

  let res = NextResponse.next({ request: { headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: { headers } });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
