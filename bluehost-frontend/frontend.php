<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function myurlc_html($value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function myurlc_join_url(string $baseUrl, string $path = '/'): string {
    $trimmedBase = rtrim($baseUrl, '/');
    $cleanPath = '/' . ltrim($path, '/');
    return $cleanPath === '/' ? $trimmedBase : $trimmedBase . $cleanPath;
}

function myurlc_api_url(string $path = '/'): string {
    return myurlc_join_url(MYURLC_API_BASE_URL, $path);
}

function myurlc_public_url(string $path = '/'): string {
    return myurlc_join_url(MYURLC_PUBLIC_WEB_URL, $path);
}

function myurlc_fetch_json(string $path): array {
    $url = myurlc_api_url($path);
    $body = '';
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_USERAGENT => 'myurlc-bluehost-frontend/1.0'
        ]);
        $body = (string) curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\nUser-Agent: myurlc-bluehost-frontend/1.0\r\n",
                'timeout' => 10
            ]
        ]);
        $body = (string) @file_get_contents($url, false, $context);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
            $status = (int) $matches[1];
        }
    }

    $decoded = json_decode($body, true);
    return [
        'status' => $status,
        'ok' => is_array($decoded) && !empty($decoded['ok']),
        'data' => is_array($decoded) ? $decoded : null
    ];
}

function myurlc_fetch_text(string $path): array {
    $url = myurlc_api_url($path);
    $body = '';
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'myurlc-bluehost-frontend/1.0'
        ]);
        $body = (string) curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "User-Agent: myurlc-bluehost-frontend/1.0\r\n",
                'timeout' => 10
            ]
        ]);
        $body = (string) @file_get_contents($url, false, $context);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
            $status = (int) $matches[1];
        }
    }

    return [
        'status' => $status,
        'ok' => $status >= 200 && $status < 300 && $body !== '',
        'body' => $body
    ];
}

function myurlc_icon_markup(string $name, string $className = 'ui-icon'): string {
    $classAttr = myurlc_html($className);
    $icons = [
        'home' => '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/>',
        'plus' => '<path d="M12 5v14"/><path d="M5 12h14"/>',
        'share' => '<path d="M15 8a3 3 0 1 0-2.9-3.75"/><path d="M6 14a3 3 0 1 0 2.86 3.9"/><path d="M18 19a3 3 0 1 0-.02-6"/><path d="m8.6 15.5 6.8 3.1"/><path d="m15.4 5.4-6.8 3.2"/>',
        'chevron-right' => '<path d="m9 6 6 6-6 6"/>',
        'instagram' => '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
        'facebook' => '<path d="M14.5 8H17V4.5h-2.5C11.8 4.5 10 6.3 10 9v2H7v3.5h3V20h3.8v-5.5H17L17.5 11h-3.7V9c0-.66.54-1 1.2-1Z"/>',
        'tiktok' => '<path d="M14 4c.5 1.7 1.8 3.4 4 4.1v2.8c-1.4-.05-2.6-.45-3.7-1.2V15a5 5 0 1 1-5-5c.3 0 .6.02.9.08v2.9a2.2 2.2 0 1 0 1.9 2.18V4H14Z"/>',
        'linkedin' => '<path d="M6.2 8.6a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2Z"/><path d="M4.7 10.2h3v8.1h-3z"/><path d="M10.6 10.2h2.9v1.1h.04c.4-.72 1.4-1.48 2.87-1.48 3.08 0 3.64 1.97 3.64 4.54v3.96h-3.04v-3.5c0-.84-.02-1.92-1.2-1.92-1.2 0-1.38.9-1.38 1.85v3.57h-3.03z"/>',
        'youtube' => '<path d="M20.2 8.4a2.5 2.5 0 0 0-1.76-1.77C16.9 6.2 12 6.2 12 6.2s-4.9 0-6.44.43A2.5 2.5 0 0 0 3.8 8.4C3.4 9.95 3.4 12 3.4 12s0 2.05.4 3.6a2.5 2.5 0 0 0 1.76 1.77c1.54.43 6.44.43 6.44.43s4.9 0 6.44-.43a2.5 2.5 0 0 0 1.76-1.77c.4-1.55.4-3.6.4-3.6s0-2.05-.4-3.6Z"/><path d="m10 15.2 4.8-3.2L10 8.8z"/>',
        'x' => '<path d="M4.5 4.5h3.6l3.4 4.9 4.2-4.9h3.1l-5.9 6.8 6.2 8.2h-3.6l-3.8-5.2-4.5 5.2H4.1l6.3-7.2z"/>',
        'whatsapp' => '<path d="M20 11.7A8 8 0 0 1 8.2 18.8L4 20l1.3-4A8 8 0 1 1 20 11.7Z"/><path d="M9.3 8.9c.2-.4.35-.43.6-.44h.5c.16 0 .41.06.63.53.22.47.75 1.83.82 1.96.06.13.1.28.02.46-.08.17-.13.28-.26.44-.13.15-.27.34-.38.46-.13.14-.27.3-.12.58.15.29.67 1.1 1.44 1.78.99.87 1.82 1.15 2.08 1.28.26.13.41.11.56-.07.15-.18.65-.76.82-1.03.17-.27.34-.22.57-.13.23.09 1.48.7 1.74.83.26.13.43.19.49.3.06.11.06.66-.15 1.3-.21.64-1.22 1.23-1.7 1.3-.44.07-.98.1-1.58-.1-.37-.12-.84-.28-1.44-.54-2.53-1.1-4.17-3.67-4.3-3.84-.13-.17-1.03-1.36-1.03-2.6s.64-1.85.87-2.11Z"/>',
        'text' => '<path d="M4.5 6.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4.5 3v-3H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"/>',
        'email' => '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m5 8 7 5 7-5"/>',
        'phone' => '<path d="M7.2 4.5h3.1l1.2 3.4-1.7 1.2a13 13 0 0 0 5.2 5.2l1.2-1.7 3.4 1.2v3.1c0 .8-.6 1.4-1.4 1.4A14.3 14.3 0 0 1 5.8 5.9c0-.78.63-1.4 1.4-1.4Z"/>',
        'custom' => '<path d="M10 14 18 6"/><path d="M12 6h6v6"/><path d="M14 10v8H6V8h8"/>'
    ];

    $paths = $icons[$name] ?? $icons['custom'];
    return '<svg class="' . $classAttr . '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' . $paths . '</svg>';
}

function myurlc_platform_icon_name(string $platform): string {
    $platform = strtolower(trim($platform));
    $map = [
        'instagram' => 'instagram',
        'facebook' => 'facebook',
        'tiktok' => 'tiktok',
        'linkedin' => 'linkedin',
        'youtube' => 'youtube',
        'x' => 'x',
        'whatsapp' => 'whatsapp',
        'text' => 'text',
        'email' => 'email',
        'phone' => 'phone',
        'custom' => 'custom'
    ];

    return $map[$platform] ?? 'custom';
}

function myurlc_render_head(string $pageTitle, string $description, string $canonicalUrl, string $bodyClass = ''): void {
    $title = $pageTitle ? $pageTitle . ' | ' . MYURLC_SITE_NAME : MYURLC_SITE_NAME;
    if (!headers_sent()) {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
        header('X-myurlc-frontend-version: ' . MYURLC_FRONTEND_VERSION);
    }
    ?>
<!DOCTYPE html>
<html lang="en" data-api-base-url="<?= myurlc_html(MYURLC_API_BASE_URL) ?>" data-build="<?= myurlc_html(MYURLC_FRONTEND_VERSION) ?>">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#10131f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="myurlc-frontend-version" content="<?= myurlc_html(MYURLC_FRONTEND_VERSION) ?>">
  <title><?= myurlc_html($title) ?></title>
  <meta name="description" content="<?= myurlc_html($description) ?>">
  <link rel="canonical" href="<?= myurlc_html($canonicalUrl) ?>">
  <meta property="og:site_name" content="<?= myurlc_html(MYURLC_SITE_NAME) ?>">
  <meta property="og:title" content="<?= myurlc_html($title) ?>">
  <meta property="og:description" content="<?= myurlc_html($description) ?>">
  <meta property="og:url" content="<?= myurlc_html($canonicalUrl) ?>">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<?= myurlc_html($title) ?>">
  <meta name="twitter:description" content="<?= myurlc_html($description) ?>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144;700&family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/site.css?v=<?= myurlc_html(MYURLC_FRONTEND_VERSION) ?>">
</head>
<body class="<?= myurlc_html($bodyClass) ?>">
<?php
}

function myurlc_render_topbar(string $active = ''): void {
    ?>
<div class="site-shell">
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-badge"></span>
      <span class="brand-copy"><?= myurlc_html(MYURLC_SITE_NAME) ?></span>
    </a>
    <nav class="topbar-links" aria-label="Primary">
      <a class="<?= $active === 'support' ? 'is-active' : '' ?>" href="/support">Support</a>
      <a class="<?= $active === 'login' ? 'is-active' : '' ?>" href="/login">Log in</a>
      <a class="btn btn-primary" href="/signup">Create your page</a>
    </nav>
  </header>
<?php
}

function myurlc_render_footer(): void {
    ?>
  <footer class="site-footer">
    <p>Bluehost frontend. Railway backend. Fast pages, live analytics, and lead capture on one stack.</p>
    <p><a href="/support">Support</a> <span class="footer-divider">|</span> <a href="mailto:<?= myurlc_html(MYURLC_SUPPORT_EMAIL) ?>"><?= myurlc_html(MYURLC_SUPPORT_EMAIL) ?></a></p>
  </footer>
</div>
<script src="/assets/site.js?v=<?= myurlc_html(MYURLC_FRONTEND_VERSION) ?>"></script>
</body>
</html>
<?php
}
