import data from '../data/baseline.json';
import type { Baseline } from './types';
export const baseline = data as unknown as Baseline;
export const recordIndex = new Map(baseline.records.map(r => [r.id, r]));
export const plotIndex = new Map(baseline.plots.map(p => [p.id, p]));
