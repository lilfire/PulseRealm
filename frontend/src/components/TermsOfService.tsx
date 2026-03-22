interface TermsOfServiceProps {
  onBack: () => void;
}

export function TermsOfService({ onBack }: TermsOfServiceProps) {
  return (
    <div className="tos-page">
      <header className="tos-header">
        <button className="tos-back" onClick={onBack}>&larr; Back</button>
        <span className="tos-header-title">Terms of Service</span>
      </header>
      <div className="tos-container">
        <h1>Terms of Service</h1>
        <p className="tos-updated">Last updated: March 19, 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using PulseRealm ("the Service"), you agree to be bound by these
            Terms of Service. If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            PulseRealm is a real-time treadmill workout platform that connects wearable devices
            to interactive gameplay modes via Bluetooth and local network connections. The Service
            is provided on an ephemeral, in-memory basis — no user accounts, workout history, or
            personal data are stored persistently. All realm data is discarded when a session ends.
          </p>
        </section>

        <section>
          <h2>3. Eligibility</h2>
          <p>
            You must be at least 13 years of age to use the Service. If you are under 18, you
            must have the consent of a parent or legal guardian. By using the Service, you
            represent that you meet these requirements.
          </p>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree to use the Service only for its intended purpose — participating in
            real-time workout realms. You must not:</p>
          <ul>
            <li>Attempt to disrupt or interfere with the Service or its infrastructure</li>
            <li>Use the Service for any unlawful purpose</li>
            <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            <li>Impersonate another person or misrepresent your identity</li>
            <li>Share realm join codes with unauthorized individuals</li>
            <li>Transmit false or manipulated biometric data to gain an unfair advantage</li>
          </ul>
        </section>

        <section>
          <h2>5. Health &amp; Safety Disclaimer</h2>
          <p>
            PulseRealm is not a medical device. Heart rate, step count, speed, and other metrics
            displayed are estimates derived from wearable sensor data and should not be relied
            upon for medical decisions. Always consult a healthcare professional before beginning
            any exercise program. You are solely responsible for monitoring your own physical
            condition during use. Stop exercising immediately if you experience pain, dizziness,
            or discomfort. You use the Service at your own risk.
          </p>
        </section>

        <section>
          <h2>6. Data &amp; Privacy</h2>
          <p>
            PulseRealm processes biometric data (heart rate, step count) and device information
            (display name, height for stride calculation) in real-time to power gameplay. This
            data is held in memory only for the duration of a realm session and is not persisted,
            stored, or shared with third parties. No user accounts or personal profiles are created.
          </p>
          <p>
            When you join a realm, other participants in the same realm can see your display name
            and real-time workout metrics (heart rate, steps, speed). By joining a realm, you
            consent to sharing this information with other participants for the duration of the
            session.
          </p>
        </section>

        <section>
          <h2>7. Third-Party Services</h2>
          <p>
            Certain modes may use third-party services such as Google Maps and YouTube. Your use
            of those features is subject to the respective third-party terms of service and
            privacy policies. PulseRealm is not responsible for the content, availability, or
            practices of third-party services.
          </p>
        </section>

        <section>
          <h2>8. Intellectual Property</h2>
          <p>
            All content, design, graphics, software, and other materials comprising the Service
            are the property of PulseRealm or its licensors and are protected by applicable
            intellectual property laws. You may not copy, modify, distribute, or create derivative
            works based on the Service without prior written consent.
          </p>
        </section>

        <section>
          <h2>9. Service Availability</h2>
          <p>
            The Service is provided over local network and internet connections and may be
            unavailable due to maintenance, network issues, or other factors beyond our control.
            We do not guarantee uninterrupted or error-free operation. We reserve the right to
            modify, suspend, or discontinue the Service at any time without notice.
          </p>
        </section>

        <section>
          <h2>10. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind,
            whether express or implied, including but not limited to implied warranties of
            merchantability, fitness for a particular purpose, and non-infringement.
          </p>
        </section>

        <section>
          <h2>11. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, PulseRealm and its operators shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages
            arising from your use of the Service, including but not limited to physical injury,
            data loss, or equipment damage.
          </p>
        </section>

        <section>
          <h2>12. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless PulseRealm and its operators from any
            claims, damages, losses, or expenses (including reasonable legal fees) arising from
            your use of the Service or violation of these Terms.
          </p>
        </section>

        <section>
          <h2>13. Termination</h2>
          <p>
            We may terminate or restrict your access to the Service at any time, without notice,
            for any reason, including violation of these Terms. Since the Service is ephemeral,
            termination results in no data loss beyond the current session.
          </p>
        </section>

        <section>
          <h2>14. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. The "Last updated" date at the top of
            this page reflects the most recent revision. Continued use of the Service after
            changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>15. Contact</h2>
          <p>
            If you have questions about these Terms, please contact the server administrator.
          </p>
        </section>
      </div>
    </div>
  );
}
