<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

myurlc_render_head(
    'Log in',
    'Log in to manage your myurlc.com page from the Bluehost frontend and Railway backend.',
    myurlc_public_url('/login'),
    'auth-page'
);
myurlc_render_topbar('login');
?>
  <main>
    <section class="form-card card">
      <p class="eyebrow">Welcome back</p>
      <h1 class="page-title">Log in to your page.</h1>
      <p class="page-copy">Your secure session is handled by Railway while this frontend stays on Bluehost.</p>

      <form class="form-stack" id="login-form">
        <div class="field-stack">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required>
        </div>
        <div class="field-stack">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required>
        </div>
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Log in</button>
      </form>

      <p class="page-copy"><a class="link-muted" href="/forgot-password">Forgot password?</a></p>

      <p class="page-copy">Need an account? <a class="link-muted" href="/signup">Start free</a></p>
    </section>
  </main>
  <script>
    document.getElementById('login-form').addEventListener('submit', function (event) {
      event.preventDefault();
      window.myurlcFrontend.submitJsonForm(event.currentTarget, '/api/auth/login', 'Welcome back.', '/app');
    });
  </script>
<?php myurlc_render_footer(); ?>
