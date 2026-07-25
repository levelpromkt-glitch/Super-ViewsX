import { ProviderResult } from './types';

export function shouldReplaceTranscript(
  currentCache: { quality_score: number; provider_name: string; provider_version: string },
  incomingResult: ProviderResult,
  incomingPriority: number
): boolean {
  if (!incomingResult.success) return false;

  // Se o novo for de qualidade estritamente maior, substitui.
  if (incomingResult.qualityScore > currentCache.quality_score) {
    return true;
  }

  // Se for da mesma qualidade, desempata pela prioridade do provedor.
  if (incomingResult.qualityScore === currentCache.quality_score) {
    // Para recuperar a prioridade do cache atual, teríamos que importar providerConfig, mas como
    // não temos a prioridade gravada no banco facilmente, assumimos que prioridades maiores são melhores.
    // O mais simples: se for o MESMO provedor e a versão for mais nova (v2 > v1), ou prioridade.
    // Aqui implementamos uma lógica base:
    return false; // Conservador: se mesma qualidade, mantém o que já está salvo e validado.
  }

  return false;
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}
