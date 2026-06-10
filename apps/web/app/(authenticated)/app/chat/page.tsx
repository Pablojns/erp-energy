import { OperationalCard } from '@/src/components/ui/operational-card';
import { TaskCard } from '@/src/components/ui/task-card';
import { StatusBadge } from '@/src/components/ui/status-badge';

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#121724] p-6">
        <h2 className="text-2xl font-semibold text-zinc-100">Chat Operacional</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Hub interno para mensagens, tarefas e alertas de operacao.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationalCard label="Conversas ativas" value="18" delta="+3" tone="info" />
        <OperationalCard label="Tarefas no chat" value="26" delta="Hoje" tone="warning" />
        <OperationalCard label="Alertas operacionais" value="7" delta="Critico" tone="danger" />
        <OperationalCard label="Notificacoes internas" value="14" delta="Em fluxo" tone="accent" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-[#121724] p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-100">Canal #operacao-expedicao</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-[#0d1320] p-3">
              <p className="text-xs text-zinc-500">10:21 - Pablo</p>
              <p className="mt-1 text-sm text-zinc-200">
                Designar tarefa urgente do pedido 45173654 para conferencia final.
              </p>
              <div className="mt-2">
                <StatusBadge label="Urgente" tone="danger" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0d1320] p-3">
              <p className="text-xs text-zinc-500">10:28 - Larissa</p>
              <p className="mt-1 text-sm text-zinc-200">
                Etiqueta gerada e romaneio atualizado para rota SP Capital.
              </p>
            </div>
          </div>
        </article>

        <div className="space-y-3">
          <TaskCard
            title="Atribuir prioridade ao pedido 45173654"
            owner="Pablo"
            due="Agora"
            priority="critical"
          />
          <TaskCard
            title="Validar comprovante transportadora"
            owner="Ana"
            due="Hoje 15:00"
            priority="high"
          />
        </div>
      </section>
    </div>
  );
}
