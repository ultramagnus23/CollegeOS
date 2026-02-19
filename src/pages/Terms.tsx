import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '../services/api';
import { toast } from 'sonner';

/**
 * Terms and Conditions page with data consent
 * Implements TASK 8 from problem statement
 */
const Terms = () => {
  const navigate = useNavigate();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  useEffect(() => {
    // Check if this is part of onboarding flow
    const urlParams = new URLSearchParams(window.location.search);
    setIsOnboarding(urlParams.get('onboarding') === 'true');
  }, []);

  const handleAcceptTerms = async () => {
    if (!termsAccepted) {
      toast.error('Please accept the terms and conditions to continue');
      return;
    }

    setLoading(true);
    try {
      // Record consent in database
      await api.request('/auth/accept-terms', {
        method: 'POST',
        body: JSON.stringify({
          consentType: 'terms_and_data_collection',
          timestamp: new Date().toISOString()
        })
      });

      toast.success('Terms accepted successfully');
      
      // Navigate to dashboard or next step
      if (isOnboarding) {
        navigate('/dashboard');
      } else {
        navigate(-1); // Go back to previous page
      }
    } catch (error: any) {
      toast.error('Failed to record consent. Please try again.');
      console.error('Error accepting terms:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-card shadow-sm rounded-lg p-8">
          <h1 className="text-3xl font-bold text-foreground mb-6">
            Terms and Conditions
          </h1>
          
          <div className="prose prose-sm max-w-none mb-8">
            <p className="text-lg text-foreground mb-4">
              By using CollegeOS, you agree to our terms and data collection practices.
            </p>

            {/* Scrollable terms container */}
            <div className="border border-border rounded-lg p-6 max-h-96 overflow-y-auto bg-muted/50 mb-6">
              <div className="space-y-6 text-foreground">
                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">1. Service Description</h2>
                  <p>
                    CollegeOS is a college application management platform designed to help students organize their 
                    college applications, track deadlines, manage essays, and monitor their application progress.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">2. User Responsibilities</h2>
                  <p>
                    You are responsible for maintaining the accuracy of information you provide, protecting your 
                    account credentials, and complying with all applicable laws while using our service.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3 bg-yellow-50 p-3 rounded">
                    3. Data Collection and Privacy
                  </h2>
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <p className="font-semibold mb-2">IMPORTANT - DATA COLLECTION NOTICE:</p>
                    <p className="mb-3">
                      By using this platform, you agree to allow us to collect and analyze your application data including:
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-3">
                      <li>Colleges applied to and application dates</li>
                      <li>Application deadlines and completion status</li>
                      <li>Essay drafts and writing progress</li>
                      <li>Application outcomes (accepted, rejected, waitlisted)</li>
                      <li>Academic profile information (GPA, test scores, courses)</li>
                      <li>Usage patterns and feature interactions</li>
                    </ul>
                    <p className="mb-2">
                      <strong>How we use your data:</strong>
                    </p>
                    <ul className="list-disc pl-6 space-y-1 mb-3">
                      <li>This data is anonymized and used to improve our services</li>
                      <li>We analyze trends to provide better recommendations to future students</li>
                      <li>We improve deadline accuracy and essay prompt databases</li>
                      <li>We enhance our machine learning algorithms for college matching</li>
                    </ul>
                    <p className="font-semibold">
                      We never sell your data to third parties. Your personal information remains confidential.
                    </p>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">4. Intellectual Property</h2>
                  <p>
                    All content, features, and functionality of CollegeOS are owned by us and protected by copyright, 
                    trademark, and other intellectual property laws.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">5. Limitation of Liability</h2>
                  <p className="italic text-muted-foreground">
                    [PLACEHOLDER - LEGAL REVIEW NEEDED]
                  </p>
                  <p>
                    We provide this service "as is" without warranties. We are not responsible for any missed deadlines, 
                    application errors, or admission decisions. You are ultimately responsible for verifying all 
                    information and meeting application requirements.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">6. User Content Ownership</h2>
                  <p>
                    You retain ownership of all content you create (essays, notes, etc.). By using our service, you grant 
                    us a license to store, process, and analyze your content to provide services to you.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">7. Account Termination</h2>
                  <p>
                    We reserve the right to terminate accounts that violate these terms. You may delete your account 
                    at any time from your account settings. Upon deletion, your personal data will be removed according 
                    to our data retention policy.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">8. Dispute Resolution</h2>
                  <p className="italic text-muted-foreground">
                    [PLACEHOLDER - LEGAL REVIEW NEEDED]
                  </p>
                  <p>
                    Any disputes arising from use of this service will be resolved through binding arbitration in 
                    accordance with applicable laws.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">9. Changes to Terms</h2>
                  <p>
                    We may update these terms from time to time. We will notify you of significant changes via email 
                    or in-app notification. Continued use after changes constitutes acceptance of new terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3">10. Contact Information</h2>
                  <p>
                    For questions about these terms, contact us at: support@collegeos.app
                  </p>
                </section>

                <section className="mt-6 text-sm text-muted-foreground">
                  <p>Last updated: February 2026</p>
                  <p>Version 1.0</p>
                </section>
              </div>
            </div>

            {/* Acceptance checkbox */}
            {isOnboarding && (
              <div className="bg-primary/10 border border-blue-200 rounded-lg p-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="terms-checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-1 h-5 w-5 text-primary focus:ring-blue-500 border-border rounded"
                  />
                  <span className="text-sm text-foreground">
                    I agree to the <a href="/terms" target="_blank" className="text-primary hover:text-blue-800 font-medium">Terms and Conditions</a> including 
                    data collection for service improvement as described above
                  </span>
                </label>

                <div className="mt-6 flex gap-3">
                  <Button
                    onClick={handleAcceptTerms}
                    disabled={!termsAccepted || loading}
                    className="flex-1"
                  >
                    {loading ? 'Processing...' : 'Continue to Dashboard'}
                  </Button>
                  <Button
                    onClick={() => navigate('/')}
                    variant="outline"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!isOnboarding && (
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => navigate(-1)}
                variant="outline"
              >
                Back
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Terms;
