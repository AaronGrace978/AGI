export interface SoulStatusView {
  name: string;
  emotion: string;
  presence: string;
  totalInteractions: number;
}

export function soulStatusFromConsciousness(
  consciousness?: {
    name?: string;
    presence?: string;
    totalInteractions?: number;
    soulFrame?: { currentEmotion?: string } | null;
  } | null,
): SoulStatusView {
  return {
    name: consciousness?.name || 'AGI PRIME',
    emotion: consciousness?.soulFrame?.currentEmotion || '—',
    presence: consciousness?.presence || '—',
    totalInteractions: Number.isFinite(consciousness?.totalInteractions) ? Number(consciousness?.totalInteractions) : 0,
  };
}
