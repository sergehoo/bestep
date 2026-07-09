/**
 * LearnerMessagesPage.tsx — Placeholder messagerie (R12.5).
 * Feature complète en R13 (WebSockets + modèle Message + threads).
 */
import { MessageSquare, Sparkles } from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';

export default function LearnerMessagesPage() {
  return (
    <LearnerShell
      title="Messages"
      subtitle="Discutez avec vos formateurs et le support."
    >
      <Card>
        <CardBody className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-600 mx-auto flex items-center justify-center">
            <MessageSquare className="w-8 h-8" />
          </div>
          <p className="mt-4 text-lg font-bold text-neutral-900">
            Messagerie bientôt disponible
          </p>
          <p className="mt-1 text-sm text-neutral-500 max-w-md mx-auto">
            La messagerie temps réel (formateurs, support, groupes) arrivera
            avec la prochaine mise à jour backend (R13).
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-primary-600 font-semibold">
            <Sparkles className="w-3 h-3" />
            En cours de préparation
          </div>
        </CardBody>
      </Card>
    </LearnerShell>
  );
}
