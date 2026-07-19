/**
 * lib/glossary-types.ts — Types partagés du module lexique.
 * Miroir des serializers Django glossary/serializers.py.
 */

export type GlossaryScope = 'global' | 'course' | 'section' | 'lesson';
export type GlossaryTermStatus =
  | 'draft'
  | 'pending'
  | 'validated'
  | 'rejected'
  | 'archived';
export type GlossaryLevel = 'beginner' | 'intermediate' | 'advanced';
export type GlossaryVariantType =
  | 'synonym'
  | 'acronym'
  | 'plural'
  | 'abbreviation'
  | 'alternative_spelling';
export type GlossaryRelationType =
  | 'related'
  | 'synonym'
  | 'antonym'
  | 'broader'
  | 'narrower';

export interface GlossaryCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  parent: number | null;
  is_active: boolean;
  order: number;
  terms_count: number;
}

export interface GlossaryVariant {
  id: number;
  variant: string;
  variant_type: GlossaryVariantType;
  is_case_sensitive: boolean;
}

export interface GlossaryExample {
  id: number;
  example: string;
  source: string;
  order: number;
}

export interface GlossaryRelatedTerm {
  id: number;
  word: string;
  slug: string;
  short_definition: string;
  relation_type: GlossaryRelationType;
}

export interface GlossaryAssociatedCourse {
  id: number;
  title: string;
  slug: string;
}

/** Représentation compacte pour cartes et listes. */
export interface GlossaryTermListItem {
  id: number;
  word: string;
  slug: string;
  search_key: string;
  short_definition: string;
  level: GlossaryLevel;
  domain: string;
  scope: GlossaryScope;
  category: number | null;
  category_name: string | null;
  category_slug: string | null;
  category_color: string | null;
  illustration_url: string;
  view_count: number;
  variants_count: number;
  is_favorite: boolean;
  first_letter: string;
  updated_at: string;
}

/** Représentation détail pour /lexique/:slug. */
export interface GlossaryTermDetail {
  id: number;
  word: string;
  slug: string;
  short_definition: string;
  long_definition: string;
  pronunciation: string;
  language: string;
  level: GlossaryLevel;
  category: GlossaryCategory | null;
  domain: string;
  scope: GlossaryScope;
  status: GlossaryTermStatus;
  is_active: boolean;
  enable_auto_detection: boolean;
  illustration_url: string;
  external_source: string;
  view_count: number;
  variants: GlossaryVariant[];
  examples: GlossaryExample[];
  related_terms: GlossaryRelatedTerm[];
  associated_courses: GlossaryAssociatedCourse[];
  is_favorite: boolean;
  user_note: {
    note: string;
    status: 'new' | 'understood' | 'review';
    updated_at: string;
  } | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** Payload compact pour la détection frontend. */
export interface GlossaryTermDetect {
  id: number;
  word: string;
  slug: string;
  short_definition: string;
  is_case_sensitive: boolean;
  variants: Array<{ variant: string; search_key: string }>;
}

export interface GlossaryCourseTermsResponse {
  course: { id: number; slug: string; title: string };
  terms: GlossaryTermDetect[];
  count: number;
}

export interface GlossaryAlphabetIndex {
  total: number;
  by_letter: Record<string, number>;
}

export interface GlossaryPaginatedList<T = GlossaryTermListItem> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
