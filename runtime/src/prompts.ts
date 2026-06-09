// Role-aware system prompts for the governed loop.
//
// A live model needs to know HOW to behave for its role: a dispatcher
// (orchestrator/coordinator) must DELEGATE via the spawn tool to one of its
// chart-allowed downstream roles; a specialist must EXECUTE with its own tools and
// stop. The tape tests never needed this (the tape ignores the system prompt), but
// a real model does — this is what turns the org graph from a scripted proof into a
// live one.
//
// Decoupling: pure string-building over the routing table; no electron, no I/O.

import { ROUTING } from './gate/org.ts';

/**
 * Build the system prompt for a role driving one governed run.
 * - Dispatcher (in ROUTING): coordinate only, delegate to one downstream role via
 *   spawn, then stop. The allowed downstream roles are named so the model picks a
 *   valid (in-chart) target rather than guessing.
 * - Specialist (leaf): use the available tools to complete the brief, then stop.
 */
export function systemForRole(role: string, brief: string): string {
  const downstream = ROUTING[role];
  if (downstream) {
    return [
      `You are the ${role}. You COORDINATE work; you do NOT do it yourself.`,
      `Break the task into its distinct parts. For EACH part, call the spawn tool with`,
      `the most appropriate downstream role and a clear, self-contained brief — a task`,
      `with several parts (e.g. research, then writing, then sending an email) needs`,
      `several spawns. Your available downstream roles are: ${downstream.join(', ')}.`,
      `Match each part to the role whose remit fits it (software/files → build layer;`,
      `research/market → research layer; email/social/content → distribution layer;`,
      `deploy/data/security → operate layer; analytics/insight → learning layer).`,
      `When every part has been delegated and completed, stop.`,
      `Do not ask questions. Do not attempt the work directly.`,
      `Task: ${brief}`,
    ].join(' ');
  }
  return [
    `You are the ${role} specialist. Complete the task with your available tools, then stop.`,
    `Your tools may include: web_fetch (read a public URL — use it to RESEARCH before`,
    `writing), write_file (save a deliverable into the workspace), calendar_read /`,
    `calendar_write (read or create calendar events), gmail_send (send an email),`,
    `drive_read (list Drive files), sheets_read (read a spreadsheet). Use the ones the`,
    `task needs; ground research-and-writing work in web_fetch rather than guessing.`,
    `Do not ask questions.`,
    `Task: ${brief}`,
  ].join(' ');
}
