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

    $questiontext = trim($input['questiontext'] ?? '');
    $answers = $input['answers'] ?? [];
    $courseid = (int)($input['courseid'] ?? 0);

    if ($questiontext === '') {
        echo json_encode([
            'answer' => 'לא זוהה טקסט שאלה.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // שליפת שם הקורס המלא מתוך Moodle.
    $coursename = 'unknown_course';

    if ($courseid > 0) {
        $course = $DB->get_record('course', ['id' => $courseid], 'id, fullname, shortname', IGNORE_MISSING);

        if ($course && !empty($course->fullname)) {
            $coursename = format_string($course->fullname);
        }
    }

    // fallback אם לא הצלחנו לשלוף מה־DB.
    if ($coursename === 'unknown_course' && !empty($input['coursename'])) {
        $coursename = trim($input['coursename']);
    }

    // שם מלא של המשתמש במודל.
    $username = $USER->username;

    // בניית טקסט התשובות.
    $answersText = '';

    if (is_array($answers) && count($answers) > 0) {
        foreach ($answers as $i => $a) {
            $answersText .= ($i + 1) . ". " . trim($a) . "\n";
        }
    }

    // בניית השאלה לבוט.
    $q = "ענה בעברית כמדריך תאוריה תעופתית מקצועי.\n\n";
    $q .= "הסבר את השאלה הבאה לחניך טיס פרטי.\n";
    $q .= "אל תסתפק בתשובה קצרה. הסבר את העיקרון התעופתי, את דרך החשיבה, ולמה תשובות אחרות אינן מתאימות אם ניתן להסיק זאת מהנתונים.\n\n";
    $q .= "שאלה:\n" . $questiontext . "\n\n";

    if ($answersText !== '') {
        $q .= "אפשרויות תשובה:\n" . $answersText;
    }

    // כתובת API מתוך הגדרות התוסף, עם fallback.
    $apiurl = trim((string)get_config('local_questionbot', 'apiurl'));

    if ($apiurl === '') {
        $apiurl = 'https://skytutor-agent.vercel.app/api/moodle/chat/';
    }

    // פרמטרים שהשרת שלך מצפה לקבל.
    $params = [
        'username' => $username,
        'course' => $coursename,
        'q' => $q
    ];

    $url = $apiurl . '?' . http_build_query($params);

    $curl = new curl();

    $response = $curl->get($url, [], [
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

        echo json_encode([
            'answer' => $answer
        ], JSON_UNESCAPED_UNICODE);
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