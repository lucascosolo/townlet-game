// The resident inspector (spec 8.3): needs against setpoints, feelings, beliefs with their
// provenance (the "Why?" chain), relationships and requests. The player-facing journal in M2
// will be a skinned subset of this.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { Narrator } from '../narrate/narrator.js';
import { opinion } from '../sim/mind/memory.js';
import type { Simulation } from '../sim/sim.js';
import { clock, dayOf } from '../sim/time.js';
import { NEEDS, type ResidentState } from '../sim/types.js';

const bar = (v: number, width = 10) => '#'.repeat(Math.round(v * width)).padEnd(width, '.');
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const when = (t: number) => `day ${dayOf(t)} ${clock(t)}`;

export function inspectResident(sim: Simulation, id: string): string {
  const r: ResidentState = sim.resident(id);
  const def = residentDef(id);
  const names = new Narrator(sim.clone());
  const out: string[] = [];
  const place = (pid: number | null) => (pid === null ? 'on the path' : names.subjectName(`b:${pid}`));

  out.push(`${def.name}, ${def.age}. ${def.background}`);
  out.push(`  Aspiration: ${def.aspiration}`);
  out.push(`  Traits: ${Object.entries(def.traits).map(([k, v]) => `${k} ${signed(v)}`).join(', ')}`);
  out.push(`  Values: ${Object.entries(def.values).filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  if (r.departed) {
    out.push('  Has left the valley.');
    return out.join('\n');
  }
  const doing = r.activity ? `${r.activity.id} at ${place(r.activity.placeId)} until ${clock(r.activity.until)}` : r.pending ? `walking to ${place(r.pending.placeId)} to ${r.pending.id}` : 'deciding';
  out.push(`  Now: ${doing}`);
  out.push(`  Mood ${r.mood.toFixed(2)}, disposition ${r.disposition.toFixed(2)}${r.leaving ? `, THINKING OF LEAVING since day ${r.leaving.sinceDay}` : ''}`);
  out.push('');
  out.push('Needs (level / setpoint):');
  for (const n of NEEDS) out.push(`  ${n.padEnd(8)} ${bar(r.needs[n])} ${r.needs[n].toFixed(2)} / ${r.setpoints[n].toFixed(2)}`);
  out.push('');
  out.push('Feeling:');
  if (r.emotions.length === 0) out.push('  (nothing in particular)');
  for (const e of r.emotions) out.push(`  ${e.kind} ${e.target ? `about ${names.subjectName(e.target)} ` : ''}(${e.intensity.toFixed(2)})`);
  out.push('');

  out.push('Opinions, and why:');
  const subjects = [...new Set(Object.values(r.beliefs).map((b) => b.subject))];
  subjects.sort((a, b) => Math.abs(opinion(r, b)) - Math.abs(opinion(r, a)));
  if (subjects.length === 0) out.push('  (no settled opinions yet)');
  for (const s of subjects) {
    out.push(`  ${names.subjectName(s)}: ${signed(opinion(r, s))}`);
    for (const b of Object.values(r.beliefs).filter((x) => x.subject === s)) {
      out.push(`    "${names.statement(id, b)}"  strength ${b.strength.toFixed(2)}, formed ${when(b.formedTick)}`);
      for (const src of b.sources) {
        const how = src.kind === 'told' ? `told by ${src.from ? names.name(src.from) : 'someone'}` : src.kind;
        out.push(`      <- ${when(src.tick)} ${how}: ${src.note} (${signed(src.weight)})`);
      }
    }
  }
  const traces = Object.values(r.traces).filter((t) => Math.abs(t.evidence) >= 0.2);
  if (traces.length > 0) {
    out.push('  Still forming:');
    for (const t of traces) out.push(`    "${names.statement(id, t)}"  evidence ${signed(t.evidence)} of 0.90 needed`);
  }
  out.push('');

  out.push('Relationships (affinity / familiarity / trust):');
  const rels = Object.entries(r.rel).sort((a, b) => b[1].affinity - a[1].affinity);
  for (const [other, x] of rels) {
    const who = other === 'steward' ? 'the steward' : names.name(other);
    out.push(`  ${who.padEnd(12)} ${signed(x.affinity)} / ${x.familiarity.toFixed(2)} / ${x.trust.toFixed(2)}${x.tags.length ? `  [${x.tags.join(', ')}]` : ''}`);
  }
  const requests = sim.state.requests.filter((q) => q.by === id);
  if (requests.length > 0) {
    out.push('');
    out.push('Requests to the steward:');
    for (const q of requests) out.push(`  #${q.id} ${q.kind} about ${names.subjectName(q.subject)}: ${q.status} (posted ${when(q.postedTick)})`);
  }
  out.push('');
  out.push('Memorable moments (most recent last):');
  for (const ep of r.episodes.slice(-8)) {
    out.push(`  ${when(ep.tick)} ${ep.note} [${names.subjectName(ep.subject)}, ${ep.aspect}, ${signed(ep.valence * ep.intensity)}]`);
  }
  return out.join('\n');
}

export function townSummary(sim: Simulation): string {
  const out: string[] = [];
  out.push(`Day ${dayOf(sim.tick)} ${clock(sim.tick)}, seed ${sim.state.seed}`);
  for (const id of sim.state.order) {
    const r = sim.resident(id);
    const where = r.at === null ? 'on the path' : buildingDef(sim.state.buildings.find((b) => b.id === r.at)?.type ?? 'tent').name;
    out.push(`  ${residentDef(id).name.padEnd(8)} mood ${r.mood.toFixed(2)}  disposition ${r.disposition.toFixed(2)}  beliefs ${Object.keys(r.beliefs).length}  ${r.departed ? '(left)' : `${r.activity?.id ?? r.pending?.id ?? '-'} @ ${where}`}`);
  }
  return out.join('\n');
}
