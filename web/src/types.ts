export interface Warning {
  code: 'composition' | 'kbju' | 'category' | 'barcode';
  text: string;
}

export interface Dish {
  id: number;
  name: string;
  artikul: string | null;
  code: string | null;
  type: string | null;
  category: string | null;
  category_source: string;
  unit: string | null;
  price: number | null;
  cost: number | null;
  cost_pct: number | null;
  composition: string | null;
  composition_source: string | null;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  nutrition_source: string | null;
  shelf_life_hours: number | null;
  storage_text: string | null;
  barcode_source: string | null;
  diet_type: 'pp' | 'classic' | null;
  diet_type_auto: 'pp' | 'classic';
  active: boolean;
  barcodeValue: string;
  barcodeSourceEffective: string;
  warnings: Warning[];
}

export type Settings = Record<string, any>;

export interface PrintJob {
  id: number;
  createdAt: string;
  kind: string;
  status: string;
  quantity: number;
  user: string;
  dish?: { id?: number; name?: string; code?: string | null; artikul?: string | null };
  labelDate?: string;
  labelTime?: string;
  approximateTime?: boolean;
  via?: string | null;
  error?: string | null;
  agent?: string;
  finishedAt?: string;
}

export interface LogRow {
  id: number;
  created_at: string;
  level: string;
  context: string;
  message: string;
  detail: string | null;
}

export interface ImportResult {
  batchId: number;
  filename: string | null;
  rows_total: number;
  dishesNew: number;
  dishesUpdated: number;
  dishesTotal: number;
  groupsCount: number;
  groups: { level: number; name: string }[];
  skipped: number;
  noCategoryCount: number;
  uncertainCategoryCount: number;
  _status?: number;
  error?: string;
}

export interface LabelDateTime {
  now: string;
  date: string;
  time: string;
  approximate: boolean;
  ruleId: string;
  config?: any;
}
