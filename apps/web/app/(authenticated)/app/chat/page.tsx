import { redirect } from 'next/navigation';

/** Chat oculto na UI por hora — backend intacto. Remova o redirect para reativar. */
export default function ChatPage() {
  redirect('/app');
}
