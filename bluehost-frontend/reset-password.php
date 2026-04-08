<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$token = isset($_GET['token']) ? trim((string) $_GET['token']) : '';

myurlc_render_head(
    'Reset password',
    'Choose a new password for your myurlc.com account.',
    myurlc_public_url('/reset-password'),
    'auth-page'
);
myurlc_render_topbar();
?>
  <main>
    <section class="form-card card">
      <p class="eyebrow">Secure reset</p>
      <h1 class="page-title">Choose a new password.</h1>
      <p class="page-copy" id="reset-password-hint">Checking your reset link...</p>

      <div class="message message-info" id="reset-password-message">Checking your reset link...</div>

      <form class="form-stack" id="reset-password-form" hidden>
        <input type="hidden" name="token" value="<?= myurlc_html($token) ?>">
        <div class="field-stack">
          <label for="password">New password</label>
          <input id="password" name="password" type="password" minlength="8" required>
        </div>
        <div class="field-stack">
          <label for="confirm_password">Confirm password</label>
          <input id="confirm_password" name="confirm_password" type="password" minlength="8" required>
        </div>
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Save new password</button>
      </form>

      <p class="page-copy">Need a new link? <a class="link-muted" href="/forgot-password">Request another reset email</a></p>
    </section>
  </main>
  <script>
    (async function () {
      const token = <?= json_encode($token, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
      const hint = document.getElementById('reset-password-hint');
      const message = document.getElementById('reset-password-message');
      const form = document.getElementById('reset-password-form');

      if (!token) {
        hint.textContent = 'This reset link is missing a token.';
        window.myurlcFrontend.setMessage(message, 'error', 'That reset link is invalid or expired.');
        return;
      }

      try {
        const response = await window.myurlcFrontend.apiFetch('/api/auth/reset-password?token=' + encodeURIComponent(token));
        hint.textContent = response.email_hint
          ? 'Resetting the password for ' + response.email_hint + '.'
          : 'Choose a new password for your account.';
        message.hidden = true;
        form.hidden = false;
      } catch (error) {
        hint.textContent = 'This reset link is no longer valid.';
        window.myurlcFrontend.setMessage(message, 'error', error.message);
      }
    }());

    document.getElementById('reset-password-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const message = form.querySelector('[data-form-message]');
      const button = form.querySelector("button[type='submit']");

      if (button) {
        button.disabled = true;
      }

      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        const response = await window.myurlcFrontend.apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        window.myurlcFrontend.setMessage(message, 'success', response.message || 'Password updated.');
        window.location.href = response.redirect_url || '/app';
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
