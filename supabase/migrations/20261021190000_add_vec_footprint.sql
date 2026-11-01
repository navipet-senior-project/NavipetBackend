-- VEC building outline for arrival detection near the building, not a point.
-- Source: OpenStreetMap way 665474894 "Vivian Engineering Center",
-- © OpenStreetMap contributors, ODbL 1.0.
-- Rooms carry a copy so room searches arrive at the same outline.

set lock_timeout = '5s';
set statement_timeout = '60s';

with vec as (
  select id
  from public.campus_destinations
  where type = 'building' and code = 'VEC'
)
update public.campus_destinations as destination
set metadata = coalesce(destination.metadata, '{}'::jsonb) || jsonb_build_object(
  'footprint',
  '{"type":"Polygon","coordinates":[[[-118.1104896,33.783106],[-118.1104919,33.7830919],[-118.110491,33.7829468],[-118.1106024,33.7829431],[-118.1105988,33.7830353],[-118.1108183,33.7830382],[-118.11082,33.7829506],[-118.1106194,33.7829482],[-118.1106241,33.7827517],[-118.1106246,33.7827103],[-118.11082,33.7827092],[-118.1108235,33.7826322],[-118.110596,33.7826319],[-118.1105947,33.7827278],[-118.1104923,33.7827273],[-118.1104937,33.7825328],[-118.1102238,33.7825315],[-118.1102197,33.7831054],[-118.1103335,33.7831056],[-118.1103745,33.7831059],[-118.1104896,33.783106]]]}'::jsonb
)
from vec
where destination.id = vec.id
   or (destination.type = 'room' and destination.parent_destination_id = vec.id);
