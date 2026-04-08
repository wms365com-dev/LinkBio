<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$prefillEmail = isset($_GET['email']) ? trim((string) $_GET['email']) : '';

myurlc_render_head(
    'Forgot password',
    'Request a secure password reset link for your myurlc.com account.',
    myurlc_public_url('/forgot-password'),
    'auth-page'
);
myurlc_render_topbar();
?>
  <main>
    <section class="form-card card">
      <p class="eyebrow">Account recovery</p>
      <h1 class="page-title">Forgot your password?</h1>
      <p class="page-copy">Enter the email for your myurlc.com account and we’ll send a secure reset link.</p>

      <form class="form-stack" id="forgot-password-form">
        <div class="field-stack">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" value="<?= myurlc_html($prefillEmail) ?>" required>
        </div>
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Send reset link</button>
      </form>

      <p class="page-copy">Back to <a class="link-muted" href="/login">Log in</a></p>
    </section>
  </main>
  <script>
    document.getElementById('forgot-password-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const message = form.querySelector('[data-form-message]');
      const button = form.querySelector("button[type='submit']");

      if (button) {
        button.disabled = true;
      }

      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        const response = await window.myurlcFrontend.apiFetch('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        let successText = response.message || 'If that email is in our system, we sent reset instructions.';
        if (response.debug_reset_url) {
          successText += ' Test link: ' + response.debug_reset_url;
        }

        window.myurlcFrontend.setMessage(message, 'success', successText);
      } catch (error) {
        window.myurlcFrontend.setMessage(message, 'error', error.message);
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    });
  </script>
<?php myurlc_render_footer(); ?>
