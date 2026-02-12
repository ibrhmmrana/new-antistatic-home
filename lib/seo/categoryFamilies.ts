/**
 * Category Family Resolver and Service Keywords
 * Maps business categories to families and provides family-specific service keywords
 */

// Category family types
export type CategoryFamily = 
  | 'dental_ortho'
  | 'dental_general'
  | 'restaurant'
  | 'cafe'
  | 'plumber'
  | 'law_firm'
  | 'real_estate'
  | 'gym'
  | 'salon'
  | 'retail'
  | 'automotive'
  | 'healthcare'
  | 'hospitality'
  | 'professional_services'
  | 'generic_local_business';

// Category to family mapping
const CATEGORY_TO_FAMILY: Record<string, CategoryFamily> = {
  // Dental
  'Dentist': 'dental_general',
  'Orthodontist': 'dental_ortho',
  
  // Food & Drink
  'Restaurant': 'restaurant',
  'Bar': 'restaurant',
  'Nightclub': 'restaurant',
  'Cafe': 'cafe',
  'Bakery': 'cafe',
  
  // Professional Services
  'Law Firm': 'law_firm',
  'Accounting Firm': 'professional_services',
  'Financial Planner': 'professional_services',
  'Insurance Agency': 'professional_services',
  'Marketing Agency': 'professional_services',
  'Employment Agency': 'professional_services',
  'Real Estate Agency': 'real_estate',
  'Travel Agency': 'professional_services',
  
  // Trades
  'Plumber': 'plumber',
  'Electrician': 'plumber', // Same family for trades
  'Contractor': 'plumber',
  'Roofing Contractor': 'plumber',
  'Locksmith': 'plumber',
  'Painter': 'plumber',
  'Moving Company': 'plumber',
  'Pest Control': 'plumber',
  
  // Fitness & Beauty
  'Gym': 'gym',
  'Beauty Salon': 'salon',
  'Hair Salon': 'salon',
  'Spa': 'salon',

  // Retail — all store/shop types
  'Store': 'retail',
  'Clothing Store': 'retail',
  'Shoe Store': 'retail',
  'Jewelry Store': 'retail',
  'Furniture Store': 'retail',
  'Home Goods Store': 'retail',
  'Hardware Store': 'retail',
  'Electronics Store': 'retail',
  'Pet Store': 'retail',
  'Book Store': 'retail',
  'Bicycle Store': 'retail',
  'Convenience Store': 'retail',
  'Department Store': 'retail',
  'Liquor Store': 'retail',
  'Sporting Goods Store': 'retail',
  'Gift Shop': 'retail',
  'Florist': 'retail',
  'Supermarket': 'retail',
  'Shopping Mall': 'retail',

  // Automotive
  'Car Dealership': 'automotive',
  'Auto Repair': 'automotive',
  'Car Wash': 'automotive',
  'Car Rental': 'automotive',
  'Gas Station': 'automotive',

  // Healthcare (non-dental)
  'Medical Practice': 'healthcare',
  'Hospital': 'healthcare',
  'Pharmacy': 'healthcare',
  'Physiotherapist': 'healthcare',
  'Veterinary Clinic': 'healthcare',
  'Chiropractor': 'healthcare',
  'Optician': 'healthcare',

  // Hospitality
  'Hotel': 'hospitality',
  'Bed & Breakfast': 'hospitality',
  'Campground': 'hospitality',
};

// Place types to family mapping (from Google Places API types)
const PLACE_TYPE_TO_FAMILY: Record<string, CategoryFamily> = {
  // Dental
  'dentist': 'dental_general',
  'orthodontist': 'dental_ortho',
  
  // Food & Drink
  'restaurant': 'restaurant',
  'bar': 'restaurant',
  'night_club': 'restaurant',
  'cafe': 'cafe',
  'bakery': 'cafe',
  'meal_delivery': 'restaurant',
  'meal_takeaway': 'restaurant',
  
  // Professional Services
  'lawyer': 'law_firm',
  'accounting': 'professional_services',
  'insurance_agency': 'professional_services',
  'real_estate_agency': 'real_estate',
  'travel_agency': 'professional_services',
  
  // Trades
  'plumber': 'plumber',
  'electrician': 'plumber',
  'general_contractor': 'plumber',
  'roofing_contractor': 'plumber',
  'locksmith': 'plumber',
  'painter': 'plumber',
  'moving_company': 'plumber',
  
  // Fitness & Beauty
  'gym': 'gym',
  'beauty_salon': 'salon',
  'hair_care': 'salon',
  'spa': 'salon',

  // Retail
  'store': 'retail',
  'clothing_store': 'retail',
  'shoe_store': 'retail',
  'jewelry_store': 'retail',
  'furniture_store': 'retail',
  'home_goods_store': 'retail',
  'hardware_store': 'retail',
  'electronics_store': 'retail',
  'pet_store': 'retail',
  'book_store': 'retail',
  'bicycle_store': 'retail',
  'convenience_store': 'retail',
  'department_store': 'retail',
  'liquor_store': 'retail',
  'sporting_goods_store': 'retail',
  'gift_shop': 'retail',
  'florist': 'retail',
  'supermarket': 'retail',
  'grocery_or_supermarket': 'retail',
  'shopping_mall': 'retail',

  // Automotive
  'car_dealer': 'automotive',
  'car_repair': 'automotive',
  'car_wash': 'automotive',
  'car_rental': 'automotive',
  'gas_station': 'automotive',

  // Healthcare
  'doctor': 'healthcare',
  'hospital': 'healthcare',
  'pharmacy': 'healthcare',
  'physiotherapist': 'healthcare',
  'veterinary_care': 'healthcare',
  'chiropractor': 'healthcare',

  // Hospitality
  'lodging': 'hospitality',
  'hotel': 'hospitality',
};

// Service keywords by family
export const SERVICE_KEYWORDS_BY_FAMILY: Record<CategoryFamily, string[]> = {
  dental_ortho: [
    'orthodontist',
    'orthodontics',
    'braces',
    'invisalign',
    'clear aligners',
    'aligners',
    'teeth straightening',
    'retainers',
    'orthodontic treatment',
    'metal braces',
    'ceramic braces',
    'lingual braces',
  ],
  dental_general: [
    'dentist',
    'dental',
    'teeth cleaning',
    'dental checkup',
    'dental exam',
    'fillings',
    'root canal',
    'dental implants',
    'teeth cleaning',
    'oral hygiene',
  ],
  restaurant: [
    'restaurant',
    'dining',
    'food',
    'cuisine',
    'menu',
    'dinner',
    'lunch',
    'brunch',
    'breakfast',
  ],
  cafe: [
    'cafe',
    'coffee',
    'espresso',
    'latte',
    'cappuccino',
    'pastries',
    'bakery',
    'breakfast',
    'brunch',
  ],
  plumber: [
    'plumber',
    'plumbing',
    'pipe repair',
    'leak repair',
    'drain cleaning',
    'water heater',
    'bathroom installation',
    'kitchen plumbing',
  ],
  law_firm: [
    'lawyer',
    'attorney',
    'legal services',
    'legal advice',
    'law firm',
    'litigation',
    'legal representation',
  ],
  real_estate: [
    'real estate',
    'property',
    'real estate agent',
    'home sales',
    'property listings',
    'real estate agency',
  ],
  gym: [
    'gym',
    'fitness',
    'workout',
    'personal training',
    'fitness center',
    'exercise',
    'training',
  ],
  salon: [
    'salon',
    'hair salon',
    'beauty salon',
    'haircut',
    'styling',
    'hair color',
    'manicure',
    'pedicure',
    'facial',
  ],
  retail: [
    'store',
    'shop',
    'shopping',
  ],
  automotive: [
    'auto',
    'car',
    'vehicle',
    'automotive',
    'mechanic',
  ],
  healthcare: [
    'doctor',
    'medical',
    'health',
    'clinic',
    'healthcare',
  ],
  hospitality: [
    'hotel',
    'accommodation',
    'lodging',
    'stay',
    'guest house',
  ],
  professional_services: [
    'consulting',
    'advisory',
    'professional',
  ],
  generic_local_business: [
    'business',
    'local business',
  ],
};

// Blocked terms that should never appear in queries
export const BLOCKED_TERMS = new Set([
  'consultation',
  'services',
  'solutions',
  'service',
  'solution',
  'best services',
  'best solution',
  'best consultation',
  'contact',
  'about',
  'home',
  'welcome',
  'page',
  'site',
  'website',
]);

/**
 * Resolve category family from category label and place types
 */
export function resolveCategoryFamily(
  categoryLabel: string | null,
  placeTypes: string[] = []
): CategoryFamily {
  // First try category label
  if (categoryLabel && CATEGORY_TO_FAMILY[categoryLabel]) {
    return CATEGORY_TO_FAMILY[categoryLabel];
  }
  
  // Then try place types (check primary type first)
  for (const type of placeTypes) {
    if (PLACE_TYPE_TO_FAMILY[type]) {
      return PLACE_TYPE_TO_FAMILY[type];
    }
  }
  
  // Fallback to generic
  return 'generic_local_business';
}

/**
 * Get allowed service keywords for a family
 */
export function getAllowedServiceKeywords(family: CategoryFamily): string[] {
  return SERVICE_KEYWORDS_BY_FAMILY[family] || SERVICE_KEYWORDS_BY_FAMILY.generic_local_business;
}

/**
 * Check if a keyword is blocked
 */
export function isBlockedKeyword(keyword: string): boolean {
  const lower = keyword.toLowerCase().trim();
  
  // Check exact match
  if (BLOCKED_TERMS.has(lower)) {
    return true;
  }
  
  // Check if it contains blocked terms as standalone words
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (BLOCKED_TERMS.has(word)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Filter and validate service keywords based on family
 */
export function filterServiceKeywordsByFamily(
  keywords: string[],
  family: CategoryFamily
): { allowed: string[]; rejected: string[] } {
  const allowed: string[] = [];
  const rejected: string[] = [];
  const allowedSet = new Set(getAllowedServiceKeywords(family).map(k => k.toLowerCase()));
  
  for (const kw of keywords) {
    const lower = kw.toLowerCase().trim();
    
    // Skip if blocked
    if (isBlockedKeyword(lower)) {
      rejected.push(`${kw} (blocked term)`);
      continue;
    }
    
    // Check if it matches an allowed keyword (exact or contains)
    const matches = Array.from(allowedSet).some(allowedKw => {
      return lower === allowedKw || 
             lower.includes(allowedKw) || 
             allowedKw.includes(lower);
    });
    
    if (matches) {
      allowed.push(kw);
    } else {
      rejected.push(`${kw} (not in family allowed list)`);
    }
  }
  
  return { allowed, rejected };
}
