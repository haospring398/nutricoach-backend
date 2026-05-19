import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { getTableColumns, sql } from 'drizzle-orm';
import { db, pool } from '../../config/db';
import {
  foodItems,
  type NewFoodItem,
} from '../../models/food-item.model';

type CompletenessTier = 'FULL' | 'PARTIAL' | 'CALORIES_ONLY';
type FoodType = 'INGREDIENT' | 'DISH';

interface CsvRow {
  ID: string;
  Description?: string;
  Description_VN?: string;
  Category?: string;
  Calories?: string;
  Protein?: string;
  TotalFat?: string;
  Carbohydrate?: string;
  Sugar?: string;
  Calcium?: string;
  Iron?: string;
  Sodium?: string;
  Potassium?: string;
  VitaminA?: string;
  VitaminC?: string;
  [extra: string]: string | undefined;
}

const MICRONUTRIENT_KEY_MAP: Record<string, string> = {
  Zinc: 'zincMg',
  Copper: 'copperMg',
  Manganese: 'manganeseMg',
  Selenium: 'seleniumMg',
  Retinol: 'retinolMg',
  BetaCarotene: 'betaCaroteneMg',
  VitaminD: 'vitaminDMg',
  VitaminE: 'vitaminEMg',
  VitaminK: 'vitaminKMg',
  VitaminB1: 'vitaminB1Mg',
  VitaminB2: 'vitaminB2Mg',
  VitaminB3: 'vitaminB3Mg',
  VitaminB5: 'vitaminB5Mg',
  VitaminB6: 'vitaminB6Mg',
  Folate: 'folateMg',
  SaturatedFat: 'saturatedFatG',
  MonounsaturatedFat: 'monounsaturatedFatG',
  PolyunsaturatedFat: 'polyunsaturatedFatG',
  Tryptophan: 'tryptophanMg',
  Threonine: 'threonineMg',
  Isoleucine: 'isoleucineMg',
  Leucine: 'leucineMg',
  Lysine: 'lysineMg',
  Methionine: 'methionineMg',
  Cystine: 'cystineMg',
  Phenylalanine: 'phenylalanineMg',
  Tyrosine: 'tyrosineMg',
  Valine: 'valineMg',
  Arginine: 'arginineMg',
  Histidine: 'histidineMg',
  Alanine: 'alanineMg',
  AsparticAcid: 'asparticAcidMg',
  GlutamicAcid: 'glutamicAcidMg',
  Glycine: 'glycineMg',
  Proline: 'prolineMg',
  Serine: 'serineMg',
};

const parseNumOrNull = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === '' || s === '-' || s.toLowerCase() === 'na') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const toNumericString = (n: number | null): string | null =>
  n === null ? null : n.toString();

const buildMicronutrients = (
  row: CsvRow,
): Record<string, number> | null => {
  const obj: Record<string, number> = {};
  for (const [csvKey, jsonKey] of Object.entries(MICRONUTRIENT_KEY_MAP)) {
    const v = parseNumOrNull(row[csvKey]);
    if (v !== null) obj[jsonKey] = v;
  }
  return Object.keys(obj).length === 0 ? null : obj;
};

const completenessFor = (
  calories: number,
  protein: number | null,
  fat: number | null,
  carb: number | null,
): CompletenessTier => {
  if (protein !== null && fat !== null && carb !== null) return 'FULL';
  if (protein === null && fat === null && carb === null) return 'CALORIES_ONLY';
  return 'PARTIAL';
};

interface SeedAggregate {
  rows: NewFoodItem[];
  skipped: number;
  completeness: Record<CompletenessTier, number>;
  byType: Record<FoodType, number>;
}

const readCsv = (file: string): CsvRow[] => {
  const text = fs.readFileSync(file, 'utf8');
  return parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
};

const buildBatch = (csvRows: CsvRow[], type: FoodType): SeedAggregate => {
  const agg: SeedAggregate = {
    rows: [],
    skipped: 0,
    completeness: { FULL: 0, PARTIAL: 0, CALORIES_ONLY: 0 },
    byType: { INGREDIENT: 0, DISH: 0 },
  };

  for (const row of csvRows) {
    const externalId = (row.ID ?? '').trim();
    if (!externalId) {
      agg.skipped++;
      continue;
    }

    const calories = parseNumOrNull(row.Calories);
    if (calories === null) {
      console.warn(`[seed] skipping ${externalId}: missing calories`);
      agg.skipped++;
      continue;
    }

    const protein = parseNumOrNull(row.Protein);
    const totalFat = parseNumOrNull(row.TotalFat);
    const carb = parseNumOrNull(row.Carbohydrate);
    const sugar = parseNumOrNull(row.Sugar);

    const calcium = parseNumOrNull(row.Calcium);
    const iron = parseNumOrNull(row.Iron);
    const sodium = parseNumOrNull(row.Sodium);
    const potassium = parseNumOrNull(row.Potassium);
    const vitaminC = parseNumOrNull(row.VitaminC);
    const vitaminA = parseNumOrNull(row.VitaminA);

    const tier = completenessFor(calories, protein, totalFat, carb);
    agg.completeness[tier]++;
    agg.byType[type]++;

    agg.rows.push({
      externalId,
      source: 'VN_NIN',
      type,
      nameVi: (row.Description_VN ?? '').trim() || externalId,
      nameEn: (row.Description ?? '').trim() || null,
      category: (row.Category ?? '').trim() || 'Uncategorized',
      caloriesKcal: calories.toString(),
      proteinG: toNumericString(protein),
      totalFatG: toNumericString(totalFat),
      carbohydrateG: toNumericString(carb),
      sugarG: toNumericString(sugar),
      calciumMg: toNumericString(calcium),
      ironMg: toNumericString(iron),
      sodiumMg: toNumericString(sodium),
      potassiumMg: toNumericString(potassium),
      vitaminCMg: toNumericString(vitaminC),
      vitaminAIu: toNumericString(vitaminA),
      micronutrients: buildMicronutrients(row),
      dataCompleteness: tier,
      isVerified: true,
    });
  }

  return agg;
};

const buildUpsertSet = () => {
  const cols = getTableColumns(foodItems);
  const skip = new Set(['id', 'externalId', 'createdAt']);
  const out: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [tsKey, col] of Object.entries(cols)) {
    if (skip.has(tsKey)) continue;
    out[tsKey] = sql.raw(`excluded."${col.name}"`);
  }
  return out;
};

const BATCH_SIZE = 200;

// Keep the LAST occurrence of each externalId (same intent as
// `arr.findLastIndex(...) === idx` but compatible with ES2022 lib).
const dedupeByExternalId = (rows: NewFoodItem[]): NewFoodItem[] => {
  const map = new Map<string, NewFoodItem>();
  for (const row of rows) map.set(row.externalId, row);
  return Array.from(map.values());
};

const main = async (): Promise<void> => {
  const seedDir = path.resolve('data/seed');
  const ingredientsCsv = path.join(seedDir, 'vn_food.csv');
  const dishesCsv = path.join(seedDir, 'vn_dishes.csv');

  console.log(`[seed] reading ${ingredientsCsv}`);
  const ingredientsRows = readCsv(ingredientsCsv);
  console.log(`[seed] ${ingredientsRows.length} ingredient rows from CSV`);

  console.log(`[seed] reading ${dishesCsv}`);
  const dishesRows = readCsv(dishesCsv);
  console.log(`[seed] ${dishesRows.length} dish rows from CSV`);

  const ingredients = buildBatch(ingredientsRows, 'INGREDIENT');
  const dishes = buildBatch(dishesRows, 'DISH');

  const combinedRows = [...ingredients.rows, ...dishes.rows];
  const allRows = dedupeByExternalId(combinedRows);
  const duplicatesRemoved = combinedRows.length - allRows.length;
  console.log(
    `[seed] Removed ${duplicatesRemoved} duplicate externalIds before insert`,
  );
  console.log(`[seed] upserting ${allRows.length} rows in batches of ${BATCH_SIZE}...`);

  await db.transaction(async (tx) => {
    const setOnConflict = buildUpsertSet();
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const slice = allRows.slice(i, i + BATCH_SIZE);
      // Per-batch dedupe is redundant after the global pass above but kept
      // as a safety net so a future code change can't reintroduce the
      // "ON CONFLICT DO UPDATE cannot affect row a second time" error.
      const deduped = dedupeByExternalId(slice);
      await tx
        .insert(foodItems)
        .values(deduped)
        .onConflictDoUpdate({
          target: foodItems.externalId,
          set: setOnConflict,
        });
    }
  });

  const totals = {
    FULL: ingredients.completeness.FULL + dishes.completeness.FULL,
    PARTIAL: ingredients.completeness.PARTIAL + dishes.completeness.PARTIAL,
    CALORIES_ONLY:
      ingredients.completeness.CALORIES_ONLY +
      dishes.completeness.CALORIES_ONLY,
  };

  console.log(
    `[seed] Seeded ${ingredients.byType.INGREDIENT} ingredients, ${dishes.byType.DISH} dishes. ` +
      `Skipped ${ingredients.skipped + dishes.skipped} rows (missing calories). ` +
      `Completeness: ${totals.FULL} FULL / ${totals.PARTIAL} PARTIAL / ${totals.CALORIES_ONLY} CALORIES_ONLY.`,
  );
};

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] FAILED:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
