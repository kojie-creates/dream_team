// Renderer-side Supabase reads (RLS — the client is authenticated with the user's
// session, rehydrated on launch). The desktop is a data-driven view over the same
// tables the web app surfaces: tickets, trace_events, artifacts, connectors.
import { supabase } from './supabase.ts';

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'needs_input'
  | 'done'
  | 'failed'
  | 'looped';

export interface Ticket {
  id: string;
  title: string | null;
  status: TicketStatus;
  layer: string | null;
  current_agent: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TraceEvent {
  id: number;
  seq: number;
  from_agent: string | null;
  to_agent: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Artifact {
  id: string;
  kind: string;
  mime_type: string | null;
  bytes: number | null;
  created_at: string;
}

export interface Connector {
  provider: string;
  status: string;
  connected_at: string | null;
  last_error: string | null;
}

export async function listTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, title, status, layer, current_agent, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Ticket[];
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, title, status, layer, current_agent, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Ticket | null) ?? null;
}

export async function listTrace(ticketId: string): Promise<TraceEvent[]> {
  const { data, error } = await supabase
    .from('trace_events')
    .select('id, seq, from_agent, to_agent, event_type, payload, created_at')
    .eq('ticket_id', ticketId)
    .order('seq', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TraceEvent[];
}

export async function listArtifacts(ticketId: string): Promise<Artifact[]> {
  const { data, error } = await supabase
    .from('artifacts')
    .select('id, kind, mime_type, bytes, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Artifact[];
}

export async function listConnectors(): Promise<Connector[]> {
  const { data, error } = await supabase
    .from('connectors')
    .select('provider, status, connected_at, last_error')
    .order('provider', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Connector[];
}
