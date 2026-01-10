import Nav from "@/components/landing/Nav";
import Image from "next/image";

export const metadata = {
  title: "Terms of Service | Antistatic",
  description: "Terms of Service for Antistatic",
};

export default function TermsOfService() {
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
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-600 mb-8 text-sm md:text-base">Effective date: January 10, 2026</p>

        <div className="prose prose-lg max-w-none bg-white/80 backdrop-blur-sm rounded-2xl p-8 md:p-12 shadow-xl border border-gray-100">
          <p className="text-gray-700 leading-relaxed mb-8">
            These Terms of Service ("Terms") govern your access to and use of Antistatic ("Service"), operated by <strong>Sagentics (South Africa)</strong> ("Sagentics", "we", "us"). By using the Service, you agree to these Terms.
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">1) Eligibility</h2>
            <p className="text-gray-700 leading-relaxed">
              You must be <strong>18 years or older</strong> and using Antistatic for business purposes (B2B).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">2) Your account</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Keeping your login credentials secure</li>
              <li>All activity under your account</li>
              <li>Ensuring information you provide is accurate</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">3) Subscriptions and billing</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Paid plans are billed via <strong>Stripe</strong>.</li>
              <li>Fees, billing periods, and plan details are shown at checkout or in your account.</li>
              <li>Unless otherwise stated, subscription fees are non-refundable except where required by law.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">4) Integrations and third-party services</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Antistatic may integrate with third-party services such as Google Business Profile, Instagram, Facebook Pages, WhatsApp Business, and others.
            </p>
            <p className="text-gray-700 leading-relaxed mb-3">
              You acknowledge:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Your use of third-party services is also governed by their terms and policies.</li>
              <li>We are not responsible for third-party outages, changes, or policy enforcement.</li>
              <li>You are responsible for having the rights and permissions to connect and use those accounts.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">5) Customer Data (your customers/leads)</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              If you upload or manage Customer Data (e.g., your customers' phone numbers/emails/messages):
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>You represent that you have the right to collect, use, and share that Customer Data.</li>
              <li>You are responsible for complying with applicable laws (including POPIA and GDPR where applicable) in your handling of Customer Data.</li>
              <li>We process Customer Data to provide the Service as described in our Privacy Policy.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">6) Acceptable use</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Use the Service for unlawful, harmful, misleading, or abusive activities</li>
              <li>Send spam or unsolicited communications in violation of applicable law or platform rules</li>
              <li>Attempt to reverse engineer, disrupt, or compromise the Service</li>
              <li>Use the Service to infringe intellectual property rights or privacy rights</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              We may suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">7) AI features</h2>
            <p className="text-gray-700 leading-relaxed">
              AI suggestions are provided "as is" and may be inaccurate or inappropriate. You are responsible for reviewing and approving any AI-generated output before using it in your business communications.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">8) Intellectual property</h2>
            <p className="text-gray-700 leading-relaxed">
              We own the Service and its underlying software, design, and content (excluding your content and Customer Data). You receive a limited, non-exclusive, non-transferable right to use the Service during your subscription.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">9) Disclaimers</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is provided "as is" and "as available." We do not guarantee uninterrupted operation, error-free results, or specific business outcomes (e.g., review increases, rankings, conversions).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">10) Limitation of liability</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              To the maximum extent permitted by law, Sagentics will not be liable for indirect, incidental, special, consequential, or punitive damages, or loss of profits/revenue/data, arising from your use of the Service.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Our total liability for any claim will not exceed the amounts you paid to us for the Service in the <strong>3 months</strong> preceding the event giving rise to the claim (or a lower cap if required by law).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">11) Termination</h2>
            <p className="text-gray-700 leading-relaxed">
              You may stop using the Service at any time. We may suspend or terminate access if you violate these Terms or if required for legal/security reasons.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">12) Governing law</h2>
            <p className="text-gray-700 leading-relaxed">
              These Terms are governed by the laws of <strong>South Africa</strong>, unless mandatory local consumer protections apply.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">13) Contact</h2>
            <p className="text-gray-700 leading-relaxed">
              Questions about these Terms: <a href="mailto:hello@sagentics.ai" className="text-blue-600 hover:underline">hello@sagentics.ai</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

