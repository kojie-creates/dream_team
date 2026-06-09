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
      `Delegate the task to the single most appropriate downstream role by calling`,
      `the spawn tool with that role and a clear, self-contained brief.`,
      `Your available downstream roles are: ${downstream.join(', ')}.`,
      `Choose the one whose remit fits the task (software implementation flows toward`,
      `the build layer). When the delegated work is complete, stop.`,
      `Do not ask questions. Do not attempt the work directly.`,
      `Task: ${brief}`,
    ].join(' ');
  }
  return [
    `You are the ${role} specialist.`,
    `Use your available tools to complete the task, then stop.`,
    `Do not ask questions.`,
    `Task: ${brief}`,
  ].join(' ');
}
