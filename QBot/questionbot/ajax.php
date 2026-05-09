<?php
require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/filelib.php');

require_login();

global $DB, $USER;

header('Content-Type: application/json; charset=utf-8');

try {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    if (!is_array($input)) {
        echo json_encode([
            'answer' => 'לא התקבל מידע תקין מהעמוד.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $kind = isset($input['kind']) ? (string)$input['kind'] : 'initial';
    $courseid = (int)($input['courseid'] ?? 0);

    // Resolve course name from the Moodle DB; fall back to client-supplied value.
    $coursename = 'unknown_course';

    if ($courseid > 0) {
        $course = $DB->get_record('course', ['id' => $courseid], 'id, fullname, shortname', IGNORE_MISSING);

        if ($course && !empty($course->fullname)) {
            $coursename = format_string($course->fullname);
        }
    }

    if ($coursename === 'unknown_course' && !empty($input['coursename'])) {
        $coursename = trim((string)$input['coursename']);
    }

    $username = $USER->username;

    // Build the upstream question text from the turn kind.
    if ($kind === 'followup') {
        $question = trim((string)($input['message'] ?? ''));

        if ($question === '') {
            echo json_encode([
                'answer' => 'לא הוקלדה שאלה.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    } else {
        // Default ("initial"): build the Hebrew aviation-tutor framing from the
        // scraped question + answer choices. Skytutor's persisted system prompt
        // and per-day session context handle continuity for follow-ups, so the
        // framing is only attached to the very first turn.
        $questiontext = trim((string)($input['questiontext'] ?? ''));
        $answers = $input['answers'] ?? [];

        if ($questiontext === '') {
            echo json_encode([
                'answer' => 'לא זוהה טקסט שאלה.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $answerstext = '';

        if (is_array($answers) && count($answers) > 0) {
            foreach ($answers as $i => $a) {
                $answerstext .= ($i + 1) . ". " . trim((string)$a) . "\n";
            }
        }

        $question  = "ענה בעברית כמדריך תאוריה תעופתית מקצועי.\n\n";
        $question .= "הסבר את השאלה הבאה לחניך טיס פרטי.\n";
        $question .= "אל תסתפק בתשובה קצרה. הסבר את העיקרון התעופתי, את דרך החשיבה, ולמה תשובות אחרות אינן מתאימות אם ניתן להסיק זאת מהנתונים.\n\n";
        $question .= "שאלה:\n" . $questiontext . "\n\n";

        if ($answerstext !== '') {
            $question .= "אפשרויות תשובה:\n" . $answerstext;
        }
    }

    // Resolve upstream API URL from plugin settings, with skytutor as fallback.
    $apiurl = trim((string)get_config('local_questionbot', 'apiurl'));

    if ($apiurl === '') {
        $apiurl = 'https://skytutor-agent.vercel.app/api/moodle/chat/';
    }

    $payload = [
        'username' => $username,
        'course'   => $coursename,
        'question' => $question
    ];

    $jsonbody = json_encode($payload, JSON_UNESCAPED_UNICODE);

    $curl = new curl();
    $curl->setHeader([
        'Content-Type: application/json',
        'Accept: application/json'
    ]);

    $response = $curl->post($apiurl, $jsonbody, [
        'CURLOPT_TIMEOUT' => 60,
        'CURLOPT_CONNECTTIMEOUT' => 15
    ]);

    $info = $curl->get_info();
    $errno = $curl->get_errno();
    $error = $curl->error ?? '';

    $httpcode = isset($info['http_code']) ? (int)$info['http_code'] : 0;

    if ($errno) {
        echo json_encode([
            'answer' => "שגיאת תקשורת מול הבוט.\n\nCURL ERROR: " . $error
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($httpcode === 401) {
        echo json_encode([
            'answer' =>
                "הבוט דחה את הבקשה בהרשאה 401.\n\n" .
                "נשלחו הפרטים הבאים:\n" .
                "שם משתמש: " . $username . "\n" .
                "קורס: " . $coursename . "\n\n" .
                "יש לוודא שבשרת הבוט שם המשתמש ושם הקורס מוגדרים כמאושרים."
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($httpcode < 200 || $httpcode >= 300) {
        echo json_encode([
            'answer' =>
                "הבוט החזיר שגיאת HTTP: " . $httpcode . "\n\n" .
                "תשובת שרת:\n" . $response
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!$response) {
        echo json_encode([
            'answer' => 'לא התקבלה תשובה מהבוט.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $decoded = json_decode($response, true);

    if (is_array($decoded)) {
        $answer =
            $decoded['answer'] ??
            $decoded['message'] ??
            $decoded['response'] ??
            $decoded['text'] ??
            json_encode($decoded, JSON_UNESCAPED_UNICODE);

        $out = ['answer' => $answer];

        if (!empty($decoded['sessionId'])) {
            $out['sessionId'] = (string)$decoded['sessionId'];
        }

        echo json_encode($out, JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'answer' => $response
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    echo json_encode([
        'answer' => 'שגיאה בחיבור לבוט: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
