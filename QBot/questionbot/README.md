# Moodle Local Question Bot

`local_questionbot` injects an automatic AI help button into Moodle quiz questions.

## Installation

1. Create folder:
   `moodle/local/questionbot`
2. Copy all plugin files into that folder.
3. Run Moodle upgrade from:
   Site administration → Notifications
4. Go to:
   Site administration → Plugins → Local plugins → Question Bot
5. Configure Bot API URL.
6. Purge caches.

## Expected external Bot API response

The external bot API should accept POST JSON and return one of:

```json
{"answer": "Explanation text"}