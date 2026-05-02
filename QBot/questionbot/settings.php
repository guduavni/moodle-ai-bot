<?php
// Settings for local_questionbot.

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_questionbot', get_string('pluginname', 'local_questionbot'));

    $settings->add(new admin_setting_configcheckbox(
        'local_questionbot/enabled',
        get_string('enabled', 'local_questionbot'),
        get_string('enabled_desc', 'local_questionbot'),
        1
    ));

    $settings->add(new admin_setting_configtext(
        'local_questionbot/apiurl',
        get_string('apiurl', 'local_questionbot'),
        get_string('apiurl_desc', 'local_questionbot'),
        '',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configtextarea(
        'local_questionbot/systemprompt',
        get_string('systemprompt', 'local_questionbot'),
        get_string('systemprompt_desc', 'local_questionbot'),
        get_string('defaultprompt', 'local_questionbot'),
        PARAM_TEXT
    ));

    $settings->add(new admin_setting_configtext(
        'local_questionbot/buttontext',
        get_string('buttontext', 'local_questionbot'),
        get_string('buttontext_desc', 'local_questionbot'),
        get_string('defaultbuttontext', 'local_questionbot'),
        PARAM_TEXT
    ));

    $settings->add(new admin_setting_configtext(
        'local_questionbot/modaltitle',
        get_string('modaltitle', 'local_questionbot'),
        get_string('modaltitle_desc', 'local_questionbot'),
        get_string('defaultmodaltitle', 'local_questionbot'),
        PARAM_TEXT
    ));

    $ADMIN->add('localplugins', $settings);
}