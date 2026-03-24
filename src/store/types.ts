// ═══════════════════════════════════════════════════════════════
//  Store Slice Types
//  Using loose typing to avoid circular deps between slices and
//  the composed store. Full AGIStore type lives in src/store.ts.
// ═══════════════════════════════════════════════════════════════

export type StoreSet = (partial: Partial<any> | ((state: any) => Partial<any>), replace?: false) => void;
export type StoreGet = () => any;
