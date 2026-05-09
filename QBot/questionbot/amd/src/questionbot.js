define("local_questionbot/questionbot", [], function() {
    return {
        init: function(config) {

            console.log("QB CHAT MODE v1");

            var ajaxurl = config.ajaxurl;
            var sesskey = config.sesskey;
            var modalTitle = config.modaltitle || "הסבר מהבוט";
            var sendButtonText = config.sendbuttontext || "שלח";
            var inputPlaceholder = config.inputplaceholder || "כתוב שאלה המשך...";
            var noAnswerText = config.noanswertext || "לא התקבלה תשובה.";
            var errorPrefix = config.errorprefix || "שגיאה: ";

            // ----- Text scraping helpers (unchanged behavior) -----

            function cleanText(text) {
                return (text || "")
                    .replace(/\s+/g, " ")
                    .replace(/^question-[0-9-]+\s*/i, "")
                    .replace(/Explain this question/g, "")
                    .replace(/הסבר לי את השאלה/g, "")
                    .replace(/❓/g, "")
                    .replace(/בחר בתשובה אחת/g, "")
                    .replace(/Select one:/gi, "")
                    .replace(/איפוס הבחירה שלי/g, "")
                    .trim();
            }

            function getQuestion(q) {
                var el = q.querySelector(".qtext");
                if (!el) {
                    return "";
                }

                var clone = el.cloneNode(true);

                clone.querySelectorAll("button,.questionbot-btn").forEach(function(x) {
                    x.remove();
                });

                return cleanText(clone.innerText || clone.textContent || "");
            }

            function getAnswers(q) {
                var answers = [];

                var inputs = q.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]');

                inputs.forEach(function(input) {
                    var text = "";

                    if (input.id) {
                        var label = q.querySelector('label[for="' + input.id + '"]');
                        if (label) {
                            text = label.innerText || label.textContent || "";
                        }
                    }

                    if (!text) {
                        var parentLabel = input.closest("label");
                        if (parentLabel) {
                            text = parentLabel.innerText || parentLabel.textContent || "";
                        }
                    }

                    if (!text) {
                        var row = input.closest(".r0,.r1,.r2,.r3,.r4,.r5,.r6,.r7");
                        if (row) {
                            var clone = row.cloneNode(true);
                            clone.querySelectorAll("input,button,.questionbot-btn").forEach(function(x) {
                                x.remove();
                            });
                            text = clone.innerText || clone.textContent || "";
                        }
                    }

                    text = cleanText(text);

                    text = text
                        .replace(/^[a-d]\.\s*/i, "")
                        .replace(/^[א-ד]\.\s*/, "")
                        .replace(/^\d+\.\s*/, "")
                        .trim();

                    if (!text) {
                        return;
                    }

                    if (text.includes("איפוס")) {
                        return;
                    }

                    if (text.includes("Clear my choice")) {
                        return;
                    }

                    if (text.includes("Explain this question")) {
                        return;
                    }

                    if (text.includes("הסבר לי את השאלה")) {
                        return;
                    }

                    if (text.length > 180) {
                        return;
                    }

                    if (answers.indexOf(text) === -1) {
                        answers.push(text);
                    }
                });

                return answers;
            }

            // ----- Styles -----

            function ensureStyles() {
                if (document.getElementById("qb-loading-style")) {
                    return;
                }

                var style = document.createElement("style");
                style.id = "qb-loading-style";
                style.type = "text/css";
                style.textContent =
                    "@keyframes qb-wave {0%{transform:translateY(0);} 30%{transform:translateY(-3px);} 60%{transform:translateY(0);} 100%{transform:translateY(0);}}" +
                    ".qb-loading-dot{display:inline-block;width:4px;height:4px;border-radius:50%;background:#0f6cbf;margin:0 1px;animation:qb-wave 1s infinite ease-in-out;}" +
                    ".qb-loading-dot:nth-child(2){animation-delay:0.15s;}" +
                    ".qb-loading-dot:nth-child(3){animation-delay:0.3s;}" +
                    "#qb-thread{display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1;min-height:0;padding:4px 4px 4px 0;}" +
                    ".qb-bubble{padding:10px 14px;border-radius:10px;line-height:1.6;white-space:pre-wrap;max-width:88%;word-wrap:break-word;}" +
                    ".qb-bubble-user{align-self:flex-start;background:#e8f1fa;border:1px solid #cfe1f3;}" +
                    ".qb-bubble-assistant{align-self:flex-end;background:#f7f7f7;border:1px solid #e5e5e5;}" +
                    ".qb-bubble-error{align-self:flex-end;background:#fff1f0;border:1px solid #ffccc7;color:#a8071a;}" +
                    "#qb-input-row{display:flex;gap:8px;margin-top:12px;align-items:flex-end;}" +
                    "#qb-input{flex:1;min-height:42px;max-height:120px;padding:8px 10px;border:1px solid #ccc;border-radius:8px;font:inherit;resize:vertical;direction:rtl;}" +
                    "#qb-send{background:#0f6cbf;color:#fff;border:none;padding:0 16px;height:42px;border-radius:8px;cursor:pointer;}" +
                    "#qb-send:disabled,#qb-input:disabled{opacity:.5;cursor:not-allowed;}";

                document.head.appendChild(style);
            }

            // ----- Chat panel state (closure-scoped, one panel at a time) -----

            var panel = null;
            var thread = null;
            var input = null;
            var sendBtn = null;
            var inFlight = false;

            function buildLoadingDots() {
                var span = document.createElement("span");
                for (var i = 0; i < 3; i++) {
                    var d = document.createElement("span");
                    d.className = "qb-loading-dot";
                    span.appendChild(d);
                }
                return span;
            }

            function appendBubble(role, text) {
                if (!thread) {
                    return null;
                }

                var bubble = document.createElement("div");
                bubble.className = "qb-bubble qb-bubble-" + role;

                if (text === null || text === undefined) {
                    bubble.appendChild(buildLoadingDots());
                } else {
                    bubble.innerText = text;
                }

                thread.appendChild(bubble);
                thread.scrollTop = thread.scrollHeight;
                return bubble;
            }

            function setBubbleText(bubble, text, isError) {
                if (!bubble || !bubble.isConnected) {
                    return;
                }

                bubble.innerText = text;

                if (isError) {
                    bubble.className = "qb-bubble qb-bubble-error";
                }

                if (thread) {
                    thread.scrollTop = thread.scrollHeight;
                }
            }

            function closePanel() {
                if (panel) {
                    panel.remove();
                }
                panel = null;
                thread = null;
                input = null;
                sendBtn = null;
                inFlight = false;
            }

            function buildPanel() {
                closePanel();

                panel = document.createElement("div");
                panel.id = "qb-answer-box";
                panel.dir = "rtl";
                panel.style.position = "fixed";
                panel.style.top = "90px";
                panel.style.left = "50%";
                panel.style.transform = "translateX(-50%)";
                panel.style.width = "70%";
                panel.style.maxWidth = "850px";
                panel.style.maxHeight = "70vh";
                panel.style.display = "flex";
                panel.style.flexDirection = "column";
                panel.style.background = "#fff";
                panel.style.border = "1px solid #ccc";
                panel.style.borderRadius = "10px";
                panel.style.boxShadow = "0 8px 30px rgba(0,0,0,.25)";
                panel.style.zIndex = "99999";
                panel.style.padding = "18px";
                panel.style.lineHeight = "1.7";

                var header = document.createElement("div");
                header.style.display = "flex";
                header.style.justifyContent = "space-between";
                header.style.alignItems = "center";
                header.style.marginBottom = "10px";

                var title = document.createElement("h3");
                title.style.margin = "0";
                title.innerText = modalTitle;

                var close = document.createElement("button");
                close.id = "qb-close";
                close.type = "button";
                close.innerText = "סגור";
                close.style.cssText = "border:none;background:#0f6cbf;color:white;padding:6px 12px;border-radius:6px;cursor:pointer";
                close.onclick = closePanel;

                header.appendChild(title);
                header.appendChild(close);

                thread = document.createElement("div");
                thread.id = "qb-thread";

                var inputRow = document.createElement("div");
                inputRow.id = "qb-input-row";

                input = document.createElement("textarea");
                input.id = "qb-input";
                input.rows = 1;
                input.placeholder = inputPlaceholder;
                input.addEventListener("keydown", function(e) {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSendClick();
                    }
                });

                sendBtn = document.createElement("button");
                sendBtn.id = "qb-send";
                sendBtn.type = "button";
                sendBtn.innerText = sendButtonText;
                sendBtn.onclick = onSendClick;

                inputRow.appendChild(input);
                inputRow.appendChild(sendBtn);

                panel.appendChild(header);
                panel.appendChild(thread);
                panel.appendChild(inputRow);

                document.body.appendChild(panel);
            }

            function setInFlight(state) {
                inFlight = state;
                if (sendBtn) {
                    sendBtn.disabled = state;
                }
                if (input) {
                    input.disabled = state;
                }
            }

            function onSendClick() {
                if (inFlight || !input) {
                    return;
                }

                var text = (input.value || "").trim();
                if (!text) {
                    return;
                }

                input.value = "";

                appendBubble("user", text);
                var assistant = appendBubble("assistant", null);

                sendTurn({ kind: "followup", message: text }, assistant, null);
            }

            function sendTurn(payload, assistantBubble, onSettled) {
                setInFlight(true);

                var body = {
                    kind: payload.kind,
                    courseid: config.courseid || 0,
                    coursename: config.coursename || ""
                };

                if (payload.kind === "initial") {
                    body.questiontext = payload.questiontext || "";
                    body.answers = payload.answers || [];
                } else {
                    body.message = payload.message || "";
                }

                fetch(ajaxurl + "?sesskey=" + encodeURIComponent(sesskey), {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                })
                    .then(function(r) {
                        return r.json();
                    })
                    .then(function(data) {
                        setBubbleText(assistantBubble, data.answer || noAnswerText);
                    })
                    .catch(function(e) {
                        setBubbleText(assistantBubble, errorPrefix + e.message, true);
                    })
                    .then(function() {
                        setInFlight(false);
                        if (input) {
                            try {
                                input.focus();
                            } catch (err) { /* jsdom focus can throw, ignore */ }
                        }
                        if (onSettled) {
                            onSettled();
                        }
                    });
            }

            function openChat(q, button) {
                if (button && button.dataset.qbLoading === "1") {
                    return;
                }

                if (button) {
                    button.dataset.qbLoading = "1";
                    button.disabled = true;
                }

                function releaseButton() {
                    if (button) {
                        button.dataset.qbLoading = "0";
                        button.disabled = false;
                    }
                }

                var question = getQuestion(q);
                var answers = getAnswers(q);

                console.log("QUESTION CLEAN:", question);
                console.log("ANSWERS CLEAN:", answers);

                buildPanel();

                var seedText = question;
                if (answers.length) {
                    var lines = answers.map(function(a, i) {
                        return (i + 1) + ". " + a;
                    });
                    seedText = question + "\n\n" + lines.join("\n");
                }

                appendBubble("user", seedText);
                var assistant = appendBubble("assistant", null);

                sendTurn(
                    {
                        kind: "initial",
                        questiontext: question,
                        answers: answers
                    },
                    assistant,
                    releaseButton
                );
            }

            function inject() {
                document.querySelectorAll(".que").forEach(function(q) {
                    if (q.getAttribute("data-qb") === "1") {
                        return;
                    }

                    var qt = q.querySelector(".qtext");
                    if (!qt) {
                        return;
                    }

                    var wrapper = document.createElement("div");
                    wrapper.style.display = "flex";
                    wrapper.style.flexDirection = "row";
                    wrapper.style.alignItems = "center";
                    wrapper.style.margin = "10px 0";

                    var b = document.createElement("button");
                    b.className = "questionbot-btn";
                    b.type = "button";
                    b.innerText = config.buttontext || "❓ הסבר לי את השאלה";

                    b.style.display = "inline-block";
                    b.style.background = "#0f6cbf";
                    b.style.color = "#fff";
                    b.style.border = "none";
                    b.style.padding = "8px 12px";
                    b.style.borderRadius = "6px";
                    b.style.cursor = "pointer";

                    b.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        openChat(q, b);
                    };

                    wrapper.appendChild(b);
                    qt.appendChild(wrapper);
                    q.setAttribute("data-qb", "1");
                });
            }

            ensureStyles();

            inject();

            var obs = new MutationObserver(inject);
            obs.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };
});
