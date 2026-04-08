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

function myurlc_platform_badge(string $platform): string {
    $map = [
        'instagram' => 'IG',
        'facebook' => 'FB',
        'tiktok' => 'TT',
        'linkedin' => 'IN',
        'youtube' => 'YT',
        'x' => 'X',
        'whatsapp' => 'WA',
        'text' => 'TX',
        'email' => '@',
        'phone' => 'TL',
        'custom' => 'GO'
    ];

    return $map[$platform] ?? 'GO';
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
