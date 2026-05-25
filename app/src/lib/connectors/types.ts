// Phase 5 T1 — shared connector types.
// Mirrors the check constraints in supabase/migrations/0006_phase5_connectors.sql.
// No provider calls or token handling here.

export const CONNECTOR_PROVIDERS = [
  'google_calendar',
  'google_drive',
  'gmail',
  'google_sheets',
  'slack',
  'notion',
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export const CONNECTOR_STATUSES = [
  'disconnected',
  'connecting',
  'connected',
  'error',
  'revoked',
] as const;

export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTOR_PROVIDER_LABELS: Record<ConnectorProvider, string> = {
  google_calendar: 'Google Calendar',
  google_drive: 'Google Drive',
  gmail: 'Gmail',
  google_sheets: 'Google Sheets',
  slack: 'Slack',
  notion: 'Notion',
};

export const CONNECTOR_STATUS_LABELS: Record<ConnectorStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Error',
  revoked: 'Revoked',
};
