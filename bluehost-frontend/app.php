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
      <h1 class="page-title">Keep the public site on Bluehost and the account tools on Railway.</h1>
      <p class="section-copy">
        This page pulls your live account data from Railway. The public site stays here, while deeper editor routes can stay on the backend until you are ready to move them too.
      </p>

      <div class="message message-info" id="app-message">Loading your account...</div>

      <div class="app-grid" id="app-grid" hidden>
        <section class="card">
          <h2 id="dashboard-name">Your page</h2>
          <div class="key-value" id="account-summary"></div>
          <div class="button-row" id="primary-actions"></div>
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

        const summary = document.getElementById('account-summary');
        summary.innerHTML = [
          ['Public page', me.page.public_url],
          ['Username', '@' + me.page.slug],
          ['Billing status', me.customer.billing_status],
          ['Referral link', me.customer.referral_share_url || 'Not ready yet'],
          ['Founder slot', me.customer.founder_slot_number ? '#' + me.customer.founder_slot_number : 'Not founder plan']
        ].map(function (row) {
          return '<div class="key-value-row"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>';
        }).join('');

        const actions = document.getElementById('primary-actions');
        actions.innerHTML = [
          ['Open live page', me.page.public_url, 'btn btn-primary'],
          ['Open studio', me.manage.studio_url, 'btn btn-secondary'],
          ['Billing', me.manage.billing_url, 'btn btn-secondary'],
          ['Export JSON', me.manage.export_url, 'btn btn-secondary'],
          ['Support', me.manage.support_url, 'btn btn-secondary'],
          ['Log out', '#', 'btn btn-link', me.manage.logout_url]
        ].map(function (item) {
          if (item[3]) {
            return '<button class="' + item[2] + '" type="button" data-logout-url="' + item[3] + '">' + item[0] + '</button>';
          }
          return '<a class="' + item[2] + '" href="' + item[1] + '">' + item[0] + '</a>';
        }).join('');

        const stats = analytics.report.summary_30d;
        document.getElementById('analytics-grid').innerHTML = [
          ['Views', stats.page_views],
          ['Visitors', stats.unique_visitors],
          ['Clicks', stats.link_clicks],
          ['Leads', stats.leads]
        ].map(function (row) {
          return '<div class="stat-item"><strong>' + row[1] + '</strong><span>' + row[0] + '</span></div>';
        }).join('');

        window.myurlcFrontend.setMessage(message, 'success', 'Dashboard connected to Railway.');
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
