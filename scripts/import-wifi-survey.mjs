import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2] ?? '.env.vec-wifi-survey.json';
const apply = process.argv.includes('--apply');
const survey = JSON.parse(await readFile(file, 'utf8'));
if (survey.schemaVersion !== 1 || survey.building !== 'VEC' || survey.coordinateFrame !== 'multiset-mapset' || !Array.isArray(survey.fingerprints) || survey.fingerprints.length === 0) throw new Error('Invalid survey');
const groups = new Map();
for (const fp of survey.fingerprints) {
  if (!/^VEC\d+[A-Za-z]?$/.test(fp.point?.id ?? '') || !['1', '2'].includes(fp.point?.floor) || !Array.isArray(fp.accessPoints) || fp.accessPoints.length < 2 || fp.accessPoints.some(ap => !/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(ap.bssid) || !Number.isFinite(ap.rssiDbm) || !Number.isFinite(ap.frequencyMhz))) throw new Error('Invalid fingerprint');
  const room = fp.point.id.slice(3).toUpperCase();
  groups.set(room, [...(groups.get(room) ?? []), fp]);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const { data, error } = await client.from('campus_destinations').select('id,room_number,floor_number,wifi_fingerprints').eq('type','room').ilike('building_code','VEC').in('room_number', [...groups.keys()]);
if (error) throw new Error(`Room lookup failed: ${error.message}`);
const updates = [];
for (const [room, fingerprints] of groups) {
  const matches = data.filter(row => row.room_number?.toUpperCase() === room);
  if (matches.length !== 1) throw new Error(`Room ${room} has ${matches.length} matches; no changes made`);
  if (matches[0].floor_number && String(matches[0].floor_number) !== fingerprints[0].point.floor) throw new Error(`Room ${room} floor mismatch; no changes made`);
  const existing = matches[0].wifi_fingerprints ?? [];
  if (!Array.isArray(existing)) throw new Error(`Room ${room} has invalid existing fingerprints; no changes made`);
  const merged = new Map([...existing, ...fingerprints].map(fp => [`${fp.point?.id}:${fp.capturedAt}`, fp]));
  updates.push({id:matches[0].id, room, fingerprints:[...merged.values()]});
}
console.log(`${updates.length} rooms and ${survey.fingerprints.length} scans validated. ${apply ? 'Writing...' : 'Dry run only; add --apply to write.'}`);
if (apply) for (const item of updates) {
  const result = await client.from('campus_destinations').update({wifi_fingerprints:item.fingerprints}).eq('id',item.id).select('id');
  if (result.error || result.data?.length !== 1) throw new Error(`Update failed at room ${item.room}; prior updates may have succeeded`);
  console.log(`Saved ${item.room}`);
}
