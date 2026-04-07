<?php
declare(strict_types=1);

require_once __DIR__ . '/frontend.php';

$response = myurlc_fetch_text('/sitemap.xml');

header('Content-Type: application/xml; charset=UTF-8');

if ($response['ok']) {
    echo $response['body'];
    exit;
}

http_response_code(502);
echo '<?xml version="1.0" encoding="UTF-8"?><error><message>Unable to load sitemap.</message></error>';
