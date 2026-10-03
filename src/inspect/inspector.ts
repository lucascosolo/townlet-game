// The resident inspector (spec 8.3): needs against setpoints, feelings, beliefs with their
// provenance (the "Why?" chain), relationships and requests. `residentReport` is the data; the
// CLI formats it as text and the browser journal renders it as a page.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { Narrator } from '../narrate/narrator.js';
import { opinion } from '../sim/mind/memory.js';
import type { Simulation } from '../sim/sim.js';
import { clock, dayOf } from '../sim/time.js';
import { NEEDS, type Need, type ResidentState } from '../sim/types.js';

export interface ReportSource {
  when: string;
  how: string;
  note: string;
  weight: number;
}

export interface ReportBelief {
  statement: string;
  strength: number;
  formed: string;
  sources: ReportSource[];
}

export interface ResidentReport {
  id: string;
  name: string;
  age: number;
  background: string;
  aspiration: string;
  traits: Array<[string, number]>;
  values: Array<[string, number]>;
  departed: boolean;
  doing: string;
  mood: number;
  disposition: number;
  leavingSince: number | null;
  needs: Array<{ need: Need; level: number; setpoint: number }>;
  feelings: Array<{ kind: string; about: string | null; intensity: number }>;
  opinions: Array<{ subject: string; name: string; value: number; beliefs: ReportBelief[] }>;
  forming: Array<{ statement: string; evidence: number; sources: ReportSource[] }>;
  relationships: Array<{ id: string; name: string; affinity: number; familiarity: number; trust: number; tags: string[] }>;
  requests: Array<{ id: number; about: string; status: string; posted: string }>;
  moments: Array<{ when: string; note: string; about: string; aspect: string; weight: number }>;
}

const when = (t: number) => `day ${dayOf(t)} ${clock(t)}`;
const round = (v: number) => Math.round(v * 100) / 100;

export function residentReport(sim: Simulation, id: string, names: Narrator = new Narrator(sim.clone())): ResidentReport {
  const r: ResidentState = sim.resident(id);
  const def = residentDef(id);
  const place = (pid: number | null) => (pid === null ? 'on the path' : names.subjectName(`b:${pid}`));
  const doing = r.activity
    ? `${r.activity.id} at ${place(r.activity.placeId)} until ${clock(r.activity.until)}`
    : r.pending
      ? `walking to ${place(r.pending.placeId)} to ${r.pending.id}`
      : 'deciding';

  const subjects = [...new Set(Object.values(r.beliefs).map((b) => b.subject))];
  subjects.sort((a, b) => Math.abs(opinion(r, b)) - Math.abs(opinion(r, a)));

  return {
    id,
    name: def.name,
    age: def.age,
    background: def.background,
    aspiration: def.aspiration,
    traits: Object.entries(def.traits),
    values: Object.entries(def.values).filter(([, v]) => v >= 0.5),
    departed: r.departed,
    doing,
    mood: r.mood,
    disposition: r.disposition,
    leavingSince: r.leaving ? r.leaving.sinceDay : null,
    needs: NEEDS.map((n) => ({ need: n, level: r.needs[n], setpoint: r.setpoints[n] })),
    feelings: r.emotions.map((e) => ({ kind: e.kind, about: e.target ? names.subjectName(e.target) : null, intensity: e.intensity })),
    opinions: subjects.map((s) => ({
      subject: s,
      name: names.subjectName(s),
      value: opinion(r, s),
      beliefs: Object.values(r.beliefs)
        .filter((b) => b.subject === s)
        .map((b) => ({
          statement: names.statement(id, b),
          strength: b.strength,
          formed: when(b.formedTick),
          sources: b.sources.map((src) => ({
            when: when(src.tick),
            how: src.kind === 'told' ? `told by ${src.from ? names.name(src.from) : 'someone'}` : src.kind,
            note: src.note,
            weight: src.weight,
          })),
        })),
    })),
    forming: Object.values(r.traces)
      .filter((t) => Math.abs(t.evidence) >= 0.2)
      .map((t) => ({
        statement: names.statement(id, t),
        evidence: round(t.evidence),
        sources: t.sources.map((src) => ({
          when: when(src.tick),
          how: src.kind === 'told' ? `told by ${src.from ? names.name(src.from) : 'someone'}` : src.kind,
          note: src.note,
          weight: src.weight,
        })),
      })),
    relationships: Object.entries(r.rel)
      .sort((a, b) => b[1].affinity - a[1].affinity)
      .map(([other, x]) => ({
        id: other,
        name: other === 'steward' ? 'the steward' : names.name(other),
        affinity: x.affinity,
        familiarity: x.familiarity,
        trust: x.trust,
        tags: [...x.tags],
      })),
    requests: sim.state.requests
      .filter((q) => q.by === id)
      .map((q) => ({ id: q.id, about: names.subjectName(q.subject), status: q.status, posted: when(q.postedTick) })),
    moments: r.episodes.slice(-8).map((ep) => ({
      when: when(ep.tick),
      note: ep.note,
      about: names.subjectName(ep.subject),
      aspect: ep.aspect,
      weight: round(ep.valence * ep.intensity),
    })),
  };
}

const bar = (v: number, width = 10) => '#'.repeat(Math.round(v * width)).padEnd(width, '.');
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

export function inspectResident(sim: Simulation, id: string): string {
  const rep = residentReport(sim, id);
  const out: string[] = [];
  out.push(`${rep.name}, ${rep.age}. ${rep.background}`);
  out.push(`  Aspiration: ${rep.aspiration}`);
  out.push(`  Traits: ${rep.traits.map(([k, v]) => `${k} ${signed(v)}`).join(', ')}`);
  out.push(`  Values: ${rep.values.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  if (rep.departed) {
    out.push('  Has left the valley.');
    return out.join('\n');
  }
  out.push(`  Now: ${rep.doing}`);
  out.push(`  Mood ${rep.mood.toFixed(2)}, disposition ${rep.disposition.toFixed(2)}${rep.leavingSince !== null ? `, THINKING OF LEAVING since day ${rep.leavingSince}` : ''}`);
  out.push('');
  out.push('Needs (level / setpoint):');
  for (const n of rep.needs) out.push(`  ${n.need.padEnd(8)} ${bar(n.level)} ${n.level.toFixed(2)} / ${n.setpoint.toFixed(2)}`);
  out.push('');
  out.push('Feeling:');
  if (rep.feelings.length === 0) out.push('  (nothing in particular)');
  for (const f of rep.feelings) out.push(`  ${f.kind} ${f.about ? `about ${f.about} ` : ''}(${f.intensity.toFixed(2)})`);
  out.push('');
  out.push('Opinions, and why:');
  if (rep.opinions.length === 0) out.push('  (no settled opinions yet)');
  for (const o of rep.opinions) {
    out.push(`  ${o.name}: ${signed(o.value)}`);
    for (const b of o.beliefs) {
      out.push(`    "${b.statement}"  strength ${b.strength.toFixed(2)}, formed ${b.formed}`);
      for (const src of b.sources) out.push(`      <- ${src.when} ${src.how}: ${src.note} (${signed(src.weight)})`);
    }
  }
  if (rep.forming.length > 0) {
    out.push('  Still forming:');
    for (const f of rep.forming) out.push(`    "${f.statement}"  evidence ${signed(f.evidence)} of 0.90 needed`);
  }
  out.push('');
  out.push('Relationships (affinity / familiarity / trust):');
  for (const x of rep.relationships) {
    out.push(`  ${x.name.padEnd(12)} ${signed(x.affinity)} / ${x.familiarity.toFixed(2)} / ${x.trust.toFixed(2)}${x.tags.length ? `  [${x.tags.join(', ')}]` : ''}`);
  }
  if (rep.requests.length > 0) {
    out.push('');
    out.push('Requests to the steward:');
    for (const q of rep.requests) out.push(`  #${q.id} quieter_home about ${q.about}: ${q.status} (posted ${q.posted})`);
  }
  out.push('');
  out.push('Memorable moments (most recent last):');
  for (const m of rep.moments) out.push(`  ${m.when} ${m.note} [${m.about}, ${m.aspect}, ${signed(m.weight)}]`);
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
