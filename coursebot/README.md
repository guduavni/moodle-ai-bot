# local_coursebot

Floating aviation AI chat widget for Moodle course pages.

## Features

- Injects a floating button (bottom-right) only on `/course/view.php`.
- Skips quiz, question, and attempt pages.
- Hebrew RTL chat panel with greeting that includes the logged-in username and course fullname.
- Sends free-text aviation questions to the SkyTutor agent via `GET`:

  `https://skytutor-agent.vercel.app/api/moodle/chat/?username=...&course=...&q=...`

- Does **not** scrape question text, answer choices, or question IDs.
- Aviation-only scope is enforced by the agent; off-topic responses are rendered as a polite Hebrew refusal.

## Install

Copy the `coursebot/` directory into your Moodle as:

    moodle/local/coursebot/

Then visit **Site administration → Notifications** to complete installation. Compatible with Moodle 4.5 / 4.6.

## Settings

Site administration → Plugins → Local plugins → **Course AI Bot**:

- **Enabled** – toggle widget injection.
- **Chat endpoint URL** – defaults to `https://skytutor-agent.vercel.app/api/moodle/chat/`.

## Notes

- The endpoint must allow CORS from the Moodle origin (browser issues a cross-origin `GET`).
- The `course` query parameter uses the course shortname when available, otherwise the fullname.
- After modifying `amd/src/chat.js`, purge Moodle caches (or run `grunt amd` for production minification).
