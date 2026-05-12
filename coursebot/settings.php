<?php
defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_coursebot', get_string('pluginname', 'local_coursebot'));
    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configcheckbox(
        'local_coursebot/enabled',
        get_string('enabled', 'local_coursebot'),
        get_string('enabled_desc', 'local_coursebot'),
        1
    ));

    $settings->add(new admin_setting_configtext(
        'local_coursebot/endpoint',
        get_string('endpoint', 'local_coursebot'),
        get_string('endpoint_desc', 'local_coursebot'),
        'https://skytutor-agent.vercel.app/api/moodle/chat/',
        PARAM_URL
    ));
}
