import type { WorldEntity, WorldModel, WorldRelation } from '../types';

const DEFAULT_ACTIVE_ENTITY_LIMIT = 800;
const DEFAULT_ACTIVE_RELATION_LIMIT = 3000;
const DEFAULT_ARCHIVE_ENTITY_LIMIT = 5000;
const DEFAULT_ARCHIVE_RELATION_LIMIT = 20000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function relationKey(rel: WorldRelation): string {
  return `${rel.source}|${rel.target}|${rel.type}|${rel.evidence.slice(0, 80)}`;
}

function sortByRetentionPriority<T extends { confidence?: number; salience?: number; lastReferenced?: number; timestamp?: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const aScore = (a.confidence ?? 0.5) * 0.6 + (a.salience ?? 0.4) * 0.4;
    const bScore = (b.confidence ?? 0.5) * 0.6 + (b.salience ?? 0.4) * 0.4;
    if (aScore !== bScore) return bScore - aScore;
    const aTime = a.lastReferenced ?? a.timestamp ?? 0;
    const bTime = b.lastReferenced ?? b.timestamp ?? 0;
    return bTime - aTime;
  });
}

function dedupeEntities(entities: WorldEntity[]): WorldEntity[] {
  const byName = new Map<string, WorldEntity>();
  for (const entity of entities) {
    const key = entity.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, entity);
      continue;
    }

    const chooseIncoming =
      entity.confidence > existing.confidence ||
      (entity.confidence === existing.confidence && entity.lastReferenced > existing.lastReferenced);
    if (chooseIncoming) {
      byName.set(key, {
        ...entity,
        firstSeen: Math.min(entity.firstSeen, existing.firstSeen),
      });
    } else {
      byName.set(key, {
        ...existing,
        lastReferenced: Math.max(existing.lastReferenced, entity.lastReferenced),
        salience: Math.max(existing.salience, entity.salience),
      });
    }
  }
  return [...byName.values()];
}

function dedupeRelations(relations: WorldRelation[]): WorldRelation[] {
  const byKey = new Map<string, WorldRelation>();
  for (const rel of relations) {
    const key = relationKey(rel);
    const existing = byKey.get(key);
    if (!existing || rel.timestamp > existing.timestamp) {
      byKey.set(key, rel);
    }
  }
  return [...byKey.values()];
}

export function normalizeWorldModel(input: WorldModel): WorldModel {
  return {
    entities: input.entities ?? [],
    relations: input.relations ?? [],
    archivedEntities: input.archivedEntities ?? [],
    archivedRelations: input.archivedRelations ?? [],
    maxActiveEntities: input.maxActiveEntities ?? DEFAULT_ACTIVE_ENTITY_LIMIT,
    maxActiveRelations: input.maxActiveRelations ?? DEFAULT_ACTIVE_RELATION_LIMIT,
    lastUpdated: input.lastUpdated ?? 0,
  };
}

export function mergeWorldModelIncremental(params: {
  current: WorldModel;
  incomingEntities: WorldEntity[];
  incomingRelations: WorldRelation[];
}): WorldModel {
  const current = normalizeWorldModel(params.current);
  const maxActiveEntities = Math.max(200, current.maxActiveEntities || DEFAULT_ACTIVE_ENTITY_LIMIT);
  const maxActiveRelations = Math.max(500, current.maxActiveRelations || DEFAULT_ACTIVE_RELATION_LIMIT);

  const mergedEntities = dedupeEntities([...current.entities, ...params.incomingEntities]);
  const mergedRelations = dedupeRelations([...current.relations, ...params.incomingRelations]);

  const sortedEntities = sortByRetentionPriority(mergedEntities);
  const sortedRelations = sortByRetentionPriority(mergedRelations);

  const activeEntities = sortedEntities.slice(0, maxActiveEntities);
  const archivedEntities = sortByRetentionPriority([
    ...(current.archivedEntities ?? []),
    ...sortedEntities.slice(maxActiveEntities),
  ]).slice(0, DEFAULT_ARCHIVE_ENTITY_LIMIT);

  const activeEntityIds = new Set(activeEntities.map((e) => e.id));
  const constrainedRelations = sortedRelations.filter(
    (r) => activeEntityIds.has(r.source) && activeEntityIds.has(r.target),
  );
  const overflowRelations = sortedRelations.filter(
    (r) => !activeEntityIds.has(r.source) || !activeEntityIds.has(r.target),
  );
  const activeRelations = constrainedRelations.slice(0, maxActiveRelations);
  const archivedRelations = sortByRetentionPriority([
    ...(current.archivedRelations ?? []),
    ...constrainedRelations.slice(maxActiveRelations),
    ...overflowRelations,
  ]).slice(0, DEFAULT_ARCHIVE_RELATION_LIMIT);

  return {
    entities: activeEntities,
    relations: activeRelations,
    archivedEntities,
    archivedRelations,
    maxActiveEntities,
    maxActiveRelations,
    lastUpdated: Date.now(),
  };
}

export function decayWorldModelConfidence(model: WorldModel, now: number = Date.now()): WorldModel {
  const world = normalizeWorldModel(model);
  const entities = world.entities.map((entity) => {
    const ageMs = Math.max(0, now - (entity.lastReferenced || entity.firstSeen || now));
    const ageHours = ageMs / 3_600_000;
    const decay = Math.exp(-ageHours / 48);
    return {
      ...entity,
      confidence: clamp01(entity.confidence * 0.95 + entity.confidence * 0.05 * decay),
      salience: Math.max(0.04, entity.salience * (0.985 + 0.015 * decay)),
    };
  });

  const relations = world.relations.map((relation) => {
    const ageMs = Math.max(0, now - relation.timestamp);
    const ageHours = ageMs / 3_600_000;
    const decay = Math.exp(-ageHours / 72);
    return {
      ...relation,
      strength: clamp01(relation.strength * 0.96 + relation.strength * 0.04 * decay),
    };
  });

  return { ...world, entities, relations, lastUpdated: now };
}
