import type { XpathCandidateOptions } from '@midscene/core/internal/device-cache';

export const ANDROID_CACHE_EXCLUDED_TARGET_TYPES = [
  'android.widget.GridView',
  'android.widget.ListView',
  'android.widget.ScrollView',
  'android.widget.HorizontalScrollView',
  'android.widget.RecyclerView',
  'android.support.v7.widget.RecyclerView',
  'androidx.recyclerview.widget.RecyclerView',
  'android.support.v4.view.ViewPager',
  'androidx.viewpager.widget.ViewPager',
  'androidx.viewpager2.widget.ViewPager2',
  'android.webkit.WebView',
] as const;

/**
 * Android accessibility trees expose resource IDs when an app supplies them,
 * followed by semantic accessibility descriptions and visible text. Keeping
 * this policy in one module makes production replay and fixture validation use
 * exactly the same candidate ranking.
 */
export const ANDROID_CACHE_CANDIDATE_OPTIONS: XpathCandidateOptions = {
  excludedTargetTypes: ANDROID_CACHE_EXCLUDED_TARGET_TYPES,
  stableAttrs: ['resource-id'],
  textAttrs: ['content-desc', 'text'],
  max: 3,
};
