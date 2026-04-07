<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$slug = isset($_GET['slug']) ? strtolower((string) $_GET['slug']) : '';
$slug = preg_replace('/[^a-z0-9-]/', '', $slug);

if ($slug === '') {
    header('Location: /');
    exit;
}

$response = myurlc_fetch_json('/api/public/pages/' . rawurlencode($slug));

if (!$response['ok'] || !is_array($response['data']) || empty($response['data']['page'])) {
    $statusCode = $response['status'] === 404 ? 404 : 502;
    $message = $statusCode === 404
        ? 'This username is not live yet, or it has not been published.'
        : 'The public page could not be loaded from the Railway backend right now.';
    http_response_code($statusCode);
    myurlc_render_head($statusCode === 404 ? 'Page not found' : 'Page temporarily unavailable', $message, myurlc_public_url('/' . $slug), 'profile-page');
    ?>
    <main class="profile-page">
      <div class="profile-shell">
        <div class="profile-card">
          <h1 class="page-title"><?= $statusCode === 404 ? 'Page not found' : 'Page unavailable' ?></h1>
          <p class="profile-bio"><?= myurlc_html($message) ?></p>
          <a class="btn btn-primary" href="/signup">Create your own page</a>
        </div>
      </div>
    </main>
    <?php
    myurlc_render_footer();
    exit;
}

$payload = $response['data'];
$page = $payload['page'];
$seo = $payload['seo'];
$showDisplayName = !empty($page['visible_name']) && strtolower((string) $page['visible_name']) !== strtolower((string) $page['slug']);
$backgroundStyle = '';
if (!empty($page['background_image'])) {
    $backgroundStyle = "background-image: linear-gradient(180deg, rgba(13, 16, 32, 0.72), rgba(13, 16, 32, 0.94)), url('" . myurlc_html((string) $page['background_image']) . "'); background-size: cover; background-position: center;";
}

myurlc_render_head(
    (string) ($page['visible_name'] ?? $page['slug']),
    (string) ($seo['description'] ?? 'View this myurlc.com page.'),
    (string) ($seo['canonical_url'] ?? myurlc_public_url('/' . $slug)),
    'profile-page'
);
?>
  <main class="profile-page" data-track-view-url="<?= myurlc_html((string) $page['track_view_url']) ?>"<?= $backgroundStyle ? ' style="' . $backgroundStyle . '"' : '' ?>>
    <div class="profile-shell">
      <div class="profile-topbar">
        <a class="icon-button" href="/" aria-label="Back home">MY</a>
        <div class="profile-top-actions">
          <a class="icon-button" href="<?= myurlc_html((string) $page['subscribe_url']) ?>" aria-label="Subscribe">+</a>
          <button
            class="icon-button"
            type="button"
            data-share-page
            data-share-url="<?= myurlc_html((string) $page['public_url']) ?>"
            data-share-title="<?= myurlc_html((string) $page['visible_name']) ?>"
            data-share-text="Check out <?= myurlc_html((string) $page['visible_name']) ?> on myurlc.com"
          >Share</button>
        </div>
      </div>

      <article class="profile-card">
        <?php if (!empty($page['profile_media']) && ($page['profile_media_type'] ?? '') === 'video'): ?>
          <video class="profile-avatar" src="<?= myurlc_html((string) $page['profile_media']) ?>" muted loop autoplay playsinline controls></video>
        <?php elseif (!empty($page['profile_media'])): ?>
          <img class="profile-avatar" src="<?= myurlc_html((string) $page['profile_media']) ?>" alt="<?= myurlc_html((string) $page['visible_name']) ?>">
        <?php else: ?>
          <div class="profile-avatar-placeholder"><?= myurlc_html(strtoupper(substr((string) $page['slug'], 0, 1))) ?></div>
        <?php endif; ?>

        <?php if ($showDisplayName): ?>
          <p class="profile-display-name"><?= myurlc_html((string) $page['visible_name']) ?></p>
        <?php endif; ?>
        <h1 class="profile-handle">@<?= myurlc_html((string) $page['slug']) ?></h1>
        <p class="profile-bio"><?= myurlc_html((string) ($page['bio'] ?? 'This page is getting an update soon.')) ?></p>

        <div class="section-stack">
          <?php foreach (($page['sections'] ?? []) as $section): ?>
            <section class="card">
              <p class="section-label"><?= myurlc_html((string) $section['label']) ?></p>
              <?php foreach (($section['links'] ?? []) as $link): ?>
                <a class="profile-link" href="<?= myurlc_html((string) $link['href']) ?>">
                  <span class="profile-link-main">
                    <span class="badge"><?= myurlc_html((string) ($link['icon_text'] ?? myurlc_platform_badge((string) ($link['platform'] ?? 'custom')))) ?></span>
                    <span><?= myurlc_html((string) $link['label']) ?></span>
                  </span>
                  <span>&gt;</span>
                </a>
              <?php endforeach; ?>
            </section>
          <?php endforeach; ?>
        </div>

        <?php if (!empty($page['lead_form_enabled'])): ?>
          <section class="card" id="subscribe" style="margin-top:22px;">
            <p class="section-label">Subscribe or send a message</p>
            <p class="section-copy"><?= myurlc_html((string) ($page['lead_form_prompt'] ?? 'Send a quick message')) ?></p>
            <form class="form-stack" id="lead-form" data-lead-submit-url="<?= myurlc_html((string) $page['lead_submit_url']) ?>">
              <input name="name" placeholder="Your name" required>
              <input name="email" type="email" placeholder="Your email" required>
              <textarea name="message" placeholder="How can they help?" required></textarea>
              <div class="message message-info" data-form-message hidden></div>
              <button class="btn btn-primary" type="submit">Send message</button>
            </form>
          </section>
        <?php endif; ?>

        <?php if (!empty($page['contact_actions']) || !empty($page['social_links'])): ?>
          <div class="social-strip">
            <?php foreach (($page['contact_actions'] ?? []) as $action): ?>
              <a class="social-chip" href="<?= myurlc_html((string) $action['href']) ?>"><?= myurlc_html(myurlc_platform_badge((string) $action['platform'])) ?> <span><?= myurlc_html((string) $action['label']) ?></span></a>
            <?php endforeach; ?>
            <?php foreach (($page['social_links'] ?? []) as $link): ?>
              <a class="social-chip" href="<?= myurlc_html((string) $link['href']) ?>"><?= myurlc_html((string) ($link['icon_text'] ?? myurlc_platform_badge((string) ($link['platform'] ?? 'custom')))) ?> <span><?= myurlc_html((string) $link['label']) ?></span></a>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>

        <a class="profile-platform-cta" href="<?= myurlc_html((string) $page['join_url']) ?>">Join <?= myurlc_html((string) $page['slug']) ?> on myurlc.com</a>
      </article>
    </div>
  </main>

  <script>
    document.addEventListener('DOMContentLoaded', function () {
      const pageRoot = document.querySelector('[data-track-view-url]');
      if (pageRoot) {
        fetch(pageRoot.getAttribute('data-track-view-url'), { method: 'POST', mode: 'cors', credentials: 'omit' }).catch(function () {});
      }

      const leadForm = document.getElementById('lead-form');
      if (leadForm) {
        leadForm.addEventListener('submit', async function (event) {
          event.preventDefault();
          const message = leadForm.querySelector('[data-form-message]');
          const button = leadForm.querySelector('button[type="submit"]');
          if (button) {
            button.disabled = true;
          }
          try {
            const payload = Object.fromEntries(new FormData(leadForm).entries());
            const response = await fetch(leadForm.getAttribute('data-lead-submit-url'), {
              method: 'POST',
              mode: 'cors',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data && data.error ? data.error : 'Unable to send message.');
            }
            window.myurlcFrontend.setMessage(message, 'success', data.message || 'Message sent.');
            leadForm.reset();
          } catch (error) {
            window.myurlcFrontend.setMessage(message, 'error', error.message);
          } finally {
            if (button) {
              button.disabled = false;
            }
          }
        });
      }
    });
  </script>
<?php myurlc_render_footer(); ?>
