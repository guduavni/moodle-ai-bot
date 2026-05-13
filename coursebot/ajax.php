<?php
// Server-side proxy to the SkyTutor agent.
// Avoids browser CORS issues by calling the upstream from Moodle server.

define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');

require_login();
require_sesskey();

if (isguestuser()) {
    throw new \moodle_exception('noguest');
}

$courseid = required_param('courseid', PARAM_INT);
$course = get_course($courseid);
require_login($course);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$rawbody = file_get_contents('php://input');
$payload = json_decode($rawbody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$q = isset($payload['q']) ? trim((string)$payload['q']) : '';
if ($q === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing q']);
    exit;
}

$endpoint = get_config('local_coursebot', 'endpoint');
if (!$endpoint) {
    $endpoint = 'https://skytutor-agent.vercel.app/api/moodle/conversation/';
}

$courseparam = $course->shortname !== '' ? $course->shortname : $course->fullname;

$body = json_encode([
    'username' => $USER->username,
    'course'   => $courseparam,
    'message'  => $q,
], JSON_UNESCAPED_UNICODE);

require_once($CFG->libdir . '/filelib.php');
$curl = new \curl(['ignoresecurity' => false]);
$curl->setHeader([
    'Content-Type: application/json',
    'Accept: application/json',
]);
$response = $curl->post($endpoint, $body, [
    'CURLOPT_TIMEOUT' => 30,
    'CURLOPT_CONNECTTIMEOUT' => 10,
    'CURLOPT_FOLLOWLOCATION' => 1,
    'CURLOPT_MAXREDIRS' => 3,
]);

$httpcode = (int)$curl->get_info()['http_code'];
$errno = $curl->get_errno();

if ($errno) {
    http_response_code(502);
    echo json_encode([
        'error' => 'Upstream connection failed: ' . $curl->error,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Pass through upstream status and JSON body verbatim when possible.
http_response_code($httpcode ?: 200);

// Validate JSON; if upstream returned non-JSON, wrap it.
$decoded = json_decode($response, true);
if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
    echo json_encode([
        'error' => 'Invalid upstream response',
        'raw'   => mb_substr((string)$response, 0, 500),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo $response;
