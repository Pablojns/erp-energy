/**
 * Margem de venda (%) do orçamento — só a Julia vê/edita.
 * Preferência: NEXT_PUBLIC_QUOTE_MARGIN_USER_EMAIL; fallback nome/e-mail com "julia".
 */
export function canViewQuoteMargin(user: {
  id?: string | null;
  email?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  const configured = (
    process.env.NEXT_PUBLIC_QUOTE_MARGIN_USER_EMAIL ||
    process.env.QUOTE_MARGIN_USER_EMAIL ||
    ''
  )
    .trim()
    .toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  const name = (user.name || '').trim().toLowerCase();
  const id = (user.id || '').trim();

  if (configured) {
    if (email && email === configured) return true;
    if (id && id === configured) return true;
  }

  return email.includes('julia') || name.includes('julia');
}
