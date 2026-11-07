'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export async function register(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/register?error=Data+tidak+valid.+Password+minimal+8+karakter.');
  const { name, email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error || !data.user) redirect('/register?error=Pendaftaran+gagal.+Coba+email+lain.');

  await db.insert(users).values({ id: data.user.id, email, name }).onConflictDoNothing();

  if (!data.session) redirect('/login?info=Cek+email+untuk+konfirmasi+akun.');
  redirect('/dashboard');
}
