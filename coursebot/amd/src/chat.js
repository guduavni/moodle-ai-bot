// AMD module for local_coursebot - floating aviation chat widget.
// Hebrew RTL UI, injected only on /course/view.php (gated server-side in lib.php).

define('local_coursebot/chat', [], function() {
    'use strict';

    function injectStyles() {
        if (document.getElementById('local-coursebot-style')) {
            return;
        }
        var css =
            '#lcb-launcher{position:fixed;bottom:20px;right:20px;z-index:99998;' +
            'display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;' +
            'font-family:inherit;direction:rtl;}' +
            '#lcb-fab{width:96px;height:96px;border-radius:50%;background:#0f6cbf;' +
            'border:4px solid #0f6cbf;box-shadow:0 6px 20px rgba(0,0,0,.28);' +
            'display:flex;align-items:center;justify-content:center;overflow:hidden;' +
            'transition:transform .15s ease, box-shadow .15s ease;padding:0;}' +
            '#lcb-launcher:hover #lcb-fab{transform:scale(1.06);box-shadow:0 8px 24px rgba(0,0,0,.32);}' +
            '#lcb-fab img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;background:#fff;}' +
            '#lcb-caption{background:rgba(255,255,255,.95);color:#0f3a6b;font-size:12px;font-weight:600;' +
            'padding:4px 10px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.15);text-align:center;' +
            'line-height:1.3;white-space:nowrap;}' +
            '#lcb-caption .lcb-brand{color:#0f6cbf;font-weight:700;font-size:13px;}' +
            '#lcb-caption .lcb-tagline{display:block;font-size:11px;color:#555;font-weight:500;}' +
            '#lcb-panel{position:fixed;bottom:120px;right:24px;width:380px;height:540px;' +
            'min-width:280px;min-height:320px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);' +
            'background:#fff;border:1px solid #d0d7de;border-radius:12px;' +
            'box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;' +
            'z-index:99999;direction:rtl;font-family:inherit;overflow:hidden;resize:both;}' +
            '#lcb-panel.open{display:flex;}' +
            '#lcb-panel.dragging{user-select:none;transition:none;}' +
            '#lcb-header{background:#0f6cbf;color:#fff;padding:12px 14px;display:flex;align-items:center;' +
            'justify-content:space-between;cursor:move;user-select:none;}' +
            '#lcb-header h3{margin:0;font-size:15px;font-weight:600;}' +
            '#lcb-close{background:transparent;color:#fff;border:none;font-size:20px;cursor:pointer;line-height:1;}' +
            '#lcb-thread{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:#f7f9fb;}' +
            '.lcb-bubble{padding:9px 12px;border-radius:10px;line-height:1.55;white-space:pre-wrap;' +
            'word-wrap:break-word;max-width:86%;font-size:14px;}' +
            '.lcb-bubble-bot{align-self:flex-start;background:#fff;border:1px solid #e1e6eb;}' +
            '.lcb-bubble-user{align-self:flex-end;background:#dbeafe;border:1px solid #b7d4f5;}' +
            '.lcb-bubble-error{align-self:flex-start;background:#fff1f0;border:1px solid #ffccc7;color:#a8071a;}' +
            '.lcb-bubble-refusal{align-self:flex-start;background:#fff7e6;border:1px solid #ffd591;color:#7a4a00;}' +
            '#lcb-input-row{display:flex;gap:6px;padding:10px;border-top:1px solid #e1e6eb;background:#fff;}' +
            '#lcb-input{flex:1;min-height:40px;max-height:110px;padding:8px 10px;border:1px solid #ccc;' +
            'border-radius:8px;font:inherit;resize:none;direction:rtl;}' +
            '#lcb-send{background:#0f6cbf;color:#fff;border:none;padding:0 14px;border-radius:8px;cursor:pointer;}' +
            '#lcb-send:disabled,#lcb-input:disabled{opacity:.5;cursor:not-allowed;}' +
            '@keyframes lcb-wave{0%{transform:translateY(0);}30%{transform:translateY(-3px);}60%{transform:translateY(0);}100%{transform:translateY(0);}}' +
            '.lcb-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#0f6cbf;' +
            'margin:0 1px;animation:lcb-wave 1s infinite ease-in-out;}' +
            '.lcb-dot:nth-child(2){animation-delay:.15s;}' +
            '.lcb-dot:nth-child(3){animation-delay:.3s;}';
        var style = document.createElement('style');
        style.id = 'local-coursebot-style';
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function formatString(template, params) {
        return String(template).replace(/\{\$a->(\w+)\}/g, function(_, key) {
            return params && params[key] != null ? params[key] : '';
        });
    }

    function buildLoading() {
        var span = document.createElement('span');
        for (var i = 0; i < 3; i++) {
            var d = document.createElement('span');
            d.className = 'lcb-dot';
            span.appendChild(d);
        }
        return span;
    }

    return {
        init: function(config) {
            if (window.__localCoursebotLoaded) {
                return;
            }
            window.__localCoursebotLoaded = true;

            if (!config || !config.ajaxurl) {
                return;
            }

            var strings = config.strings || {};
            var ajaxurl = config.ajaxurl;
            var sesskey = config.sesskey || '';
            var courseid = config.courseid || 0;
            var username = config.username || '';
            var courseLabel = config.coursefullname || config.courseshortname || '';

            injectStyles();

            // Launcher: circular logo button + caption underneath.
            var launcher = document.createElement('div');
            launcher.id = 'lcb-launcher';
            launcher.setAttribute('role', 'button');
            launcher.setAttribute('tabindex', '0');
            launcher.title = strings.buttontitle || '';
            launcher.setAttribute('aria-label', strings.buttontitle || 'chat');

            var fab = document.createElement('div');
            fab.id = 'lcb-fab';
            if (config.logourl) {
                var logoImg = document.createElement('img');
                logoImg.src = config.logourl;
                logoImg.alt = strings.brand || 'Go Yeda';
                fab.appendChild(logoImg);
            }

            var caption = document.createElement('div');
            caption.id = 'lcb-caption';
            var brandSpan = document.createElement('span');
            brandSpan.className = 'lcb-brand';
            brandSpan.innerText = strings.brand || 'Go Yeda';
            var taglineSpan = document.createElement('span');
            taglineSpan.className = 'lcb-tagline';
            taglineSpan.innerText = strings.tagline || '';
            caption.appendChild(brandSpan);
            caption.appendChild(taglineSpan);

            launcher.appendChild(fab);
            launcher.appendChild(caption);

            // Panel.
            var panel = document.createElement('div');
            panel.id = 'lcb-panel';
            panel.dir = 'rtl';
            panel.lang = 'he';

            var header = document.createElement('div');
            header.id = 'lcb-header';
            var title = document.createElement('h3');
            title.innerText = strings.paneltitle || 'SkyTutor';
            var closeBtn = document.createElement('button');
            closeBtn.id = 'lcb-close';
            closeBtn.type = 'button';
            closeBtn.innerText = '\u00d7';
            closeBtn.setAttribute('aria-label', strings.close || 'close');
            header.appendChild(title);
            header.appendChild(closeBtn);

            var thread = document.createElement('div');
            thread.id = 'lcb-thread';

            var inputRow = document.createElement('div');
            inputRow.id = 'lcb-input-row';
            var input = document.createElement('textarea');
            input.id = 'lcb-input';
            input.rows = 1;
            input.placeholder = strings.placeholder || '';
            var sendBtn = document.createElement('button');
            sendBtn.id = 'lcb-send';
            sendBtn.type = 'button';
            sendBtn.innerText = strings.send || 'Send';
            inputRow.appendChild(input);
            inputRow.appendChild(sendBtn);

            panel.appendChild(header);
            panel.appendChild(thread);
            panel.appendChild(inputRow);

            document.body.appendChild(launcher);
            document.body.appendChild(panel);

            var greeted = false;
            var inFlight = false;

            function appendBubble(role, text) {
                var bubble = document.createElement('div');
                bubble.className = 'lcb-bubble lcb-bubble-' + role;
                if (text === null || text === undefined) {
                    bubble.appendChild(buildLoading());
                } else {
                    bubble.innerText = text;
                }
                thread.appendChild(bubble);
                thread.scrollTop = thread.scrollHeight;
                return bubble;
            }

            function setBubble(bubble, text, role) {
                if (!bubble || !bubble.isConnected) {
                    return;
                }
                bubble.innerText = text;
                if (role) {
                    bubble.className = 'lcb-bubble lcb-bubble-' + role;
                }
                thread.scrollTop = thread.scrollHeight;
            }

            function setBusy(state) {
                inFlight = state;
                sendBtn.disabled = state;
                input.disabled = state;
            }

            function openPanel() {
                panel.classList.add('open');
                if (!greeted) {
                    var greet = formatString(strings.greeting || '', {
                        name: username,
                        course: courseLabel
                    });
                    appendBubble('bot', greet);
                    greeted = true;
                }
                setTimeout(function() {
                    try { input.focus(); } catch (e) { /* noop */ }
                }, 50);
            }

            function closePanel() {
                panel.classList.remove('open');
            }

            function send() {
                if (inFlight) {
                    return;
                }
                var q = (input.value || '').trim();
                if (!q) {
                    return;
                }
                input.value = '';
                appendBubble('user', q);
                var pending = appendBubble('bot', null);
                setBusy(true);

                var url = ajaxurl
                    + (ajaxurl.indexOf('?') >= 0 ? '&' : '?')
                    + 'sesskey=' + encodeURIComponent(sesskey)
                    + '&courseid=' + encodeURIComponent(String(courseid));

                fetch(url, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ q: q })
                }).then(function(r) {
                    return r.json().then(function(data) {
                        return { ok: r.ok, data: data };
                    });
                }).then(function(res) {
                    var data = res.data || {};
                    var answer = data.answer || data.message || data.text || '';
                    var refused = data.refused === true
                        || data.aviation === false
                        || data.ontopic === false
                        || data.status === 'refused';
                    if (!res.ok) {
                        var errText = data.error || data.message || ((strings.errorprefix || '') + 'HTTP error');
                        setBubble(pending, errText, 'error');
                    } else if (refused) {
                        setBubble(pending, answer || strings.refusal || '', 'refusal');
                    } else if (answer) {
                        setBubble(pending, answer, 'bot');
                    } else {
                        setBubble(pending, strings.noanswer || '', 'error');
                    }
                }).catch(function(err) {
                    setBubble(pending, (strings.errorprefix || '') + (err && err.message ? err.message : ''), 'error');
                }).then(function() {
                    setBusy(false);
                    try { input.focus(); } catch (e) { /* noop */ }
                });
            }

            function toggle() {
                if (panel.classList.contains('open')) {
                    closePanel();
                } else {
                    openPanel();
                }
            }
            launcher.addEventListener('click', toggle);
            launcher.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });
            closeBtn.addEventListener('click', closePanel);
            sendBtn.addEventListener('click', send);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });

            // Drag the panel by its header. Switches anchoring from
            // bottom/right to top/left on first drag so positioning is stable.
            (function enableDrag() {
                var dragging = false;
                var startX = 0, startY = 0, startLeft = 0, startTop = 0;

                function onMouseDown(e) {
                    if (e.button !== 0) {
                        return;
                    }
                    if (e.target && e.target.closest && e.target.closest('#lcb-close')) {
                        return;
                    }
                    var rect = panel.getBoundingClientRect();
                    // Pin to top/left so dragging math is straightforward and
                    // the panel does not jump when window/viewport changes.
                    panel.style.left = rect.left + 'px';
                    panel.style.top = rect.top + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                    startX = e.clientX;
                    startY = e.clientY;
                    startLeft = rect.left;
                    startTop = rect.top;
                    dragging = true;
                    panel.classList.add('dragging');
                    e.preventDefault();
                }

                function onMouseMove(e) {
                    if (!dragging) {
                        return;
                    }
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    var newLeft = startLeft + dx;
                    var newTop = startTop + dy;
                    var w = panel.offsetWidth;
                    var h = panel.offsetHeight;
                    var maxLeft = window.innerWidth - w;
                    var maxTop = window.innerHeight - h;
                    if (newLeft < 0) { newLeft = 0; }
                    if (newTop < 0) { newTop = 0; }
                    if (newLeft > maxLeft) { newLeft = maxLeft; }
                    if (newTop > maxTop) { newTop = maxTop; }
                    panel.style.left = newLeft + 'px';
                    panel.style.top = newTop + 'px';
                }

                function onMouseUp() {
                    if (!dragging) {
                        return;
                    }
                    dragging = false;
                    panel.classList.remove('dragging');
                }

                header.addEventListener('mousedown', onMouseDown);
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            })();
        }
    };
});
