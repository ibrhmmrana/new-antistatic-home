import Nav from "@/components/landing/Nav";
import Image from "next/image";

export const metadata = {
  title: "Privacy Policy | Antistatic",
  description: "Privacy Policy for Antistatic - How we collect, use, and protect your information",
};

export default function PrivacyPolicy() {
  return (
    <div className="relative min-h-screen">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/Most-Advanced-TPU_1.max-2500x2500 (1).png"
          alt="Background"
          fill
          priority
          className="object-cover"
          quality={90}
          style={{ opacity: 1 }}
        />
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-white/95" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Nav />
        <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-600 mb-8 text-sm md:text-base">Effective date: January 10, 2026</p>

        <div className="prose prose-lg max-w-none bg-white/80 backdrop-blur-sm rounded-2xl p-8 md:p-12 shadow-xl border border-gray-100">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">1) Who we are</h2>
            <p className="text-gray-700 leading-relaxed">
              Antistatic is a product operated by <strong>Sagentics (South Africa)</strong> ("Sagentics", "we", "us").
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mt-4">
              <li><strong>Location:</strong> Johannesburg, South Africa</li>
              <li><strong>Websites:</strong> antistatic.ai, app.antistatic.ai</li>
              <li><strong>Contact:</strong> <a href="mailto:hello@sagentics.ai" className="text-blue-600 hover:underline">hello@sagentics.ai</a></li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">2) Scope</h2>
            <p className="text-gray-700 leading-relaxed">
              This Privacy Policy explains how we collect, use, share, store, and protect personal information when you use Antistatic, including when you connect third-party accounts such as Google Business Profile, Instagram, Facebook Pages, and WhatsApp Business.
            </p>
            <p className="text-gray-700 leading-relaxed mt-4">
              Antistatic is intended for <strong>business customers (B2B)</strong>. Users must be <strong>18 years or older</strong>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">3) Information we collect</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">A) Account and profile information (provided by you)</h3>
            <p className="text-gray-700 leading-relaxed mb-3">
              When you create an account or use Antistatic, we may collect:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Business name</li>
              <li>Business address</li>
              <li>Role/title</li>
              <li>Password (stored securely using hashing; we do not store plaintext passwords)</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">B) Billing information</h3>
            <p className="text-gray-700 leading-relaxed">
              We use <strong>Stripe</strong> to process payments. We do <strong>not</strong> store full card details on our servers. Stripe may collect and process payment information as described in its own policies.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">C) Customer Data you upload or manage (on behalf of your business)</h3>
            <p className="text-gray-700 leading-relaxed mb-3">
              Antistatic lets business users store and manage data relating to their customers and leads ("Customer Data"), which may include:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Customer names</li>
              <li>Customer phone numbers</li>
              <li>Customer email addresses</li>
              <li>Messaging history (e.g., Instagram DM conversations, WhatsApp chat content)</li>
              <li>Other contact or lead details you upload (including via CSV import)</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              <strong>Important:</strong> For Customer Data, <strong>you (our business user) are the "controller"</strong> and we act as a <strong>"processor/operator"</strong> on your behalf.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">D) Third-party platform data (when you connect accounts)</h3>
            <p className="text-gray-700 leading-relaxed mb-3">
              If you connect accounts, we may access and store data needed to provide the service, including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Google Business Profile (GBP):</strong> profile details, reviews, ratings, metrics/insights, and content used to manage the profile.</li>
              <li><strong>Instagram Graph API:</strong> basic account/profile information, content publishing data, and messaging data (DMs) needed for inbox features.</li>
              <li><strong>Facebook Pages:</strong> page information, content/publishing data, and messaging/engagement data where applicable.</li>
              <li><strong>WhatsApp Business:</strong> messaging metadata and content needed to send/receive messages, depending on whether you use our WABA or your own WABA.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We only access the permissions you authorize during the connection process.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">E) AI/automation inputs (only when you request it)</h3>
            <p className="text-gray-700 leading-relaxed">
              Antistatic uses AI features <strong>only when you explicitly trigger them</strong> (for example, by clicking an "AI response generator" button). At that time, we may send relevant context (e.g., review text, message thread excerpt, comment text) to an AI provider to generate a suggestion.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">F) Usage data, cookies, and analytics</h3>
            <p className="text-gray-700 leading-relaxed mb-3">
              We may collect:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Device and browser information</li>
              <li>IP address (and approximate location derived from IP)</li>
              <li>Event/activity logs (e.g., page visits, feature usage, clicks)</li>
              <li>Cookies and similar technologies to keep you signed in, secure the service, and understand usage</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We use analytics tools (e.g., Google Analytics / PostHog / Mixpanel or similar) to measure usage and improve Antistatic.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">4) How we use information</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              We use information to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Provide, operate, and maintain Antistatic</li>
              <li>Create and manage your account</li>
              <li>Connect and operate third-party integrations (GBP, Instagram, Facebook Pages, WhatsApp)</li>
              <li>Enable communications (review requests via email/SMS/WhatsApp; inbox messaging; publishing)</li>
              <li>Provide AI suggestions when requested by you</li>
              <li>Process billing and subscriptions (via Stripe)</li>
              <li>Prevent fraud, abuse, and security incidents</li>
              <li>Troubleshoot, debug, and improve the product</li>
              <li>Comply with legal obligations and enforce our Terms</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">5) How we share information</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              We may share information with:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Service providers / subprocessors</strong> needed to run Antistatic, including:
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Vercel</strong> (hosting)</li>
                  <li><strong>Supabase</strong> (database/storage)</li>
                  <li><strong>AWS SES</strong> (email sending)</li>
                  <li><strong>AWS SNS</strong> (SMS sending)</li>
                  <li><strong>Stripe</strong> (payments)</li>
                  <li>Analytics providers (as configured)</li>
                  <li>AI providers (only when you trigger AI features)</li>
                </ul>
              </li>
              <li><strong>Third-party platforms you connect</strong> (e.g., Google/Meta) to perform actions you request (posting, replying, messaging).</li>
              <li><strong>Legal and safety:</strong> if required by law, court order, or to protect rights, safety, and prevent fraud/abuse.</li>
              <li><strong>Business transfers:</strong> if we are involved in a merger, acquisition, financing, or sale of assets.</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We do <strong>not</strong> sell your personal information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">6) Data retention</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li><strong>Account data:</strong> kept while your account is active and until you request deletion.</li>
              <li><strong>Message content logs:</strong> retained for <strong>60 days</strong> (then deleted or de-identified, unless required for security/legal reasons).</li>
              <li><strong>Backups:</strong> may persist for a limited period after deletion due to backup cycles (we aim to remove deleted data from active systems promptly; backups roll off on a schedule).</li>
              <li><strong>Third-party tokens and connection data:</strong> deleted <strong>immediately</strong> when you disconnect Instagram/Facebook (and similarly for other supported integrations), as described below.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">7) Disconnecting integrations (Instagram/Facebook)</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              If you disconnect Instagram/Facebook from Antistatic:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>We <strong>immediately delete access tokens</strong> and connection credentials.</li>
              <li>We <strong>stop collecting</strong> data from those accounts.</li>
              <li>Any cached analytics or related data for that connection is deleted promptly from our active systems.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">8) Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We use reasonable administrative, technical, and physical measures to protect information, including access controls and encryption where appropriate. No system is 100% secure, but we work to protect your data and improve our safeguards.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">9) International transfers</h2>
            <p className="text-gray-700 leading-relaxed">
              Because we serve users in South Africa and internationally, your data may be processed in countries other than where you live. We take steps designed to ensure appropriate protection consistent with applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">10) Your rights (POPIA, GDPR where applicable)</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Depending on your location, you may have rights to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Access your personal information</li>
              <li>Correct or update information</li>
              <li>Request deletion</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability (where applicable)</li>
              <li>Withdraw consent (where processing is based on consent)</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              To exercise rights, contact: <a href="mailto:hello@sagentics.ai" className="text-blue-600 hover:underline">hello@sagentics.ai</a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">11) Children</h2>
            <p className="text-gray-700 leading-relaxed">
              Antistatic is not intended for anyone under 18. We do not knowingly collect information from children.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">12) Changes to this policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will post the updated version and update the "Effective date."
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">13) Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              For privacy questions or requests: <a href="mailto:hello@sagentics.ai" className="text-blue-600 hover:underline">hello@sagentics.ai</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

