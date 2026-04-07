<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

myurlc_render_head(
    'Bluehost Frontend',
    'Build a modern link page on myurlc.com with a Bluehost frontend, Railway backend, live leads, and analytics.',
    myurlc_public_url('/')
);
myurlc_render_topbar();
?>
  <main>
    <section class="hero">
      <article class="hero-card">
        <p class="eyebrow">Bluehost frontend + Railway backend</p>
        <h1>Launch a link page that feels like a mini app.</h1>
        <p>
          myurlc.com keeps the public site fast on Bluehost while Railway handles accounts,
          usernames, analytics, leads, referrals, backups, and page data behind the scenes.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/signup">Create your page</a>
          <a class="btn btn-secondary" href="/login">Log in</a>
        </div>
        <div class="notice-banner">
          <strong>Free for the first <?= myurlc_html((string) MYURLC_FOUNDER_LIMIT) ?> users for life.</strong>
          The backend keeps track of founder slots automatically.
        </div>
      </article>

      <aside class="card">
        <p class="eyebrow">What is included</p>
        <div class="feature-list">
          <div class="feature-item">
            <strong>Clean public URLs</strong>
            <span>Each page lives at <code>myurlc.com/username</code>.</span>
          </div>
          <div class="feature-item">
            <strong>Business-first actions</strong>
            <span>Lead forms, WhatsApp, call links, referrals, and analytics are already built in.</span>
          </div>
          <div class="feature-item">
            <strong>Safer rollout path</strong>
            <span>Bluehost serves the frontend while Railway keeps the app logic, uploads, and PostgreSQL-backed data stable.</span>
          </div>
        </div>
      </aside>
    </section>

    <section class="section grid three">
      <article class="card">
        <h2>Made for useful pages</h2>
        <p class="section-copy">Unlimited-style link stacks, profile media, custom colors, social icons, and mobile-first layouts.</p>
      </article>
      <article class="card">
        <h2>Organic search ready</h2>
        <p class="section-copy">Public profile pages stay indexable while the Railway backend continues to publish sitemap and SEO data.</p>
      </article>
      <article class="card">
        <h2>Founder-friendly pricing</h2>
        <p class="section-copy">Start with the founder offer, then expand into business plans once the first pages are live and getting clicks.</p>
      </article>
    </section>
  </main>
<?php myurlc_render_footer(); ?>
