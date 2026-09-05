# CSULB Campus Places Validation Report

Validation date: 2026-09-04

Dataset: `data/csulb-campus-places.csv`

## Scope and provenance

The dataset uses only these permitted sources:

- CSULB Building Names & Codes directory: https://www.csulb.edu/maps/building-names-codes
- Official CSULB campus map, revision 07/28/26: https://www.csulb.edu/sites/default/files/document/campus-map_2.pdf
- Existing NaviPet Flutter destination literals were reviewed only as candidate data. They were not used for coordinates or aliases because the repository does not record their provenance or verification method.

No authorized Concept3D API response or CMS export for map ID `1314` was available. No CSULB location export or user-provided CSV/JSON was found. Therefore, this dataset does not claim Concept3D completeness.

Top-level `type` follows the approved schema vocabulary: `building`, `room`, `entrance`, `amenity`, or `parking`. Required destination categories such as dining, housing, and athletic facilities are stored in `metadata.categories`.

## Validation summary

| Metric | Count | Meaning |
|---|---:|---|
| Total source rows reviewed | 132 | 83 directory entries, 46 map-only canonical records, and 3 repository destination candidates |
| Valid canonical rows | 129 | All emitted CSV rows pass hard validation |
| Duplicate source rows | 3 | Repository literals matched USU, LIB, and SRWC records already established by official sources |
| Incomplete rows | 17 | Accepted rows for which the official source supplies neither a canonical code nor a stable source ID |
| Rejected rows | 0 | No named canonical row from the two official sources failed hard validation |
| Buildings available | 84 | Rows with top-level type `building` |
| Rooms available | 0 | No authorized room dataset was available |
| Amenities available | 13 | Rows with top-level type `amenity`; parking and entrances are counted separately |
| Parking records available | 31 | 28 lots and 3 structures |
| Entrance records available | 1 | Campus Main Entrance; not a building entrance |
| Records missing coordinates | 129 | Neither official source provides machine-readable latitude/longitude values |
| Records missing required parent relationships | 0 | No emitted room, building-entrance, or accessible-entrance record requires a parent |

`Incomplete rows` overlap `Valid canonical rows`: these records are valid but lack a source-provided code/ID. The 17 are Greenhouse 3; the three named parking structures; Softball Restrooms; Main Entrance; six named athletic amenities; three named dining amenities; La Playa; and Amazon @ The Beach.

## Category coverage

Counts below come from `metadata.categories`; a record can appear in more than one category.

| Required category | Records | Result |
|---|---:|---|
| Buildings | 84 | Available |
| Rooms | 0 | Unavailable without authorized room data |
| Building entrances | 0 | Official sources do not identify individual building entrances |
| Accessible entrances | 0 | Official sources do not identify accessible entrances |
| Parking lots | 28 | Available |
| Parking structures | 3 | Available |
| Dining | 6 | Available |
| Student services | 15 | Available |
| Restrooms | 1 | Softball Restrooms only |
| Accessibility amenities | 0 | Unavailable from supplied sources |
| Transit and shuttle stops | 0 | Map has symbols, but no stable stop names, IDs, or coordinates |
| Bicycle facilities | 0 | Unavailable from supplied sources |
| Athletic facilities | 10 | Available |
| Housing | 8 | Available |
| Campus landmarks | 4 | Available |

The campus map also depicts unnamed campus-shuttle stops, Long Beach Transit stops, a Metro stop, parking pay stations, and motorcycle parking. These symbols were not converted into rows because they lack enough source identity to satisfy one-row-per-canonical-destination rules.

## Hard validation results

| Check | Result |
|---|---:|
| CSV rows with exactly 20 columns | 129 |
| Missing required fields (`type`, `name`, `source`, `source_url`, `searchable`, `active`) | 0 |
| Unrecognized destination types | 0 |
| Empty or malformed names | 0 |
| Duplicate non-empty canonical codes | 0 |
| Duplicate non-empty source IDs within a source | 0 |
| Conflicting aliases | 0 |
| Missing or mismatched source attribution | 0 |
| Malformed boolean values | 0 |
| Invalid metadata JSON | 0 |
| Partial coordinate pairs | 0 |
| Out-of-range coordinates | 0 |
| Placeholder `0,0` coordinates | 0 |
| Invalid parent-building references | 0 |

All 129 records intentionally have empty `latitude`, `longitude`, `outdoor_destination_latitude`, and `outdoor_destination_longitude`. Empty coordinate values are not range errors. They require later enrichment from an authorized source.

All `concept3d_id`, `concept3d_category_ids`, and `multiset_destination_id` values are empty. No provider identifiers were manufactured.

## Representative rows

| type | name | code | aliases | source | searchable | metadata category |
|---|---|---|---|---|---|---|
| building | College of Business | COB |  | Building Names & Codes | true | building |
| amenity | Earl Burns Miller Japanese Garden | JG | Japanese Garden | Building Names & Codes | true | campus_landmark |
| parking | Palo Verde North Parking Structure |  |  | Building Names & Codes | true | parking_structure |
| amenity | Softball Restrooms |  |  | Building Names & Codes | true | restroom |
| entrance | Main Entrance |  |  | Campus map | true | campus_entrance |
| amenity | Parkside Dining |  |  | Campus map | true | dining |
| parking | General Parking Lot G14 | G14 |  | Campus map | true | parking_lot |
| building | Kleefeld Contemporary Art Museum | KCAM |  | Campus map | true | campus_landmark |

## Source discrepancies and limits

- The directory uses `FDN` for CSULB Foundation; the current map uses `FND`. `FDN` remains the canonical code, and `FND` is retained as `metadata.map_code` rather than creating a duplicate destination.
- The directory spells `Isabel Patterson Child Devlopment Center` as shown. That source spelling is preserved. `Child Development Center`, verified on the current map, is stored as an alias.
- The map lists `PSC` for Parkside College while the directory lists `PCH` for Parkside Commons. They were not merged because the supplied sources do not establish that they are the same canonical destination.
- The three Flutter popular-destination literals contain coordinates for University Student Union, University Library, and Student Recreation Center. Those coordinates were not imported because the repository gives no authoritative origin, precision, or indication that they are routable entrances rather than approximate centroids.
- `active=true` means the destination appears in a current official source. It does not prove temporary operational status, opening hours, or construction access.
- The current map marks the University Student Union as under renovation. The canonical USU destination remains active because the map and directory still identify it; construction state is not represented by the approved CSV columns.

## Required follow-up data

An authorized Concept3D response/CMS export or CSULB location export is still needed for coordinates, source IDs, Concept3D category IDs, building and accessible entrances, room/floor hierarchy, accessibility amenities, named transit/shuttle stops, bicycle facilities, and provider-specific route anchors. A Multiset-managed export is required before any `multiset_destination_id` can be populated.
