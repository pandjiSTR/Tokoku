'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { rateGuard, TOO_MANY } from '@/lib/rate-limit';

export async function login(formData: FormData) {
  if (!(await rateGuard('login', 10, 600)).ok) redirect(`/login?error=${encodeURIComponent(TOO_MANY)}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (error) redirect('/login?error=Email+atau+password+salah.');
  redirect('/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
