<?php
// Output callback for local_coursebot.

defined('MOODLE_INTERNAL') || die();

/**
 * Inject the Course Bot AMD module on course view pages only.
 *
 * Excludes: quiz pages, question pages, attempt pages.
 */
function local_coursebot_before_footer() {
    global $PAGE, $COURSE, $USER, $OUTPUT;

    if (!isloggedin() || isguestuser()) {
        return;
    }

    if (!get_config('local_coursebot', 'enabled')) {
        return;
    }

    $url = $PAGE->url;
    if (!$url) {
        return;
    }

    $path = $url->get_path();
    $pagetype = (string)($PAGE->pagetype ?? '');

    // Only inject on /course/view.php.
    if ($path !== '/course/view.php') {
        return;
    }

    // Defensive: never inject on quiz/question/attempt page types.
    if (strpos($pagetype, 'mod-quiz') === 0
        || strpos($pagetype, 'question-') === 0
        || strpos($pagetype, 'mod-quiz-attempt') !== false) {
        return;
    }

    if (empty($COURSE) || empty($COURSE->id) || $COURSE->id == SITEID) {
        return;
    }

    $config = [
        'ajaxurl'         => (new moodle_url('/local/coursebot/ajax.php'))->out(false),
        'sesskey'         => sesskey(),
        'logourl'         => $OUTPUT->image_url('logo', 'local_coursebot')->out(false),
        'username'        => $USER->username ?? '',
        'fullname'        => fullname($USER),
        'courseid'        => (int)$COURSE->id,
        'courseshortname' => format_string($COURSE->shortname ?? ''),
        'coursefullname'  => format_string($COURSE->fullname ?? ''),
        'strings'         => [
            'buttontitle'  => get_string('buttontitle', 'local_coursebot'),
            'tagline'      => get_string('tagline', 'local_coursebot'),
            'brand'        => get_string('brand', 'local_coursebot'),
            'paneltitle'   => get_string('paneltitle', 'local_coursebot'),
            'greeting'     => get_string('greeting', 'local_coursebot'),
            'placeholder'  => get_string('placeholder', 'local_coursebot'),
            'send'         => get_string('send', 'local_coursebot'),
            'close'        => get_string('close', 'local_coursebot'),
            'thinking'     => get_string('thinking', 'local_coursebot'),
            'errorprefix'  => get_string('errorprefix', 'local_coursebot'),
            'noanswer'     => get_string('noanswer', 'local_coursebot'),
            'refusal'      => get_string('refusal', 'local_coursebot'),
        ],
    ];

    $PAGE->requires->js_call_amd('local_coursebot/chat', 'init', [$config]);
}
