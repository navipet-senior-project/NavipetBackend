export interface AccessibilityPreferences {
  accessibleRoutes: boolean;
  avoidStairs: boolean;
  preferElevators: boolean;
  avoidSteepSlopes: boolean;
  voiceGuidance: boolean;
  hapticTurnAlerts: boolean;
  highContrastMap: boolean;
  largerMapLabels: boolean;
  reduceMotion: boolean;
  screenReaderDirections: boolean;
}

export type AccessibilityPreferencesPatch = Partial<AccessibilityPreferences>;

export interface GroupedAccessibilityPreferences {
  mobility: Pick<
    AccessibilityPreferences,
    'accessibleRoutes' | 'avoidStairs' | 'preferElevators' | 'avoidSteepSlopes'
  >;
  guidance: Pick<AccessibilityPreferences, 'voiceGuidance' | 'hapticTurnAlerts'>;
  visuals: Pick<
    AccessibilityPreferences,
    'highContrastMap' | 'largerMapLabels' | 'reduceMotion' | 'screenReaderDirections'
  >;
}

export interface GroupedAccessibilityPreferencesPatch {
  mobility?: Partial<GroupedAccessibilityPreferences['mobility']>;
  guidance?: Partial<GroupedAccessibilityPreferences['guidance']>;
  visuals?: Partial<GroupedAccessibilityPreferences['visuals']>;
}

// Mirrors the column defaults of public.accessibility_preferences. A user with
// no row has exactly these values.
export const DEFAULT_ACCESSIBILITY_PREFERENCES: Readonly<AccessibilityPreferences> =
  Object.freeze({
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

export interface AccessibilityGateway {
  getAccessibilityPreferences(
    accessToken: string,
  ): Promise<AccessibilityPreferences | null>;
  updateAccessibilityPreferences(
    accessToken: string,
    userId: string,
    patch: AccessibilityPreferencesPatch,
  ): Promise<AccessibilityPreferences>;
}
