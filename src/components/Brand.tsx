import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      <span className="brand-mark" aria-hidden="true">T</span>
      Tokoku
    </Link>
  );
}
