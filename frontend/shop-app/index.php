<?php
// Zcus Shop — PHP reverse proxy to NodeJS app on 127.0.0.1:3000
// Forwards HTTP method, headers, body, query string.

$NODE_HOST = '127.0.0.1';
$NODE_PORT = 3001;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = $_SERVER['REQUEST_URI'] ?? '/';

// Build target URL
$target = "http://{$NODE_HOST}:{$NODE_PORT}{$uri}";

// Build headers to forward
$skip = ['Host', 'Content-Length', 'Connection'];
$headers = [];
foreach ($_SERVER as $k => $v) {
    if (strpos($k, 'HTTP_') === 0) {
        $name = str_replace('_', '-', substr($k, 5));
        $name = ucwords(strtolower($name), '-');
        if (in_array($name, $skip)) continue;
        $headers[] = "{$name}: {$v}";
    }
}
// Add Content-Type for POST/PUT
if (in_array($method, ['POST','PUT','PATCH']) && isset($_SERVER['CONTENT_TYPE'])) {
    $headers[] = "Content-Type: " . $_SERVER['CONTENT_TYPE'];
}
$headers[] = "X-Forwarded-Proto: " . ($_SERVER['HTTPS'] ?? 'off');
$headers[] = "X-Forwarded-Host: " . ($_SERVER['HTTP_HOST'] ?? '');

// cURL
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $target,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HEADER         => true,
]);
if (in_array($method, ['POST','PUT','PATCH','DELETE'])) {
    $body = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
$info = curl_getinfo($ch);
$err = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: text/plain');
    echo "Proxy error: {$err}\nNodeJS app mungkin belum jalan di {$NODE_HOST}:{$NODE_PORT}.";
    exit;
}

// Split headers & body
$rawHeaders = substr($response, 0, $info['header_size']);
$body = substr($response, $info['header_size']);

// Forward response status
http_response_code($info['http_code']);

// Forward response headers (skip Transfer-Encoding & Connection)
foreach (explode("\r\n", $rawHeaders) as $line) {
    if (strpos($line, ':') === false) continue;
    list($name, $val) = explode(':', $line, 2);
    $name = trim($name);
    $val  = trim($val);
    if (in_array(strtolower($name), ['transfer-encoding','connection','content-length','keep-alive'])) continue;
    header("{$name}: {$val}", true);
}

echo $body;
