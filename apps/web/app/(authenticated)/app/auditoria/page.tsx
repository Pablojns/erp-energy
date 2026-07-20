import { redirect } from 'next/navigation';

/** Auditoria oculta na UI — dados no banco intactos. Remova o redirect para reativar. */
export default function AuditoriaPage() {
  redirect('/app');
}
