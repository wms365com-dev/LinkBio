<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$refCode = isset($_GET['ref']) ? strtoupper(preg_replace('/[^A-Z0-9]/', '', (string) $_GET['ref'])) : '';
$referrer = null;
$referralMessageType = '';
$referralMessageText = '';

if ($refCode !== '') {
    $referralResponse = myurlc_fetch_json('/api/public/referrals/' . rawurlencode($refCode));
    if ($referralResponse['ok'] && is_array($referralResponse['data']) && !empty($referralResponse['data']['referrer'])) {
        $referrer = $referralResponse['data']['referrer'];
        $referralMessageType = 'success';
        $referralMessageText = 'Referred by ' . (string) ($referrer['visible_name'] ?? $refCode) . '.';
    } else {
        $referralMessageType = 'error';
        $referralMessageText = 'Referral code ' . $refCode . ' was not found.';
    }
}

myurlc_render_head(
    'Create your page',
    'Create your myurlc.com page and connect to the Railway backend for login, analytics, and publishing.',
    myurlc_public_url('/signup'),
    'auth-page'
);
myurlc_render_topbar();
?>
  <main>
    <section class="form-card card">
      <p class="eyebrow">Start free</p>
      <h1 class="page-title">Claim your username and launch.</h1>
      <p class="page-copy">
        The first <?= myurlc_html((string) MYURLC_FOUNDER_LIMIT) ?> users get lifetime access.
        Everyone else starts with a free trial.
      </p>

      <div class="mini-steps" aria-label="What happens next">
        <span>1. Create account</span>
        <span>2. Open studio</span>
        <span>3. Publish your page</span>
      </div>

      <?php if ($refCode !== '' || $referralMessageText !== ''): ?>
        <div
          class="message message-<?= myurlc_html($referralMessageType ?: 'info') ?> referral-banner"
          id="referral-banner"
          data-referral-code="<?= myurlc_html($refCode) ?>"
          <?= $referralMessageText === '' ? 'hidden' : '' ?>
        >
          <strong><?= myurlc_html($referralMessageText) ?></strong>
          <?php if ($referrer && !empty($referrer['referral_code'])): ?>
            <span>Your signup will count toward referral code <?= myurlc_html((string) $referrer['referral_code']) ?>.</span>
          <?php endif; ?>
        </div>
      <?php endif; ?>

      <form class="form-stack" id="signup-form">
        <div class="field-stack">
          <label for="full_name">Your name</label>
          <input id="full_name" name="full_name" placeholder="Karen Smith" autocomplete="name" required>
        </div>
        <div class="field-stack">
          <label for="business_name">Business or creator name</label>
          <input id="business_name" name="business_name" placeholder="Optional if it matches your name" autocomplete="organization">
          <small class="field-help">Optional. If you leave this blank, we’ll use your name for now.</small>
        </div>
        <div class="field-stack">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required>
        </div>
        <div class="field-stack">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" minlength="8" autocomplete="new-password" required>
          <small class="field-help">Use at least 8 characters.</small>
        </div>
        <input type="hidden" name="referral_code" value="<?= myurlc_html($refCode) ?>">
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Create account</button>
      </form>

      <div class="signup-note-card">
        <strong>What happens after signup?</strong>
        <span>You'll go straight into the studio so you can add links and publish fast.</span>
      </div>

      <p class="page-copy">Already have an account? <a class="link-muted" href="/login">Log in</a></p>
    </section>
  </main>
  <script>
    document.getElementById('signup-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const fullName = form.querySelector('[name="full_name"]');
      const businessName = form.querySelector('[name="business_name"]');
      if (fullName && businessName && !String(businessName.value || '').trim()) {
        businessName.value = String(fullName.value || '').trim();
      }
      window.myurlcFrontend.submitJsonForm(event.currentTarget, '/api/auth/signup', 'Account created.', '/app');
    });

    (async function () {
      const banner = document.getElementById('referral-banner');
      if (!banner) {
        return;
      }

      const code = String(banner.getAttribute('data-referral-code') || '').trim();
      if (!code) {
        return;
      }

      if (!banner.hidden && /Referred by/i.test(banner.textContent || '')) {
        return;
      }

      try {
        const response = await window.myurlcFrontend.apiFetch('/api/public/referrals/' + encodeURIComponent(code), {
          credentials: 'omit'
        });
        const referrer = response && response.referrer ? response.referrer : null;
        if (!referrer) {
          throw new Error('Referral code ' + code + ' was not found.');
        }

        banner.className = 'message message-success referral-banner';
        banner.innerHTML = '<strong>Referred by ' + String(referrer.visible_name || code) + '.</strong><span>Your signup will count toward referral code ' + String(referrer.referral_code || code) + '.</span>';
        banner.hidden = false;
      } catch (error) {
        banner.className = 'message message-error referral-banner';
        banner.innerHTML = '<strong>Referral code ' + code + ' was not found.</strong><span>You can still create an account without it.</span>';
        banner.hidden = false;
      }
    }());
  </script>
<?php myurlc_render_footer(); ?>
