import type { FDR } from '../data/types';
import { daysBetween } from './format';

export type LifecycleStatus = 'active' | 'maturing' | 'lapsed' | 'renewed' | 'release-requested' | 'released' | 'closed';

export const MATURING_WINDOW_DAYS = 90;

export interface Lifecycle {
  status: LifecycleStatus;
  daysToMaturity: number;
  renewedById?: string;
}

export function lifecycleOf(f: FDR, all: FDR[], today: string): Lifecycle {
  const daysToMaturity = daysBetween(today, f.maturityDate);
  const renewal = all.find((g) => g.renewedFromId === f.id);
  if (f.closedAt) return { status: 'closed', daysToMaturity };
  if (f.release?.releasedAt) return { status: 'released', daysToMaturity };
  if (renewal) return { status: 'renewed', daysToMaturity, renewedById: renewal.id };
  if (f.release) return { status: 'release-requested', daysToMaturity };
  if (daysToMaturity < 0) return { status: 'lapsed', daysToMaturity };
  if (daysToMaturity <= MATURING_WINDOW_DAYS) return { status: 'maturing', daysToMaturity };
  return { status: 'active', daysToMaturity };
}

/** Deposits AICTE is currently relying on as security. A deposit closed at the bank no longer secures anything. */
export function isHeld(status: LifecycleStatus): boolean {
  return status !== 'released' && status !== 'renewed' && status !== 'closed';
}

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  active: 'Active',
  maturing: 'Maturing soon',
  lapsed: 'Matured, not renewed',
  renewed: 'Renewed',
  'release-requested': 'Release requested',
  released: 'Released',
  closed: 'Closed at bank',
};
