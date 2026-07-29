import { PricingSection } from "@/components/landing/PricingSection";
import { X } from "lucide-react";

export function PricingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-[#0a0a0b] rounded-3xl border border-white/10 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-50 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
          aria-label="Fechar"
        >
          <X size={24} />
        </button>
        
        {/* Renderiza a PricingSection original, mas com um scale menor para caber bonito na tela */}
        <div className="overflow-y-auto h-full max-h-[90vh] pb-10 custom-scrollbar" style={{ transform: 'scale(0.85)', transformOrigin: 'top center', marginTop: '-20px' }}>
          <PricingSection onOpenAuth={() => {}} />
        </div>
      </div>
    </div>
  );
}
