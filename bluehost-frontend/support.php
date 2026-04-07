<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

myurlc_render_head(
    'Support',
    'Send a help request or report a bug for your myurlc.com page.',
    myurlc_public_url('/support'),
    'support-page'
);
myurlc_render_topbar('support');
?>
  <main>
    <section class="form-card card">
      <p class="eyebrow">Need help?</p>
      <h1 class="page-title">Send a ticket to <?= myurlc_html(MYURLC_SUPPORT_EMAIL) ?>.</h1>
      <p class="page-copy">This form submits directly to the Railway backend so the ticket shows up in admin immediately.</p>

      <form class="form-stack" id="support-form">
        <div class="field-stack">
          <label for="name">Name</label>
          <input id="name" name="name" required>
        </div>
        <div class="field-stack">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required>
        </div>
        <div class="field-stack">
          <label for="subject">Subject</label>
          <input id="subject" name="subject" required>
        </div>
        <div class="field-stack">
          <label for="message">Message</label>
          <textarea id="message" name="message" required></textarea>
        </div>
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Send ticket</button>
      </form>

      <p class="page-copy">Prefer email? <a class="link-muted" href="mailto:<?= myurlc_html(MYURLC_SUPPORT_EMAIL) ?>"><?= myurlc_html(MYURLC_SUPPORT_EMAIL) ?></a></p>
    </section>
  </main>
  <script>
    document.getElementById('support-form').addEventListener('submit', function (event) {
      event.preventDefault();
      window.myurlcFrontend.submitJsonForm(event.currentTarget, '/api/support', 'Ticket received. We will follow up by email.');
    });
  </script>
<?php myurlc_render_footer(); ?>
