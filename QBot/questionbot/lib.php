<?php
// Output callback for local_questionbot.

defined('MOODLE_INTERNAL') || die();

/**
 * Inject the Question Bot AMD module near the page footer.
 */
function local_questionbot_before_footer() {
    global $PAGE, $COURSE, $USER;

    if (!get_config('local_questionbot', 'enabled')) {
        return;
    }

    $path = $PAGE->url ? $PAGE->url->out_as_local_url(false) : '';
    $pagetype = $PAGE->pagetype ?? '';

    $allowed = false;
    $allowedpaths = [
        '/mod/quiz/attempt.php',
        '/mod/quiz/review.php',
        '/mod/quiz/summary.php',
        '/question/preview.php',
    ];

    foreach ($allowedpaths as $allowedpath) {
        if (strpos($path, $allowedpath) === 0 || strpos($path, $allowedpath) !== false) {
            $allowed = true;
            break;
        }
    }

    if (!$allowed && strpos($pagetype, 'mod-quiz') === false && strpos($pagetype, 'question-preview') === false) {
        return;
    }

    $config = [
        'ajaxurl' => (new moodle_url('/local/questionbot/ajax.php'))->out(false),
        'buttontext' => get_config('local_questionbot', 'buttontext') ?: get_string('defaultbuttontext', 'local_questionbot'),
        'modaltitle' => get_config('local_questionbot', 'modaltitle') ?: get_string('defaultmodaltitle', 'local_questionbot'),
        'sendbuttontext' => get_string('sendbutton', 'local_questionbot'),
        'inputplaceholder' => get_string('inputplaceholder', 'local_questionbot'),
        'noanswertext' => get_string('noanswer', 'local_questionbot'),
        'errorprefix' => get_string('errorprefix', 'local_questionbot'),
        'courseid' => $COURSE->id ?? 0,
        'coursename' => format_string($COURSE->fullname ?? ''),
        'userid' => $USER->id ?? 0,
        'sesskey' => sesskey(),
        'rtl' => right_to_left(),
    ];

    $PAGE->requires->js_call_amd('local_questionbot/questionbot', 'init', [$config]);
}