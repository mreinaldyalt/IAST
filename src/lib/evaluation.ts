/**
 * Evaluation module: compare predictions vs ground truth.
 */
import fs from 'fs';
import path from 'path';

interface GroundTruthEntry {
  year: number;
  ramadan1: string; // YYYY-MM-DD
  source?: string;
}

export interface EvaluationItem {
  year: number;
  predicted: string | null;
  actual: string;
  status: 'OK' | 'FAIL' | 'SKIPPED';
  note?: string;
}

export interface EvaluationSummary {
  items: EvaluationItem[];
  totalOk: number;
  totalFail: number;
  totalSkipped: number;
  accuracy: string;
}

export function loadGroundTruth(): GroundTruthEntry[] {
  const filePath = path.join(process.cwd(), 'data', 'ground_truth_muhammadiyah.json');
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as GroundTruthEntry[];
}

export function evaluate(
  predictions: Map<number, string>,
  groundTruth?: GroundTruthEntry[]
): EvaluationSummary {
  const gt = groundTruth || loadGroundTruth();
  const items: EvaluationItem[] = [];

  for (const entry of gt) {
    const pred = predictions.get(entry.year);
    if (!pred) {
      items.push({
        year: entry.year,
        predicted: null,
        actual: entry.ramadan1,
        status: 'SKIPPED',
        note: 'No prediction available for this year',
      });
      continue;
    }

    if (pred === entry.ramadan1) {
      items.push({
        year: entry.year,
        predicted: pred,
        actual: entry.ramadan1,
        status: 'OK',
      });
    } else {
      items.push({
        year: entry.year,
        predicted: pred,
        actual: entry.ramadan1,
        status: 'FAIL',
        note: `Predicted ${pred} vs actual ${entry.ramadan1}`,
      });
    }
  }

  const totalOk = items.filter((i) => i.status === 'OK').length;
  const totalFail = items.filter((i) => i.status === 'FAIL').length;
  const totalSkipped = items.filter((i) => i.status === 'SKIPPED').length;
  const evaluated = totalOk + totalFail;
  const accuracy = evaluated > 0 ? `${((totalOk / evaluated) * 100).toFixed(1)}%` : 'N/A';

  return { items, totalOk, totalFail, totalSkipped, accuracy };
}
