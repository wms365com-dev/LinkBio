<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$feedbackResponse = myurlc_fetch_json('/api/public/feedback');
$feedbackBoard = ($feedbackResponse['ok'] && is_array($feedbackResponse['data'])) ? $feedbackResponse['data'] : [
    'stats' => ['posts' => 0, 'comments' => 0, 'likes' => 0],
    'posts' => [],
    'categories' => [],
    'statuses' => []
];

function myurlc_feedback_status_class(string $status): string {
    return match ($status) {
        'planned' => 'pill-feedback-planned',
        'in_progress' => 'pill-feedback-progress',
        'shipped' => 'pill-feedback-shipped',
        default => 'pill-feedback-review',
    };
}

function myurlc_render_feedback_post(array $post): void {
    $author = is_array($post['author'] ?? null) ? $post['author'] : [];
    $comments = is_array($post['comments'] ?? null) ? $post['comments'] : [];
    $authorName = (string) ($author['visible_name'] ?? 'Member');
    $authorHandle = (string) ($author['handle'] ?? '');
    $authorPageUrl = (string) ($author['page_url'] ?? '');
    ?>
    <article class="feedback-post" data-feedback-post-id="<?= myurlc_html((string) ($post['id'] ?? '')) ?>">
      <div class="feedback-post-topline">
        <span class="pill feedback-pill <?= myurlc_feedback_status_class((string) ($post['status'] ?? 'under_review')) ?>"><?= myurlc_html((string) ($post['status_label'] ?? 'Under review')) ?></span>
        <span class="feedback-meta"><?= myurlc_html((string) ($post['category_label'] ?? 'Feature request')) ?> - <?= myurlc_html((string) ($post['relative_created_at'] ?? 'Just now')) ?></span>
      </div>
      <h2><?= myurlc_html((string) ($post['title'] ?? 'Untitled')) ?></h2>
      <p class="feedback-body"><?= nl2br(myurlc_html((string) ($post['body'] ?? ''))) ?></p>
      <div class="feedback-author">
        <?php if ($authorPageUrl !== ''): ?>
          <a href="<?= myurlc_html($authorPageUrl) ?>"><?= myurlc_html($authorName) ?></a>
        <?php else: ?>
          <span><?= myurlc_html($authorName) ?></span>
        <?php endif; ?>
        <?php if ($authorHandle !== ''): ?>
          <span><?= myurlc_html($authorHandle) ?></span>
        <?php endif; ?>
      </div>
      <div class="feedback-actions">
        <button class="btn btn-secondary feedback-like-button" type="button" data-feedback-like="<?= myurlc_html((string) ($post['id'] ?? '')) ?>">
          Like <span><?= myurlc_html((string) ($post['likes_count'] ?? 0)) ?></span>
        </button>
        <span class="feedback-meta"><?= myurlc_html((string) ($post['comments_count'] ?? 0)) ?> comments</span>
      </div>
      <div class="feedback-comments">
        <?php if (empty($comments)): ?>
          <p class="feedback-empty-comments">No comments yet. Members can jump in once they sign in.</p>
        <?php else: ?>
          <?php foreach ($comments as $comment): ?>
            <?php $commentAuthor = is_array($comment['author'] ?? null) ? $comment['author'] : []; ?>
            <article class="feedback-comment">
              <strong><?= myurlc_html((string) ($commentAuthor['visible_name'] ?? 'Member')) ?></strong>
              <span><?= myurlc_html((string) ($comment['relative_created_at'] ?? 'Just now')) ?></span>
              <p><?= nl2br(myurlc_html((string) ($comment['body'] ?? ''))) ?></p>
            </article>
          <?php endforeach; ?>
        <?php endif; ?>
      </div>
      <div class="feedback-signin-inline"><a href="/signup">Create an account</a> or <a href="/login">log in</a> to comment.</div>
    </article>
    <?php
}

myurlc_render_head(
    'Feedback board',
    'See what users want next, report issues, and follow product updates on the public myurlc.com feedback board.',
    myurlc_public_url('/feedback'),
    'feedback-page'
);
myurlc_render_topbar('feedback');
?>
  <main>
    <section class="hero feedback-hero">
      <article class="hero-card feedback-hero-card">
        <p class="eyebrow">Public roadmap board</p>
        <h1>Help shape what myurlc.com builds next.</h1>
        <p class="lead">Anyone can read the board. Members can post bugs, request features, like ideas, and add comments once they sign in.</p>

        <div class="hero-badges feedback-stats" id="feedback-stats">
          <span><strong><?= myurlc_html((string) (($feedbackBoard['stats']['posts'] ?? 0))) ?></strong> posts</span>
          <span><strong><?= myurlc_html((string) (($feedbackBoard['stats']['comments'] ?? 0))) ?></strong> comments</span>
          <span><strong><?= myurlc_html((string) (($feedbackBoard['stats']['likes'] ?? 0))) ?></strong> likes</span>
        </div>

        <div class="message message-info" id="feedback-viewer-message">Public board is live. Sign in to post, like, and comment.</div>
      </article>
    </section>

    <section class="card feedback-composer-card" id="feedback-composer-card" hidden>
      <div class="section-header-inline">
        <div>
          <p class="eyebrow">New post</p>
          <h2>Share a bug or feature request</h2>
        </div>
      </div>
      <form class="form-stack" id="feedback-post-form">
        <div class="field-stack">
          <label for="feedback-title">Title</label>
          <input id="feedback-title" name="title" maxlength="140" placeholder="Example: Add drag and drop blocks on mobile" required>
        </div>
        <div class="field-stack">
          <label for="feedback-category">Type</label>
          <select id="feedback-category" name="category">
            <option value="bug">Bug</option>
            <option value="feature">Feature request</option>
            <option value="improvement">Improvement</option>
          </select>
        </div>
        <div class="field-stack">
          <label for="feedback-body">Details</label>
          <textarea id="feedback-body" name="body" rows="5" maxlength="4000" placeholder="What happened, what you expected, and why it matters." required></textarea>
        </div>
        <div class="message message-info" data-form-message hidden></div>
        <button class="btn btn-primary" type="submit">Post to board</button>
      </form>
    </section>

    <section class="card feedback-guest-card" id="feedback-guest-card">
      <div class="section-header-inline">
        <div>
          <p class="eyebrow">Member access</p>
          <h2>Read everything. Interact once you have an account.</h2>
        </div>
      </div>
      <p class="section-copy">To keep the board useful and spam-free, posting, liking, and commenting are limited to signed-in members.</p>
      <div class="button-row">
        <a class="btn btn-primary" href="/signup">Create an account</a>
        <a class="btn btn-secondary" href="/login">Log in</a>
      </div>
    </section>

    <section class="card feedback-board-card">
      <div class="section-header-inline">
        <div>
          <p class="eyebrow">Live board</p>
          <h2>What members are asking for</h2>
        </div>
      </div>

      <div class="feedback-board" id="feedback-board">
        <?php if (!$feedbackResponse['ok']): ?>
          <div class="empty-state">
            <h3>Board unavailable right now</h3>
            <p>The feedback board could not be loaded from the backend just yet. Refresh in a moment.</p>
          </div>
        <?php elseif (empty($feedbackBoard['posts'])): ?>
          <div class="empty-state">
            <h3>No public posts yet</h3>
            <p>The first signed-in member to post feedback will set the tone for the board.</p>
          </div>
        <?php else: ?>
          <?php foreach ($feedbackBoard['posts'] as $post): ?>
            <?php myurlc_render_feedback_post(is_array($post) ? $post : []); ?>
          <?php endforeach; ?>
        <?php endif; ?>
      </div>
    </section>
  </main>

  <script>
    (function () {
      const initialBoard = <?= json_encode($feedbackBoard, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
      const viewerMessage = document.getElementById('feedback-viewer-message');
      const composerCard = document.getElementById('feedback-composer-card');
      const guestCard = document.getElementById('feedback-guest-card');
      const boardRoot = document.getElementById('feedback-board');
      const statsRoot = document.getElementById('feedback-stats');
      let viewer = { signed_in: false };

      function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (character) {
          return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          })[character];
        });
      }

      function nl2br(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
      }

      function statusClass(value) {
        return {
          planned: 'pill-feedback-planned',
          in_progress: 'pill-feedback-progress',
          shipped: 'pill-feedback-shipped'
        }[value] || 'pill-feedback-review';
      }

      function renderStats(board) {
        const stats = board && board.stats ? board.stats : { posts: 0, comments: 0, likes: 0 };
        statsRoot.innerHTML = [
          ['posts', stats.posts],
          ['comments', stats.comments],
          ['likes', stats.likes]
        ].map(function (entry) {
          return '<span><strong>' + escapeHtml(entry[1]) + '</strong> ' + escapeHtml(entry[0]) + '</span>';
        }).join('');
      }

      function renderPost(post) {
        const author = post.author || {};
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const authorHtml = author.page_url
          ? '<a href="' + escapeHtml(author.page_url) + '">' + escapeHtml(author.visible_name || 'Member') + '</a>'
          : '<span>' + escapeHtml(author.visible_name || 'Member') + '</span>';
        const likedClass = post.viewer_has_liked ? ' is-liked' : '';
        const commentForm = viewer.signed_in
          ? '<form class="feedback-comment-form" data-feedback-comment-form="' + escapeHtml(post.id) + '">'
              + '<textarea name="body" rows="3" placeholder="Add a comment" required></textarea>'
              + '<div class="message message-info" data-form-message hidden></div>'
              + '<button class="btn btn-primary" type="submit">Comment</button>'
            + '</form>'
          : '<div class="feedback-signin-inline"><a href="/signup">Create an account</a> or <a href="/login">log in</a> to comment.</div>';

        return '<article class="feedback-post" data-feedback-post-id="' + escapeHtml(post.id) + '">'
          + '<div class="feedback-post-topline">'
            + '<span class="pill feedback-pill ' + statusClass(post.status) + '">' + escapeHtml(post.status_label || 'Under review') + '</span>'
            + '<span class="feedback-meta">' + escapeHtml(post.category_label || 'Feature request') + ' - ' + escapeHtml(post.relative_created_at || 'Just now') + '</span>'
          + '</div>'
          + '<h2>' + escapeHtml(post.title || 'Untitled') + '</h2>'
          + '<p class="feedback-body">' + nl2br(post.body || '') + '</p>'
          + '<div class="feedback-author">' + authorHtml
            + ((author.handle || '') ? '<span>' + escapeHtml(author.handle) + '</span>' : '')
          + '</div>'
          + '<div class="feedback-actions">'
            + '<button class="btn btn-secondary feedback-like-button' + likedClass + '" type="button" data-feedback-like="' + escapeHtml(post.id) + '">Like <span>' + escapeHtml(post.likes_count || 0) + '</span></button>'
            + '<span class="feedback-meta">' + escapeHtml(post.comments_count || 0) + ' comments</span>'
          + '</div>'
          + '<div class="feedback-comments">'
            + (comments.length
              ? comments.map(function (comment) {
                  const commentAuthor = comment.author || {};
                  return '<article class="feedback-comment">'
                    + '<strong>' + escapeHtml(commentAuthor.visible_name || 'Member') + '</strong>'
                    + '<span>' + escapeHtml(comment.relative_created_at || 'Just now') + '</span>'
                    + '<p>' + nl2br(comment.body || '') + '</p>'
                  + '</article>';
                }).join('')
              : '<p class="feedback-empty-comments">No comments yet. Members can jump in once they sign in.</p>')
          + '</div>'
          + commentForm
        + '</article>';
      }

      function renderBoard(board) {
        renderStats(board);
        const posts = Array.isArray(board.posts) ? board.posts : [];
        if (!posts.length) {
          boardRoot.innerHTML = '<div class="empty-state"><h3>No public posts yet</h3><p>The first signed-in member to post feedback will set the tone for the board.</p></div>';
          return;
        }
        boardRoot.innerHTML = posts.map(renderPost).join('');
      }

      function setViewerUi(isSignedIn) {
        composerCard.hidden = !isSignedIn;
        guestCard.hidden = isSignedIn;
        window.myurlcFrontend.setMessage(
          viewerMessage,
          isSignedIn ? 'success' : 'info',
          isSignedIn
            ? 'You are signed in. Post ideas, like requests, and comment on updates.'
            : 'Public board is live. Sign in to post, like, and comment.'
        );
      }

      async function refreshBoard() {
        const board = await window.myurlcFrontend.apiFetch('/api/public/feedback');
        viewer = board.viewer || viewer;
        renderBoard(board);
        setViewerUi(Boolean(viewer.signed_in));
      }

      async function hydrateViewer() {
        try {
          await window.myurlcFrontend.apiFetch('/api/auth/me');
          viewer = { signed_in: true };
        } catch (error) {
          viewer = { signed_in: false };
        }
        setViewerUi(Boolean(viewer.signed_in));
      }

      document.addEventListener('DOMContentLoaded', async function () {
        renderBoard(initialBoard);
        await hydrateViewer();
        try {
          await refreshBoard();
        } catch (error) {
          // keep server-rendered board if live refresh fails
        }
      });

      document.getElementById('feedback-post-form').addEventListener('submit', async function (event) {
        event.preventDefault();
        const form = event.currentTarget;
        const message = form.querySelector('[data-form-message]');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const payload = Object.fromEntries(new FormData(form).entries());
          await window.myurlcFrontend.apiFetch('/api/customer/feedback/posts', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          form.reset();
          window.myurlcFrontend.setMessage(message, 'success', 'Posted to the board.');
          await refreshBoard();
        } catch (error) {
          window.myurlcFrontend.setMessage(message, 'error', error.message);
        } finally {
          button.disabled = false;
        }
      });

      document.addEventListener('click', async function (event) {
        const likeButton = event.target.closest('[data-feedback-like]');
        if (!likeButton) {
          return;
        }

        if (!viewer.signed_in) {
          window.location.href = '/signup';
          return;
        }

        likeButton.disabled = true;
        try {
          await window.myurlcFrontend.apiFetch('/api/customer/feedback/posts/' + encodeURIComponent(likeButton.getAttribute('data-feedback-like')) + '/likes', {
            method: 'POST'
          });
          await refreshBoard();
        } catch (error) {
          likeButton.disabled = false;
        }
      });

      document.addEventListener('submit', async function (event) {
        const form = event.target.closest('[data-feedback-comment-form]');
        if (!form) {
          return;
        }

        event.preventDefault();

        if (!viewer.signed_in) {
          window.location.href = '/signup';
          return;
        }

        const postId = form.getAttribute('data-feedback-comment-form');
        const message = form.querySelector('[data-form-message]');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const payload = Object.fromEntries(new FormData(form).entries());
          await window.myurlcFrontend.apiFetch('/api/customer/feedback/posts/' + encodeURIComponent(postId) + '/comments', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          form.reset();
          window.myurlcFrontend.setMessage(message, 'success', 'Comment posted.');
          await refreshBoard();
        } catch (error) {
          window.myurlcFrontend.setMessage(message, 'error', error.message);
        } finally {
          button.disabled = false;
        }
      });
    }());
  </script>
<?php myurlc_render_footer(); ?>
