import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/db';
import { cache } from '../config/redis';
import { foodItems, type FoodItem } from '../models/food-item.model';
import { ApiError } from '../lib/api-error';
import type {
  FoodsSearchQuery,
  FoodsCategoriesQuery,
} from '../validations/foods.validation';

export class FoodsError extends ApiError {}

type FoodType = 'INGREDIENT' | 'DISH';
type Completeness = 'FULL' | 'PARTIAL' | 'CALORIES_ONLY';

interface SearchPer100g {
  calories: number;
  proteinG: number | null;
  totalFatG: number | null;
  carbohydrateG: number | null;
  sugarG: number | null;
}

export interface FoodSearchHit {
  id: string;
  externalId: string;
  type: FoodType;
  nameVi: string;
  nameEn: string | null;
  category: string;
  per100g: SearchPer100g;
  dataCompleteness: Completeness;
  isVerified: boolean;
}

export interface FoodSearchResult {
  items: FoodSearchHit[];
  totalItems: number;
}

interface DetailPer100g extends SearchPer100g {
  calciumMg: number | null;
  ironMg: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  vitaminCMg: number | null;
  vitaminAIu: number | null;
  micronutrients: Record<string, number> | null;
}

export interface FoodDetail {
  id: string;
  externalId: string;
  source: string;
  type: FoodType;
  nameVi: string;
  nameEn: string | null;
  category: string;
  per100g: DetailPer100g;
  dataCompleteness: Completeness;
  isVerified: boolean;
  createdAt: Date;
}

export interface CategoryRow {
  name: string;
  type: FoodType;
  count: number;
}

const num = (v: string | null): number | null =>
  v === null ? null : Number(v);

const mapHit = (row: FoodItem): FoodSearchHit => ({
  id: row.id,
  externalId: row.externalId,
  type: row.type,
  nameVi: row.nameVi,
  nameEn: row.nameEn,
  category: row.category,
  per100g: {
    calories: Number(row.caloriesKcal),
    proteinG: num(row.proteinG),
    totalFatG: num(row.totalFatG),
    carbohydrateG: num(row.carbohydrateG),
    sugarG: num(row.sugarG),
  },
  dataCompleteness: row.dataCompleteness,
  isVerified: row.isVerified,
});

const mapDetail = (row: FoodItem): FoodDetail => ({
  id: row.id,
  externalId: row.externalId,
  source: row.source,
  type: row.type,
  nameVi: row.nameVi,
  nameEn: row.nameEn,
  category: row.category,
  per100g: {
    calories: Number(row.caloriesKcal),
    proteinG: num(row.proteinG),
    totalFatG: num(row.totalFatG),
    carbohydrateG: num(row.carbohydrateG),
    sugarG: num(row.sugarG),
    calciumMg: num(row.calciumMg),
    ironMg: num(row.ironMg),
    sodiumMg: num(row.sodiumMg),
    potassiumMg: num(row.potassiumMg),
    vitaminCMg: num(row.vitaminCMg),
    vitaminAIu: num(row.vitaminAIu),
    micronutrients:
      (row.micronutrients as Record<string, number> | null) ?? null,
  },
  dataCompleteness: row.dataCompleteness,
  isVerified: row.isVerified,
  createdAt: row.createdAt,
});

export const searchFoods = async (
  query: FoodsSearchQuery,
): Promise<FoodSearchResult> => {
  const q = query.q;
  const offset = (query.page - 1) * query.limit;

  const matches: SQL = sql`(
    similarity(${foodItems.nameVi}, ${q}) > 0.2
    OR similarity(coalesce(${foodItems.nameEn}, ''), ${q}) > 0.2
    OR ${foodItems.nameVi} ILIKE '%' || ${q} || '%'
    OR coalesce(${foodItems.nameEn}, '') ILIKE '%' || ${q} || '%'
  )`;

  const filters: SQL[] = [matches];
  if (query.type) filters.push(eq(foodItems.type, query.type));
  if (query.category) filters.push(eq(foodItems.category, query.category));
  if (query.completeness)
    filters.push(eq(foodItems.dataCompleteness, query.completeness));

  const where = filters.length === 1 ? filters[0] : and(...filters);

  const scoreExpr = sql<number>`GREATEST(
    similarity(${foodItems.nameVi}, ${q}),
    coalesce(similarity(coalesce(${foodItems.nameEn}, ''), ${q}), 0)
  )`;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(foodItems)
      .where(where)
      .orderBy(desc(scoreExpr), asc(foodItems.nameVi))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(foodItems)
      .where(where),
  ]);

  return {
    items: rows.map(mapHit),
    totalItems: countRows[0]?.n ?? 0,
  };
};

export const getFoodById = async (id: string): Promise<FoodDetail> => {
  const [row] = await db
    .select()
    .from(foodItems)
    .where(eq(foodItems.id, id))
    .limit(1);

  if (!row) {
    throw new FoodsError(404, 'FOOD_ITEM_NOT_FOUND', 'Food item not found');
  }

  return mapDetail(row);
};

const CATEGORIES_CACHE_TTL_SECONDS = 3_600;

export const listCategories = async (
  query: FoodsCategoriesQuery,
): Promise<CategoryRow[]> => {
  const cacheKey = `foods:categories:${query.type ?? 'all'}`;
  const cached = await cache.get<CategoryRow[]>(cacheKey);
  if (cached) return cached;

  const baseRows = query.type
    ? await db
        .select({
          name: foodItems.category,
          type: foodItems.type,
          count: sql<number>`count(*)::int`,
        })
        .from(foodItems)
        .where(eq(foodItems.type, query.type))
        .groupBy(foodItems.category, foodItems.type)
        .orderBy(desc(sql`count(*)`))
    : await db
        .select({
          name: foodItems.category,
          type: foodItems.type,
          count: sql<number>`count(*)::int`,
        })
        .from(foodItems)
        .groupBy(foodItems.category, foodItems.type)
        .orderBy(desc(sql`count(*)`));

  const result: CategoryRow[] = baseRows.map((r) => ({
    name: r.name,
    type: r.type,
    count: r.count,
  }));

  await cache.set(cacheKey, result, CATEGORIES_CACHE_TTL_SECONDS);
  return result;
};
