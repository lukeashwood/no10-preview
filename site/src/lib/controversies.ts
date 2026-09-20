import disputes from '../data/disputes.json';
import { UK_DISPUTES } from './disputes-uk';

export interface Src { title: string; url: string }
/** One strand of a disputed policy: what is claimed, by whom, and what the record shows. */
export interface Point { heading: string; standing: 'established' | 'contested' | 'unverified'; body: string; sources: Src[] }
export interface Controversy {
  id: string; featured?: boolean; date: string; type: 'policy' | 'conduct'; category: string; title: string; minister: string; portfolio: string;
  summary: string; response: string; outcome: string; status: 'ongoing' | 'resolved' | 'no-finding';
  points?: Point[]; figures?: { label: string; value: string; note: string }[]; sources: Src[]; verified_on: string;
}

export const CONTROVERSIES: Controversy[] = [...UK_DISPUTES, ...(disputes.items as Controversy[])].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || b.date.localeCompare(a.date));
export const STATUS_LABEL = { ongoing: 'Ongoing', resolved: 'Resolved', 'no-finding': 'No inquiry or finding' } as const;
export const TYPE_LABEL = { policy: 'Policy or decision in dispute', conduct: 'Ministerial conduct' } as const;
export const STANDING_LABEL = { established: 'Established', contested: 'Contested', unverified: 'Not supported by the record' } as const;
