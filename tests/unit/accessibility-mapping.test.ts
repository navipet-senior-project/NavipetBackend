import { describe, expect, it } from 'vitest';

import {
  ACCESSIBILITY_COLUMNS,
  flattenPatch,
  patchToRow,
  rowToPreferences,
  toGrouped,
} from '../../src/modules/accessibility/accessibility.mapping.js';
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from '../../src/modules/accessibility/accessibility.types.js';

const row = {
  accessible_routes: true,
  avoid_stairs: false,
  prefer_elevators: true,
  avoid_steep_slopes: false,
  voice_guidance: true,
  haptic_turn_alerts: false,
  high_contrast_map: true,
  larger_map_labels: false,
  reduce_motion: true,
  screen_reader_directions: false,
};

const preferences = {
  accessibleRoutes: true,
  avoidStairs: false,
  preferElevators: true,
  avoidSteepSlopes: false,
  voiceGuidance: true,
  hapticTurnAlerts: false,
  highContrastMap: true,
  largerMapLabels: false,
  reduceMotion: true,
  screenReaderDirections: false,
};

describe('accessibility defaults', () => {
  it('turns on only voice guidance and haptic turn alerts', () => {
    expect(DEFAULT_ACCESSIBILITY_PREFERENCES).toEqual({
      accessibleRoutes: false,
      avoidStairs: false,
      preferElevators: false,
      avoidSteepSlopes: false,
      voiceGuidance: true,
      hapticTurnAlerts: true,
      highContrastMap: false,
      largerMapLabels: false,
      reduceMotion: false,
      screenReaderDirections: false,
    });
  });
});

describe('accessibility mapping', () => {
  it('selects exactly the ten preference columns', () => {
    expect(ACCESSIBILITY_COLUMNS.split(',')).toEqual(Object.keys(row));
  });

  it('converts a database row to preferences', () => {
    expect(rowToPreferences(row)).toEqual(preferences);
  });

  it('converts only the supplied fields of a patch to columns', () => {
    expect(patchToRow({ avoidStairs: true, reduceMotion: false })).toEqual({
      avoid_stairs: true,
      reduce_motion: false,
    });
  });

  it('converts an empty patch to an empty row', () => {
    expect(patchToRow({})).toEqual({});
  });

  it('groups preferences by screen section', () => {
    expect(toGrouped(preferences)).toEqual({
      mobility: {
        accessibleRoutes: true,
        avoidStairs: false,
        preferElevators: true,
        avoidSteepSlopes: false,
      },
      guidance: { voiceGuidance: true, hapticTurnAlerts: false },
      visuals: {
        highContrastMap: true,
        largerMapLabels: false,
        reduceMotion: true,
        screenReaderDirections: false,
      },
    });
  });

  it('flattens a grouped patch, keeping only supplied fields', () => {
    expect(
      flattenPatch({
        mobility: { avoidStairs: true },
        visuals: { reduceMotion: true, largerMapLabels: false },
      }),
    ).toEqual({ avoidStairs: true, reduceMotion: true, largerMapLabels: false });
  });

  it('flattens a patch with no groups to an empty patch', () => {
    expect(flattenPatch({})).toEqual({});
  });
});
