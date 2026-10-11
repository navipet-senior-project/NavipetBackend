import type {
  AccessibilityPreferences,
  AccessibilityPreferencesPatch,
  GroupedAccessibilityPreferences,
  GroupedAccessibilityPreferencesPatch,
} from './accessibility.types.js';

export interface AccessibilityPreferencesRow {
  accessible_routes: boolean;
  avoid_stairs: boolean;
  prefer_elevators: boolean;
  avoid_steep_slopes: boolean;
  voice_guidance: boolean;
  haptic_turn_alerts: boolean;
  high_contrast_map: boolean;
  larger_map_labels: boolean;
  reduce_motion: boolean;
  screen_reader_directions: boolean;
}

// One unbroken literal: supabase-js derives the result type from the literal
// passed to select(), so this must not be built with `+` or join().
export const ACCESSIBILITY_COLUMNS = 'accessible_routes,avoid_stairs,prefer_elevators,avoid_steep_slopes,voice_guidance,haptic_turn_alerts,high_contrast_map,larger_map_labels,reduce_motion,screen_reader_directions';

const COLUMN_BY_FIELD = {
  accessibleRoutes: 'accessible_routes',
  avoidStairs: 'avoid_stairs',
  preferElevators: 'prefer_elevators',
  avoidSteepSlopes: 'avoid_steep_slopes',
  voiceGuidance: 'voice_guidance',
  hapticTurnAlerts: 'haptic_turn_alerts',
  highContrastMap: 'high_contrast_map',
  largerMapLabels: 'larger_map_labels',
  reduceMotion: 'reduce_motion',
  screenReaderDirections: 'screen_reader_directions',
} as const satisfies Record<
  keyof AccessibilityPreferences,
  keyof AccessibilityPreferencesRow
>;

export function rowToPreferences(
  row: AccessibilityPreferencesRow,
): AccessibilityPreferences {
  return {
    accessibleRoutes: row.accessible_routes,
    avoidStairs: row.avoid_stairs,
    preferElevators: row.prefer_elevators,
    avoidSteepSlopes: row.avoid_steep_slopes,
    voiceGuidance: row.voice_guidance,
    hapticTurnAlerts: row.haptic_turn_alerts,
    highContrastMap: row.high_contrast_map,
    largerMapLabels: row.larger_map_labels,
    reduceMotion: row.reduce_motion,
    screenReaderDirections: row.screen_reader_directions,
  };
}

export function patchToRow(
  patch: AccessibilityPreferencesPatch,
): Partial<AccessibilityPreferencesRow> {
  const row: Partial<AccessibilityPreferencesRow> = {};
  const fields = Object.entries(COLUMN_BY_FIELD) as Array<
    [keyof AccessibilityPreferences, keyof AccessibilityPreferencesRow]
  >;
  for (const [field, column] of fields) {
    const value = patch[field];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

export function toGrouped(
  preferences: AccessibilityPreferences,
): GroupedAccessibilityPreferences {
  return {
    mobility: {
      accessibleRoutes: preferences.accessibleRoutes,
      avoidStairs: preferences.avoidStairs,
      preferElevators: preferences.preferElevators,
      avoidSteepSlopes: preferences.avoidSteepSlopes,
    },
    guidance: {
      voiceGuidance: preferences.voiceGuidance,
      hapticTurnAlerts: preferences.hapticTurnAlerts,
    },
    visuals: {
      highContrastMap: preferences.highContrastMap,
      largerMapLabels: preferences.largerMapLabels,
      reduceMotion: preferences.reduceMotion,
      screenReaderDirections: preferences.screenReaderDirections,
    },
  };
}

export function flattenPatch(
  patch: GroupedAccessibilityPreferencesPatch,
): AccessibilityPreferencesPatch {
  return { ...patch.mobility, ...patch.guidance, ...patch.visuals };
}
