/**
 * AI-powered presence analysis functions
 */

import { getOpenAIClient, AnalysisResult, ConsistencyResult, ReviewAnalysisResult } from './openaiClient';
import type {
  SentimentAnalysisSnapshot,
  ThematicSentimentSnapshot,
  CompetitiveBenchmarkSnapshot,
} from '@/lib/report/snapshotTypes';
import type { WebsiteSummary, GbpSummary } from '@/lib/report/aiDataSummaries';

interface SocialMediaProfile {
  platform: 'instagram' | 'facebook' | 'website';
  biography?: string | null;
  description?: string | null;
  website?: string | null;
  category?: string | null;
  phone?: string | null;
  address?: string | null;
  hours?: string | null;
  followerCount?: number | null;
  postCount?: number | null;
  /** Instagram-only: from scraper */
  fullName?: string | null;
  isVerified?: boolean | null;
  isBusinessAccount?: boolean | null;
}

interface Review {
  text: string;
  rating: number;
  authorName?: string;
  relativeTime?: string;
}

/**
 * Analyze social media profile in business context
 */
export async function analyzeSocialProfile(
  businessName: string,
  businessCategory: string,
  profile: SocialMediaProfile
): Promise<AnalysisResult> {
  const openai = getOpenAIClient();

  const prompt = `You are an expert social media analyst for local businesses. Analyze this ${profile.platform} profile for "${businessName}" (${businessCategory}).

Profile Data:
- Biography/Description: ${profile.biography || profile.description || 'Not set'}
- Website Link: ${profile.website || 'Not set'}
- Category: ${profile.category || 'Not set'}
- Phone: ${profile.phone || 'Not set'}
- Address: ${profile.address || 'Not set'}
- Hours: ${profile.hours || 'Not set'}
${profile.followerCount != null ? `- Followers: ${profile.followerCount}` : ''}
${profile.postCount != null ? `- Posts: ${profile.postCount}` : ''}
${profile.platform === 'instagram' && profile.fullName ? `- Display name: ${profile.fullName}` : ''}
${profile.platform === 'instagram' && profile.isVerified != null ? `- Verified: ${profile.isVerified}` : ''}
${profile.platform === 'instagram' && profile.isBusinessAccount != null ? `- Business account: ${profile.isBusinessAccount}` : ''}

Analyze:
1. Is the biography/description compelling and relevant to the business type?
2. Does it include relevant keywords for discoverability?
3. Is contact information complete and professional?
4. Are there any red flags or missed opportunities?

Respond in JSON format:
{
  "score": <0-100>,
  "summary": "<2-3 sentence summary>",
  "issues": [
    {
      "severity": "critical|warning|info",
      "category": "<category>",
      "issue": "<specific issue>",
      "recommendation": "<actionable fix>"
    }
  ],
  "highlights": ["<positive aspect 1>", "<positive aspect 2>"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    return JSON.parse(content) as AnalysisResult;
  } catch (error) {
    console.error('Error analyzing social profile:', error);
    return {
      score: 50,
      summary: 'Unable to analyze profile at this time.',
      issues: [],
      highlights: [],
    };
  }
}

/**
 * Analyze cross-platform consistency
 */
export async function analyzeConsistency(
  businessName: string,
  profiles: SocialMediaProfile[]
): Promise<ConsistencyResult> {
  const openai = getOpenAIClient();

  // Build comparison data
  const platformData = profiles.map(p => ({
    platform: p.platform,
    name: businessName,
    description: p.biography || p.description || null,
    website: p.website || null,
    phone: p.phone || null,
    address: p.address || null,
    hours: p.hours || null,
  }));

  const prompt = `You are a business consistency analyst. Check if "${businessName}" has consistent information across platforms.

Platform Data:
${JSON.stringify(platformData, null, 2)}

Analyze:
1. Are phone numbers consistent (if present)?
2. Are addresses consistent (if present)?
3. Are business hours consistent (if present)?
4. Are website URLs consistent (if present)?
5. Are descriptions/bios aligned in messaging?
6. What critical information is missing from each platform?

Respond in JSON format:
{
  "isConsistent": <true|false>,
  "score": <0-100>,
  "inconsistencies": [
    {
      "field": "<field name>",
      "platforms": ["<platform1>", "<platform2>"],
      "values": {"<platform>": "<value>"},
      "recommendation": "<how to fix>"
    }
  ],
  "missingInfo": [
    {
      "field": "<field name>",
      "missingFrom": ["<platform1>", "<platform2>"]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    return JSON.parse(content) as ConsistencyResult;
  } catch (error) {
    console.error('Error analyzing consistency:', error);
    return {
      isConsistent: true,
      score: 50,
      inconsistencies: [],
      missingInfo: [],
    };
  }
}

/**
 * Analyze Google reviews and identify pain points.
 * Optional gbpContext (GBP description, hours, etc.) helps interpret reviews in context.
 */
export async function analyzeReviews(
  businessName: string,
  businessCategory: string,
  reviews: Review[],
  gbpContext?: string
): Promise<ReviewAnalysisResult> {
  const openai = getOpenAIClient();

  if (reviews.length === 0) {
    return {
      overallSentiment: 'mixed',
      sentimentScore: 50,
      totalReviews: 0,
      painPoints: [],
      strengths: [],
      summary: 'No reviews available for analysis.',
    };
  }

  // Limit to most recent 50 reviews for analysis
  const reviewsToAnalyze = reviews.slice(0, 50);
  const reviewTexts = reviewsToAnalyze.map((r, i) =>
    `Review ${i + 1} (${r.rating}★): "${r.text}"`
  ).join('\n\n');
  const contextBlock = gbpContext ? `Business context (Google Business Profile):\n${gbpContext}\n\n` : '';

  const prompt = `You are a customer feedback analyst for local businesses. Analyze these Google reviews for "${businessName}" (${businessCategory}).
${contextBlock}Reviews (${reviewsToAnalyze.length} of ${reviews.length} total):
${reviewTexts}

Identify:
1. Common pain points customers mention (service issues, wait times, quality, staff, etc.)
2. Patterns in negative feedback
3. Strengths that customers consistently praise
4. Actionable recommendations for improvement

Respond in JSON format:
{
  "overallSentiment": "positive|mixed|negative",
  "sentimentScore": <0-100>,
  "totalReviews": ${reviews.length},
  "painPoints": [
    {
      "topic": "<pain point topic>",
      "frequency": <number of mentions>,
      "severity": "high|medium|low",
      "exampleReviews": ["<quote 1>", "<quote 2>"],
      "recommendation": "<actionable fix>"
    }
  ],
  "strengths": [
    {
      "topic": "<strength topic>",
      "frequency": <number of mentions>,
      "exampleReviews": ["<quote 1>", "<quote 2>"]
    }
  ],
  "summary": "<2-3 sentence overall summary>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    return JSON.parse(content) as ReviewAnalysisResult;
  } catch (error) {
    console.error('Error analyzing reviews:', error);
    return {
      overallSentiment: 'mixed',
      sentimentScore: 50,
      totalReviews: reviews.length,
      painPoints: [],
      strengths: [],
      summary: 'Unable to analyze reviews at this time.',
    };
  }
}

/**
 * Analyze social media comments for engagement insights.
 * Optional recentCaptions (Instagram post captions) give context on what the business posts.
 */
export async function analyzeComments(
  businessName: string,
  platform: 'instagram' | 'facebook',
  comments: Array<{ text: string; postContext?: string }>,
  recentCaptions?: Array<{ caption: string; date?: string }>
): Promise<AnalysisResult> {
  const openai = getOpenAIClient();

  if (comments.length === 0 && !(recentCaptions && recentCaptions.length > 0)) {
    return {
      score: 50,
      summary: 'No comments or post content available for analysis.',
      issues: [],
      highlights: [],
    };
  }

  const commentTexts = comments.slice(0, 30).map((c, i) =>
    `Comment ${i + 1}: "${c.text}"${c.postContext ? ` (on: ${c.postContext})` : ''}`
  ).join('\n');
  const captionContext =
    recentCaptions && recentCaptions.length > 0
      ? `\nRecent post captions from the business (for context on what they post):\n${recentCaptions
          .slice(0, 10)
          .map((cap, i) => `Post ${i + 1}${cap.date ? ` (${cap.date})` : ''}: "${cap.caption.slice(0, 300)}${cap.caption.length > 300 ? '…' : ''}"`)
          .join('\n')}\n`
      : '';

  const prompt = `You are a social media engagement analyst. Analyze these ${platform} comments for "${businessName}".${captionContext}

Comments:
${commentTexts || '(None provided)'}

Analyze:
1. What are customers asking about most? (unanswered questions)
2. What complaints or concerns appear in comments?
3. What positive feedback patterns emerge?
4. Are there engagement opportunities being missed?
5. What should the business respond to or address?

Respond in JSON format:
{
  "score": <0-100 engagement quality score>,
  "summary": "<2-3 sentence summary>",
  "issues": [
    {
      "severity": "critical|warning|info",
      "category": "<category like 'Unanswered Questions', 'Complaints', 'Missed Opportunities'>",
      "issue": "<specific issue>",
      "recommendation": "<actionable fix>"
    }
  ],
  "highlights": ["<positive engagement pattern 1>", "<positive pattern 2>"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    return JSON.parse(content) as AnalysisResult;
  } catch (error) {
    console.error('Error analyzing comments:', error);
    return {
      score: 50,
      summary: 'Unable to analyze comments at this time.',
      issues: [],
      highlights: [],
    };
  }
}

/**
 * Full presence analysis combining all sources
 */
export interface FullPresenceAnalysis {
  instagram?: AnalysisResult;
  facebook?: AnalysisResult;
  consistency: ConsistencyResult;
  reviews: ReviewAnalysisResult;
  instagramComments?: AnalysisResult;
  facebookComments?: AnalysisResult;
  sentimentAnalysis?: SentimentAnalysisSnapshot;
  thematicSentiment?: ThematicSentimentSnapshot;
  competitiveBenchmark?: CompetitiveBenchmarkSnapshot;
  overallScore: number;
  topPriorities: Array<{
    priority: number;
    source: string;
    issue: string;
    recommendation: string;
  }>;
}

/** User category scores as 0-100 percentages for competitive analysis */
export interface UserScoresPct {
  searchResults: number;
  websiteExperience: number;
  localListings: number;
  socialPresence: number;
}

/** Competitor summary for AI */
export interface CompetitorSummary {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  rank: number;
}

/**
 * Combined sentiment analysis of GBP reviews + Instagram comments (Voice of the Customer)
 */
export async function analyzeSentiment(
  businessName: string,
  businessCategory: string,
  reviews: Review[],
  instagramComments: Array<{ text: string; postContext?: string }>
): Promise<SentimentAnalysisSnapshot> {
  const openai = getOpenAIClient();

  const hasReviews = reviews.length > 0;
  const hasComments = instagramComments.length > 0;
  if (!hasReviews && !hasComments) {
    return {
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      combinedSummary: 'No reviews or comments available for sentiment analysis.',
    };
  }

  const reviewLines = hasReviews
    ? reviews.slice(0, 50).map((r, i) => `Review ${i + 1} (${r.rating}★): "${r.text}"`).join('\n\n')
    : '';
  const commentLines = hasComments
    ? instagramComments.slice(0, 30).map((c, i) =>
        `Comment ${i + 1}: "${c.text}"${c.postContext ? ` (on: ${c.postContext})` : ''}`
      ).join('\n')
    : '';

  const prompt = `You are a customer feedback analyst. Analyze the combined feedback below for "${businessName}" (${businessCategory}).

${hasReviews ? `Google Reviews (${Math.min(reviews.length, 50)} shown):\n${reviewLines}` : ''}
${hasReviews && hasComments ? '\n' : ''}
${hasComments ? `Instagram Comments (${Math.min(instagramComments.length, 30)} shown):\n${commentLines}` : ''}

Tasks:
1. Classify each piece of feedback as Positive, Neutral, or Negative. Count how many fall into each category.
2. Write a concise "Voice of the Customer" summary (2-4 sentences) that highlights common themes across BOTH reviews and comments: what customers love, what they complain about, and any repeated requests or concerns.

Respond with ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "positiveCount": <number>,
  "neutralCount": <number>,
  "negativeCount": <number>,
  "combinedSummary": "<2-4 sentence Voice of the Customer summary>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(content) as SentimentAnalysisSnapshot;
    if (
      typeof parsed.positiveCount !== 'number' ||
      typeof parsed.neutralCount !== 'number' ||
      typeof parsed.negativeCount !== 'number' ||
      typeof parsed.combinedSummary !== 'string'
    ) {
      throw new Error('Invalid sentiment response shape');
    }
    return parsed;
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    const total = reviews.length + instagramComments.length;
    return {
      positiveCount: 0,
      neutralCount: total,
      negativeCount: 0,
      combinedSummary: 'Unable to analyze sentiment at this time.',
    };
  }
}

/**
 * Thematic sentiment: Service, Food, Atmosphere, Value (0-100 each)
 */
export async function analyzeThematicSentiment(
  businessName: string,
  businessCategory: string,
  reviews: Review[],
  instagramComments: Array<{ text: string; postContext?: string }>
): Promise<ThematicSentimentSnapshot> {
  const openai = getOpenAIClient();

  const hasReviews = reviews.length > 0;
  const hasComments = instagramComments.length > 0;
  if (!hasReviews && !hasComments) {
    return { service: 50, food: 50, atmosphere: 50, value: 50 };
  }

  const reviewLines = hasReviews
    ? reviews.slice(0, 50).map((r, i) => `Review ${i + 1} (${r.rating}★): "${r.text}"`).join('\n\n')
    : '';
  const commentLines = hasComments
    ? instagramComments.slice(0, 30).map((c, i) =>
        `Comment ${i + 1}: "${c.text}"${c.postContext ? ` (on: ${c.postContext})` : ''}`
      ).join('\n')
    : '';

  const prompt = `You are a customer feedback analyst. Analyze the combined feedback below for "${businessName}" (${businessCategory}).

${hasReviews ? `Google Reviews:\n${reviewLines}` : ''}
${hasReviews && hasComments ? '\n' : ''}
${hasComments ? `Instagram Comments:\n${commentLines}` : ''}

Tasks:
1. Score sentiment by theme from 0-100 (0=very negative, 100=very positive). Categories: Service (staff, wait times, booking, responsiveness), Food (quality, taste, menu; or product quality if not food), Atmosphere (ambiance, cleanliness, location, vibe), Value (price vs quality, worth the money).
2. For EACH category, provide: (a) "justification": a 2-sentence explanation of why that score was given; (b) "supportingQuotes": an array of 2-3 exact short quotes from the reviews or comments above that justify the score (use verbatim phrases in quotes).

Respond with ONLY valid JSON (no markdown). Use this exact shape:
{
  "service": <0-100>,
  "food": <0-100>,
  "atmosphere": <0-100>,
  "value": <0-100>,
  "categoryDetails": {
    "service": { "justification": "<2 sentences>", "supportingQuotes": ["<quote 1>", "<quote 2>"] },
    "food": { "justification": "<2 sentences>", "supportingQuotes": ["<quote 1>", "<quote 2>"] },
    "atmosphere": { "justification": "<2 sentences>", "supportingQuotes": ["<quote 1>", "<quote 2>"] },
    "value": { "justification": "<2 sentences>", "supportingQuotes": ["<quote 1>", "<quote 2>"] }
  }
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(content);
    const clamp = (n: number) => Math.min(100, Math.max(0, typeof n === 'number' ? n : 50));
    const result: ThematicSentimentSnapshot = {
      service: clamp(parsed.service),
      food: clamp(parsed.food),
      atmosphere: clamp(parsed.atmosphere),
      value: clamp(parsed.value),
    };
    if (parsed.categoryDetails && typeof parsed.categoryDetails === 'object') {
      const d = parsed.categoryDetails;
      const mk = (k: 'service' | 'food' | 'atmosphere' | 'value') => ({
        justification: typeof d[k]?.justification === 'string' ? d[k].justification : '',
        supportingQuotes: Array.isArray(d[k]?.supportingQuotes) ? d[k].supportingQuotes.filter((q: unknown) => typeof q === 'string').slice(0, 3) : [],
      });
      result.categoryDetails = { service: mk('service'), food: mk('food'), atmosphere: mk('atmosphere'), value: mk('value') };
    }
    return result;
  } catch (error) {
    console.error('Error analyzing thematic sentiment:', error);
    return { service: 50, food: 50, atmosphere: 50, value: 50 };
  }
}

/**
 * Competitive benchmark: market leader average + advantage/gap/impact narrative
 * Optional thematicSentiment + searchVisibilityScore for "Missed Connections" insight.
 */
export async function analyzeCompetitiveBenchmark(
  businessName: string,
  businessCategory: string,
  userScores: UserScoresPct,
  competitors: CompetitorSummary[],
  userRank: number | null,
  options?: { thematicSentiment?: ThematicSentimentSnapshot; searchVisibilityScore?: number }
): Promise<CompetitiveBenchmarkSnapshot> {
  const openai = getOpenAIClient();

  const top3 = competitors.filter(c => !c.isTargetBusiness).slice(0, 3);
  if (top3.length === 0) {
    return {
      marketLeaderAverage: {
        searchResults: 75,
        websiteExperience: 75,
        localListings: 75,
        socialPresence: 75,
      },
      competitiveAdvantage: 'No competitor data available yet.',
      urgentGap: 'Improve visibility and presence to outrank local competitors once data is available.',
      potentialImpact: 'Strengthening your online presence can help you capture more local search and foot traffic.',
    };
  }

  const compList = top3.map(c => `${c.name} (rating: ${c.rating ?? 'N/A'}, reviews: ${c.reviewCount ?? 0}, rank: ${c.rank})`).join('\n');
  const thematic = options?.thematicSentiment;
  const searchVis = options?.searchVisibilityScore ?? 0;
  const highSentiment = thematic && (thematic.service > 85 || thematic.food > 85 || thematic.atmosphere > 85 || thematic.value > 85);
  const lowVisibility = searchVis < 70;
  const useMissedConnections = highSentiment && lowVisibility;

  const impactInstruction = useMissedConnections
    ? `PRIORITY: Generate a "Missed Connections" potentialImpact. Customers love something (high sentiment in reviews) but the business has low search visibility (${searchVis}%). Example: "Your customers rave about your [specific thing, e.g. 'Irish Mojito'] (X mentions), but you aren't ranking for '[relevant local query, e.g. best cocktails in Camps Bay].' Fixing your website metadata could bridge this gap." Use the business category and any strong sentiment themes to make it specific.`
    : `Write ONE "Potential Impact" sentence: revenue/search opportunity. Example: "By closing the Website Experience gap with [Competitor], you could capture a larger share of the search volume for '[relevant query]'." If review/sentiment data is sparse, use the general Website Experience revenue gap.`;

  const prompt = `You are a local business competitive analyst. The business "${businessName}" (${businessCategory}) has these category scores (0-100): Search Results ${userScores.searchResults}, Website Experience ${userScores.websiteExperience}, Local Listings ${userScores.localListings}, Social Presence ${userScores.socialPresence}. Their rank vs competitors: ${userRank ?? 'unknown'}. Search visibility score: ${searchVis}%.
${thematic ? `Thematic sentiment (reviews/comments): Service ${thematic.service}, Food ${thematic.food}, Atmosphere ${thematic.atmosphere}, Value ${thematic.value}.` : ''}

Top competitors in the market:
${compList}

Tasks:
1. Estimate the "Market Leader Average" for the top 3 competitors: four scores 0-100 for searchResults, websiteExperience, localListings, socialPresence (typical strong local businesses in this category).
2. Identify ONE specific "Competitive Advantage": what "${businessName}" does BETTER than the top 3 (e.g. stronger social presence, better reviews).
3. Identify ONE "Urgent Gap": what the top 3 are doing that "${businessName}" is missing or underperforming on.
4. potentialImpact: ${impactInstruction}

Respond with ONLY valid JSON (no markdown):
{
  "marketLeaderAverage": {
    "searchResults": <0-100>,
    "websiteExperience": <0-100>,
    "localListings": <0-100>,
    "socialPresence": <0-100>
  },
  "competitiveAdvantage": "<one sentence>",
  "urgentGap": "<one sentence>",
  "potentialImpact": "<one sentence>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(content) as CompetitiveBenchmarkSnapshot;
    const avg = parsed.marketLeaderAverage;
    const clamp = (n: number) => Math.min(100, Math.max(0, typeof n === 'number' ? n : 75));
    return {
      marketLeaderAverage: {
        searchResults: clamp(avg?.searchResults ?? 75),
        websiteExperience: clamp(avg?.websiteExperience ?? 75),
        localListings: clamp(avg?.localListings ?? 75),
        socialPresence: clamp(avg?.socialPresence ?? 75),
      },
      competitiveAdvantage: typeof parsed.competitiveAdvantage === 'string' ? parsed.competitiveAdvantage : 'Strong local presence.',
      urgentGap: typeof parsed.urgentGap === 'string' ? parsed.urgentGap : 'Improve category scores to match top competitors.',
      potentialImpact: typeof parsed.potentialImpact === 'string' ? parsed.potentialImpact : 'Closing the gap with market leaders can increase visibility and revenue.',
    };
  } catch (error) {
    console.error('Error analyzing competitive benchmark:', error);
    return {
      marketLeaderAverage: {
        searchResults: 75,
        websiteExperience: 75,
        localListings: 75,
        socialPresence: 75,
      },
      competitiveAdvantage: 'Unable to analyze competitors at this time.',
      urgentGap: 'Focus on improving your weakest category to compete with top-ranked businesses.',
      potentialImpact: 'Improving your online presence can help capture more local search and customer demand.',
    };
  }
}

/** Serialize GBP summary for AI context (reviews analysis) */
function gbpSummaryToContext(gbp: GbpSummary): string {
  const parts: string[] = [];
  if (gbp.description) parts.push(`Description: ${gbp.description}`);
  if (gbp.category_label) parts.push(`Category: ${gbp.category_label}`);
  if (gbp.types?.length) parts.push(`Types: ${gbp.types.join(', ')}`);
  if (gbp.opening_hours?.weekday_text?.length) parts.push(`Hours: ${gbp.opening_hours.weekday_text.join('; ')}`);
  if (gbp.rating != null) parts.push(`Rating: ${gbp.rating} (${gbp.review_count ?? 0} reviews)`);
  if (gbp.gbp_checks?.description_keyword_match_pct != null) parts.push(`Description keyword match: ${gbp.gbp_checks.description_keyword_match_pct}%`);
  if (gbp.gbp_checks?.checklist_summary?.length) parts.push(`Checklist: ${gbp.gbp_checks.checklist_summary.join('; ')}`);
  return parts.join('\n');
}

/** Build website profile for consistency/AI from curated website summary */
function websiteSummaryToProfile(summary: WebsiteSummary): SocialMediaProfile {
  const homepage = summary.homepage;
  const contact = homepage?.contact_methods;
  const desc = homepage?.meta_description || homepage?.title || summary.business_identity?.business_name || null;
  return {
    platform: 'website',
    description: desc ?? null,
    phone: contact?.phone?.[0] ?? null,
    address: null,
    hours: null,
    website: summary.site_overview?.homepage_url ?? null,
    category: summary.business_identity?.category_label ?? null,
  };
}

export async function analyzeFullPresence(
  businessName: string,
  businessCategory: string,
  data: {
    instagram?: SocialMediaProfile;
    facebook?: SocialMediaProfile;
    website?: SocialMediaProfile;
    reviews?: Review[];
    instagramComments?: Array<{ text: string; postContext?: string }>;
    facebookComments?: Array<{ text: string; postContext?: string }>;
    /** Optional: recent post captions for richer Instagram analysis */
    instagramRecentCaptions?: Array<{ caption: string; date?: string }>;
    /** Optional: curated website crawl summary (not full crawl) */
    websiteSummary?: WebsiteSummary | null;
    /** Optional: curated GBP summary for reviews context */
    gbpSummary?: GbpSummary | null;
    /** Optional: for competitive benchmark (market leader avg + narrative) */
    competitors?: CompetitorSummary[];
    userRank?: number | null;
    userScores?: UserScoresPct;
    /** Optional: for "Missed Connections" insight (review-first potentialImpact) */
    searchVisibilityScore?: number;
  }
): Promise<FullPresenceAnalysis> {
  // Use curated website summary to build website profile when provided (so consistency gets real data)
  const websiteProfile: SocialMediaProfile | undefined =
    data.websiteSummary ? websiteSummaryToProfile(data.websiteSummary) : data.website;
  const gbpContext = data.gbpSummary ? gbpSummaryToContext(data.gbpSummary) : undefined;

  const results: FullPresenceAnalysis = {
    consistency: {
      isConsistent: true,
      score: 100,
      inconsistencies: [],
      missingInfo: [],
    },
    reviews: {
      overallSentiment: 'mixed',
      sentimentScore: 50,
      totalReviews: 0,
      painPoints: [],
      strengths: [],
      summary: 'No reviews provided.',
    },
    overallScore: 0,
    topPriorities: [],
  };

  // Run analyses in parallel
  const promises: Promise<void>[] = [];

  // Instagram profile analysis
  if (data.instagram) {
    promises.push(
      analyzeSocialProfile(businessName, businessCategory, data.instagram)
        .then(r => { results.instagram = r; })
    );
  }

  // Facebook profile analysis
  if (data.facebook) {
    promises.push(
      analyzeSocialProfile(businessName, businessCategory, data.facebook)
        .then(r => { results.facebook = r; })
    );
  }

  // Consistency analysis (use website profile from websiteSummary when available)
  const profiles = [data.instagram, data.facebook, websiteProfile].filter(Boolean) as SocialMediaProfile[];
  if (profiles.length >= 2) {
    promises.push(
      analyzeConsistency(businessName, profiles)
        .then(r => { results.consistency = r; })
    );
  }

  // Reviews analysis (with GBP context when available)
  if (data.reviews && data.reviews.length > 0) {
    promises.push(
      analyzeReviews(businessName, businessCategory, data.reviews, gbpContext)
        .then(r => { results.reviews = r; })
    );
  }

  // Comments analysis (with recent post captions when available)
  if (data.instagramComments && data.instagramComments.length > 0) {
    promises.push(
      analyzeComments(businessName, 'instagram', data.instagramComments, data.instagramRecentCaptions)
        .then(r => { results.instagramComments = r; })
    );
  }

  if (data.facebookComments && data.facebookComments.length > 0) {
    promises.push(
      analyzeComments(businessName, 'facebook', data.facebookComments)
        .then(r => { results.facebookComments = r; })
    );
  }

  // Thematic sentiment (Service, Food, Atmosphere, Value)
  const hasReviews = (data.reviews?.length ?? 0) > 0;
  const hasComments = (data.instagramComments?.length ?? 0) > 0;
  if (hasReviews || hasComments) {
    promises.push(
      analyzeThematicSentiment(
        businessName,
        businessCategory,
        data.reviews ?? [],
        data.instagramComments ?? []
      ).then(r => { results.thematicSentiment = r; })
    );
  }

  await Promise.allSettled(promises);

  // Competitive benchmark runs after thematic so potentialImpact can use "Missed Connections" when high sentiment + low visibility
  if (data.competitors && data.competitors.length > 0 && data.userScores) {
    const benchmark = await analyzeCompetitiveBenchmark(
      businessName,
      businessCategory,
      data.userScores,
      data.competitors,
      data.userRank ?? null,
      {
        thematicSentiment: results.thematicSentiment,
        searchVisibilityScore: data.searchVisibilityScore,
      }
    );
    results.competitiveBenchmark = benchmark;
  }

  // Calculate overall score
  const scores: number[] = [];
  if (results.instagram) scores.push(results.instagram.score);
  if (results.facebook) scores.push(results.facebook.score);
  scores.push(results.consistency.score);
  scores.push(results.reviews.sentimentScore);

  results.overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 50;

  // Compile top priorities
  const allIssues: Array<{
    priority: number;
    source: string;
    issue: string;
    recommendation: string;
  }> = [];

  // Add issues from each source
  const severityWeight = { critical: 3, warning: 2, info: 1 };

  if (results.instagram?.issues) {
    results.instagram.issues.forEach(i => {
      allIssues.push({
        priority: severityWeight[i.severity],
        source: 'Instagram',
        issue: i.issue,
        recommendation: i.recommendation,
      });
    });
  }

  if (results.facebook?.issues) {
    results.facebook.issues.forEach(i => {
      allIssues.push({
        priority: severityWeight[i.severity],
        source: 'Facebook',
        issue: i.issue,
        recommendation: i.recommendation,
      });
    });
  }

  // Add consistency issues
  results.consistency.inconsistencies.forEach(i => {
    allIssues.push({
      priority: 3,
      source: 'Cross-platform',
      issue: `Inconsistent ${i.field} across ${i.platforms.join(', ')}`,
      recommendation: i.recommendation,
    });
  });

  // Add review pain points
  results.reviews.painPoints.forEach(p => {
    const priority = p.severity === 'high' ? 3 : p.severity === 'medium' ? 2 : 1;
    allIssues.push({
      priority,
      source: 'Google Reviews',
      issue: p.topic,
      recommendation: p.recommendation,
    });
  });

  // Sort by priority and take top 5
  results.topPriorities = allIssues
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  return results;
}
