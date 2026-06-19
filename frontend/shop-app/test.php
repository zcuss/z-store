<?php
header('Content-Type: text/plain');
echo "PHP version: " . PHP_VERSION . "\n";
echo "allow_url_fopen: " . (ini_get('allow_url_fopen') ? 'on' : 'off') . "\n";
echo "curl_init exists: " . (function_exists('curl_init') ? 'yes' : 'no') . "\n";
echo "disable_functions: " . ini_get('disable_functions') . "\n";
echo "open_basedir: " . (ini_get('open_basedir') ?: '(none)') . "\n";
echo "\n--- test fopen localhost ---\n";
$r = @file_get_contents('http://127.0.0.1:3000/api/health');
echo "fopen result: " . ($r ?: 'FAILED') . "\n";
echo "fopen error: " . (error_get_last()['message'] ?? 'none') . "\n";
echo "\n--- test fsockopen ---\n";
$fp = @fsockopen('127.0.0.1', 3000, $errno, $errstr, 5);
if ($fp) {
    fwrite($fp, "GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n");
    echo stream_get_contents($fp) . "\n";
    fclose($fp);
} else {
    echo "fsockopen FAILED: $errstr ($errno)\n";
}
echo "\n--- test curl ---\n";
$ch = curl_init('http://127.0.0.1:3000/api/health');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
$out = curl_exec($ch);
echo "curl result: " . ($out ?: 'FAILED') . "\n";
echo "curl errno: " . curl_errno($ch) . " " . curl_error($ch) . "\n";
curl_close($ch);
