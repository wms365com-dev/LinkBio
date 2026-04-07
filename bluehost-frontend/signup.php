<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$refCode = isset($_GET['ref']) ? strtoupper(preg_replace('/[^A-Z0-9]/', '', (string) $_GET['ref'])) : '';

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

      <form class="form-stack" id="signup-form">
        <div class="field-stack">
          <label for="full_name">Full name</label>
          <input id="full_name" name="full_name" required>
        </div>
        <div class="field-stack">
          <label for="business_name">Business or creator name</label>
          <input id="business_name" name="business_name" required>
        </div>
        <div class="field-stack">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required>
        </div>
        <div class="field-stack">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" minlength="8" required>
        </div>
        <input type="hidden" name="referral_code" value="<?= myurlc_html($refCode) ?>">
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Create account</button>
      </form>

      <p class="page-copy">Already have an account? <a class="link-muted" href="/login">Log in</a></p>
    </section>
  </main>
  <script>
    document.getElementById('signup-form').addEventListener('submit', function (event) {
      event.preventDefault();
      window.myurlcFrontend.submitJsonForm(event.currentTarget, '/api/auth/signup', 'Account created.', '/app');
    });
  </script>
<?php myurlc_render_footer(); ?>
