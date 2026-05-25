// Phase 5 T2 — provider catalog (display metadata only).
// Order here is the render order on the Settings → Connectors page.
// Google Calendar is first because it is the first intended OAuth target
// in Phase 5 T3 — read-only tool access without email write scopes.

import type { ConnectorProvider } from './types';

export type ConnectorPhase = 'planned-t3' | 'planned-later';

export type ConnectorCatalogEntry = {
  provider: ConnectorProvider;
  name: string;
  summary: string;
  plannedScopes: string[];
  phase: ConnectorPhase;
  /**
   * Note shown under the action button. Honest about what the action does
   * right now — no claims of liveness. T3 wires the Google Calendar handler.
   */
  actionNote: string;
};

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    summary: 'Read upcoming events to ground scheduling-aware agent runs.',
    plannedScopes: ['View your calendars and events (read-only)'],
    phase: 'planned-t3',
    actionNote: 'Read-only Calendar scope. Tokens stored server-side only. No event ingest or writes.',
  },
  {
    provider: 'google_drive',
    name: 'Google Drive',
    summary: 'Read referenced documents and folders as briefing context.',
    plannedScopes: ['View files you select (read-only, file picker)'],
    phase: 'planned-later',
    actionNote: 'Planned after Calendar. No OAuth handler yet.',
  },
  {
    provider: 'gmail',
    name: 'Gmail',
    summary: 'Summarize and search threads. No automated sending in Phase 5.',
    plannedScopes: ['View messages and metadata (read-only)'],
    phase: 'planned-later',
    actionNote: 'Read-only scope only. Sending is not on the Phase 5 roadmap.',
  },
  {
    provider: 'google_sheets',
    name: 'Google Sheets',
    summary: 'Read structured tables as inputs for agent workflows.',
    plannedScopes: ['View spreadsheets you select (read-only)'],
    phase: 'planned-later',
    actionNote: 'Planned after Calendar and Drive. No OAuth handler yet.',
  },
  {
    provider: 'slack',
    name: 'Slack',
    summary: 'Read channel context. No automated posting in Phase 5.',
    plannedScopes: ['Read channel history you authorize (read-only)'],
    phase: 'planned-later',
    actionNote: 'Read-only scope only. Posting is not on the Phase 5 roadmap.',
  },
  {
    provider: 'notion',
    name: 'Notion',
    summary: 'Read pages and databases you share with the integration.',
    plannedScopes: ['Read shared pages and databases (read-only)'],
    phase: 'planned-later',
    actionNote: 'Planned after Calendar. No OAuth handler yet.',
  },
];
