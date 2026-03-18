interface TermsOfServiceProps {
  onBack: () => void;
}

export function TermsOfService({ onBack }: TermsOfServiceProps) {
  return (
    <div className="tos-page">
      <div className="tos-container">
        <button className="tos-back" onClick={onBack}>&larr; Back</button>
        <h1>Terms of Service</h1>
        <p className="tos-updated">Last updated: March 18, 2026</p>

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
            to interactive gameplay modes. The Service is provided on an ephemeral, in-memory
            basis — no user accounts, workout history, or personal data are stored persistently.
          </p>
        </section>

        <section>
          <h2>3. Use of the Service</h2>
          <p>You agree to use the Service only for its intended purpose — participating in
            real-time workout realms. You must not:</p>
          <ul>
            <li>Attempt to disrupt or interfere with the Service or its infrastructure</li>
            <li>Use the Service for any unlawful purpose</li>
            <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            <li>Impersonate another person or misrepresent your identity</li>
          </ul>
        </section>

        <section>
          <h2>4. Health Disclaimer</h2>
          <p>
            PulseRealm is not a medical device. Heart rate, step count, speed, and other metrics
            displayed are estimates and should not be relied upon for medical decisions. Always
            consult a healthcare professional before beginning any exercise program. You use the
            Service at your own risk.
          </p>
        </section>

        <section>
          <h2>5. Data &amp; Privacy</h2>
          <p>
            PulseRealm processes biometric data (heart rate, step count) in real-time to power
            gameplay. This data is held in memory only for the duration of a realm session and is
            not persisted, stored, or shared with third parties. No user accounts or personal
            profiles are created.
          </p>
        </section>

        <section>
          <h2>6. Third-Party Services</h2>
          <p>
            Certain modes may use third-party services such as Google Maps and YouTube. Your use
            of those features is subject to the respective third-party terms of service.
          </p>
        </section>

        <section>
          <h2>7. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind,
            whether express or implied, including but not limited to implied warranties of
            merchantability, fitness for a particular purpose, and non-infringement.
          </p>
        </section>

        <section>
          <h2>8. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, PulseRealm and its operators shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages
            arising from your use of the Service.
          </p>
        </section>

        <section>
          <h2>9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service after
            changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            If you have questions about these Terms, please contact the server administrator.
          </p>
        </section>
      </div>
    </div>
  );
}
