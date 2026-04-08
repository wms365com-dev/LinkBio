<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

myurlc_render_head(
    'Your dashboard',
    'View your page status, referral link, and analytics summary from the Bluehost frontend.',
    myurlc_public_url('/app'),
    'app-page'
);
myurlc_render_topbar();
?>
  <main>
    <section class="app-shell">
      <p class="eyebrow">Your dashboard</p>
      <h1 class="page-title">Finish your page and go live.</h1>
      <p class="section-copy">This is your control center for publishing, sharing, and tracking your page.</p>

      <div class="message message-info" id="app-message">Loading your account...</div>

      <div class="app-grid" id="app-grid" hidden>
        <section class="card">
          <div class="status-hero" id="status-hero"></div>
          <h2 id="dashboard-name">Your page</h2>
          <div class="key-value" id="account-summary"></div>
          <div class="button-row" id="primary-actions"></div>
        </section>

        <section class="card">
          <div class="next-step-card" id="next-step-card"></div>
        </section>

        <section class="card">
          <h2>Analytics snapshot</h2>
          <div class="stats-grid" id="analytics-grid"></div>
        </section>
      </div>
    </section>
  </main>
  <script>
    document.addEventListener('DOMContentLoaded', async function () {
      const message = document.getElementById('app-message');
      const grid = document.getElementById('app-grid');

      try {
        const me = await window.myurlcFrontend.apiFetch('/api/auth/me');
        const analytics = await window.myurlcFrontend.apiFetch('/api/customer/analytics');

        document.getElementById('dashboard-name').textContent = me.page.business_name || me.customer.business_name || 'Your page';

        const isPublished = Boolean(me.page.is_published);
        const pageStatus = isPublished ? 'Published' : 'Draft';
        const publicPageValue = isPublished
          ? me.page.public_url
          : 'Not live yet. Publish it from the studio first.';
        const statusHero = document.getElementById('status-hero');
        statusHero.innerHTML = isPublished
          ? '<span class="status-pill status-pill-live">Live now</span><p>Your page is public and ready to share.</p>'
          : '<span class="status-pill status-pill-draft">Draft</span><p>Your page is saved. Open the studio and publish it when you are ready.</p>';

        const summary = document.getElementById('account-summary');
        summary.innerHTML = [
          ['Page status', pageStatus],
          ['Public page', publicPageValue],
          ['Username', '@' + me.page.slug],
          ['Billing status', me.customer.billing_status],
          ['Referral link', me.customer.referral_share_url || 'Not ready yet'],
          ['Founder slot', me.customer.founder_slot_number ? '#' + me.customer.founder_slot_number : 'Not founder plan']
        ].map(function (row) {
          return '<div class="key-value-row"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>';
        }).join('');

        const actions = document.getElementById('primary-actions');
        const actionsList = [
          [isPublished ? 'Open live page' : 'Open studio to publish', isPublished ? me.page.public_url : me.manage.studio_url, 'btn btn-primary'],
          ['Open studio', me.manage.studio_url, 'btn btn-secondary'],
          ['Billing', me.manage.billing_url, 'btn btn-secondary'],
          ['Export JSON', me.manage.export_url, 'btn btn-secondary'],
          ['Support', me.manage.support_url, 'btn btn-secondary'],
          ['Log out', '#', 'btn btn-link', me.manage.logout_url]
        ];

        if (isPublished) {
          actionsList.splice(1, 0, ['Copy live URL', me.page.public_url, 'btn btn-secondary']);
        }

        actions.innerHTML = actionsList.map(function (item) {
          if (item[3]) {
            return '<button class="' + item[2] + '" type="button" data-logout-url="' + item[3] + '">' + item[0] + '</button>';
          }
          return '<a class="' + item[2] + '" href="' + item[1] + '">' + item[0] + '</a>';
        }).join('');

        const nextStepCard = document.getElementById('next-step-card');
        nextStepCard.innerHTML = isPublished
          ? '<p class="eyebrow">Next best move</p><h2>Share your live page.</h2><p class="section-copy">Post your public URL, use your referral link, and start collecting real traffic.</p>'
          : '<p class="eyebrow">Next best move</p><h2>Publish your page.</h2><p class="section-copy">Open the studio, add your links, then hit publish so your public URL starts working.</p>';

        const stats = analytics.report.summary_30d;
        document.getElementById('analytics-grid').innerHTML = [
          ['Views', stats.page_views],
          ['Visitors', stats.unique_visitors],
          ['Clicks', stats.link_clicks],
          ['Leads', stats.leads]
        ].map(function (row) {
          return '<div class="stat-item"><strong>' + row[1] + '</strong><span>' + row[0] + '</span></div>';
        }).join('');

        window.myurlcFrontend.setMessage(
          message,
          isPublished ? 'success' : 'info',
          isPublished
            ? 'Your page is live.'
            : 'Your page is saved as a draft. Open the studio and publish it to make the public URL work.'
        );
        grid.hidden = false;
      } catch (error) {
        window.myurlcFrontend.setMessage(message, 'error', error.message + ' Log in again if your session expired.');
      }
    });

    document.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-logout-url]');
      if (!button) {
        return;
      }

      try {
        const response = await window.myurlcFrontend.apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = response.redirect_url || '/';
      } catch (error) {
        window.myurlcFrontend.setMessage(document.getElementById('app-message'), 'error', error.message);
      }
    });
  </script>
<?php myurlc_render_footer(); ?>
