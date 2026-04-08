<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$configResponse = myurlc_fetch_json('/api/config');
$configData = ($configResponse['ok'] && is_array($configResponse['data'])) ? $configResponse['data'] : [];
$founderOffer = is_array($configData['founder_offer'] ?? null) ? $configData['founder_offer'] : [
    'limit' => MYURLC_FOUNDER_LIMIT,
    'claimed' => 0,
    'remaining' => MYURLC_FOUNDER_LIMIT,
    'is_open' => true
];
$recentSignups = is_array($configData['recent_signups'] ?? null) ? $configData['recent_signups'] : [];

myurlc_render_head(
    'Free link pages for businesses and creators',
    'Create a polished myurlc.com page with custom links, social icons, lead capture, analytics, and a mobile layout that feels launch-ready.',
    myurlc_public_url('/'),
    'home-page'
);
myurlc_render_topbar();
?>
  <main>
    <section class="hero hero-home">
      <article class="hero-card hero-card-home">
        <div class="founder-banner founder-banner-home">
          <div class="founder-banner-topline">
            <span class="founder-chip">Founder 500</span>
            <span class="founder-count"><?= myurlc_html((string) ($founderOffer['claimed'] ?? 0)) ?> / <?= myurlc_html((string) ($founderOffer['limit'] ?? MYURLC_FOUNDER_LIMIT)) ?> claimed</span>
          </div>
          <strong>Free for the first <?= myurlc_html((string) ($founderOffer['limit'] ?? MYURLC_FOUNDER_LIMIT)) ?> users for life!</strong>
          <p>
            <?php if (!empty($founderOffer['is_open'])): ?>
              <?= myurlc_html((string) ($founderOffer['remaining'] ?? 0)) ?> founder spots left. Early users get lifetime access automatically.
            <?php else: ?>
              The founder offer is closed, but new users can still start with a free trial.
            <?php endif; ?>
          </p>
        </div>

        <p class="eyebrow">Self-serve or done-for-you</p>
        <h1>Build a sharper link page without the usual clutter.</h1>
        <p class="lead">
          myurlc.com gives creators and small businesses a cleaner way to publish links, collect leads,
          and look branded on mobile. Use the self-serve flow or keep your premium done-for-you setup offer.
        </p>

        <div class="hero-actions">
          <a class="btn btn-primary" href="/signup">Create an account</a>
          <a class="btn btn-secondary" href="/login">Log in</a>
          <a class="btn btn-ghost-home" href="/support">Need help?</a>
        </div>

        <div class="hero-badges">
          <span><?= !empty($founderOffer['is_open']) ? myurlc_html((string) ($founderOffer['remaining'] ?? 0)) . ' founder spots left' : 'Founder offer closed' ?></span>
          <span>Mobile-first public pages</span>
          <span>Lead capture and analytics</span>
          <span>Clean username URLs</span>
        </div>

        <?php if (!empty($recentSignups)): ?>
          <div class="announcement-card">
            <p class="announcement-label">New signups</p>
            <div class="announcement-feed">
              <?php foreach (array_slice($recentSignups, 0, 3) as $item): ?>
                <div class="announcement-item">
                  <strong><?= myurlc_html((string) ($item['business_name'] ?? 'New brand')) ?></strong>
                  <span><?= myurlc_html((string) ($item['relative_created_at'] ?? 'Just now')) ?></span>
                </div>
              <?php endforeach; ?>
            </div>
          </div>
        <?php endif; ?>
      </article>

      <aside class="hero-preview-panel">
        <div class="hero-preview-surface">
          <div class="phone-frame">
            <div class="phone-card phone-card-cream">
              <div class="phone-avatar"></div>
              <p class="phone-title">Grey Wolf Logistics</p>
              <p class="phone-copy">Overflow warehouse, same-day pallet help, custom quotes, and dispatch-ready contact links.</p>
              <div class="phone-link phone-link-primary">Request a quote</div>
              <div class="phone-link phone-link-secondary">Call now</div>
              <div class="phone-link phone-link-soft">WhatsApp</div>
            </div>
          </div>

          <div class="preview-note-card">
            <p class="eyebrow">Business-first pages</p>
            <h2>Built for leads, not just clicks.</h2>
            <p>Let visitors tap WhatsApp, call, download a PDF, or send a quote request from one clean page.</p>
          </div>
        </div>
      </aside>
    </section>

    <section class="section grid two social-proof-grid">
      <article class="card card-soft">
        <div class="section-header-inline">
          <div>
            <p class="eyebrow">Just joined</p>
            <h2>Show visitors real momentum.</h2>
          </div>
        </div>
        <div class="signup-proof-list">
          <?php if (empty($recentSignups)): ?>
            <div class="empty-state">
              <h3>No signups yet</h3>
              <p>Once new accounts come in, this section becomes instant social proof for the next visitor.</p>
            </div>
          <?php else: ?>
            <?php foreach ($recentSignups as $item): ?>
              <article class="signup-proof-item">
                <div>
                  <strong><?= myurlc_html((string) ($item['business_name'] ?? 'New brand')) ?></strong>
                  <p><?= myurlc_html((string) ($item['message'] ?? 'A new customer just joined myurlc.com.')) ?></p>
                </div>
                <span><?= myurlc_html((string) ($item['relative_created_at'] ?? 'Just now')) ?></span>
              </article>
            <?php endforeach; ?>
          <?php endif; ?>
        </div>
      </article>

      <article class="card card-warm">
        <div class="section-header-inline">
          <div>
            <p class="eyebrow">Referral loop</p>
            <h2>Reward the users who bring the next one in.</h2>
          </div>
        </div>
        <div class="feature-list">
          <div class="feature-item feature-item-light">Every account gets a referral code and share link</div>
          <div class="feature-item feature-item-light">Each successful referral earns 1 free month</div>
          <div class="feature-item feature-item-light">Rewards stack up to 12 months total</div>
        </div>
        <a class="btn btn-primary" href="/signup">Start your page</a>
      </article>
    </section>

    <section class="section grid three">
      <article class="card card-step">
        <p class="card-number">01</p>
        <h2>Claim a username</h2>
        <p>Start with a clean public URL like <strong>myurlc.com/username</strong> and make it instantly memorable.</p>
      </article>
      <article class="card card-step">
        <p class="card-number">02</p>
        <h2>Customize the page</h2>
        <p>Upload media, set the theme, add business-focused links, and publish when everything feels right.</p>
      </article>
      <article class="card card-step">
        <p class="card-number">03</p>
        <h2>Track what works</h2>
        <p>Use analytics, lead capture, and referrals to see which links actually bring messages and customers.</p>
      </article>
    </section>
  </main>
<?php myurlc_render_footer(); ?>
