define("local_questionbot/questionbot", [], function() {
    return {
        init: function(config) {

            console.log("QB CLEAN MODE v3");

            var ajaxurl = config.ajaxurl;
            var sesskey = config.sesskey;

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

            function ensureStyles() {
                if (document.getElementById("qb-loading-style")) {
                    return;
                }

                var style = document.createElement("style");
                style.id = "qb-loading-style";
                style.type = "text/css";
                style.textContent = "@keyframes qb-wave {0%{transform:translateY(0);} 30%{transform:translateY(-3px);} 60%{transform:translateY(0);} 100%{transform:translateY(0);}}" +
                    ".qb-loading-dot{display:inline-block;width:4px;height:4px;border-radius:50%;background:#0f6cbf;margin:0 1px;animation:qb-wave 1s infinite ease-in-out;}" +
                    ".qb-loading-dot:nth-child(2){animation-delay:0.15s;}" +
                    ".qb-loading-dot:nth-child(3){animation-delay:0.3s;}";

                document.head.appendChild(style);
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

            function showAnswer(text) {
                var old = document.getElementById("qb-answer-box");
                if (old) {
                    old.remove();
                }

                var box = document.createElement("div");
                box.id = "qb-answer-box";
                box.dir = "rtl";
                box.style.position = "fixed";
                box.style.top = "90px";
                box.style.left = "50%";
                box.style.transform = "translateX(-50%)";
                box.style.width = "70%";
                box.style.maxWidth = "850px";
                box.style.maxHeight = "70vh";
                box.style.overflow = "auto";
                box.style.background = "#fff";
                box.style.border = "1px solid #ccc";
                box.style.borderRadius = "10px";
                box.style.boxShadow = "0 8px 30px rgba(0,0,0,.25)";
                box.style.zIndex = "99999";
                box.style.padding = "18px";
                box.style.lineHeight = "1.7";
                box.style.whiteSpace = "pre-wrap";

                box.innerHTML =
                    '<button id="qb-close" style="float:left;border:none;background:#0f6cbf;color:white;padding:6px 12px;border-radius:6px;cursor:pointer">סגור</button>' +
                    '<h3 style="margin-top:0">הסבר מהבוט</h3>' +
                    '<div></div>';

                box.querySelector("div").innerText = text;
                document.body.appendChild(box);

                document.getElementById("qb-close").onclick = function() {
                    box.remove();
                };
            }

            function send(q, button, loader) {
                var question = getQuestion(q);
                var answers = getAnswers(q);

                console.log("QUESTION CLEAN:", question);
                console.log("ANSWERS CLEAN:", answers);
                console.log("COURSE ID:", config.courseid);
                console.log("COURSE NAME:", config.coursename);

                if (button && button.dataset.qbLoading === "1") {
                    return;
                }

                if (button) {
                    button.dataset.qbLoading = "1";
                    button.disabled = true;
                }

                if (loader) {
                    loader.style.visibility = "visible";
                }

                function done() {
                    if (button) {
                        button.dataset.qbLoading = "0";
                        button.disabled = false;
                    }
                    if (loader) {
                        loader.style.visibility = "hidden";
                    }
                }

                fetch(ajaxurl + "?sesskey=" + encodeURIComponent(sesskey), {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        questiontext: question,
                        answers: answers,
                        courseid: config.courseid || 0,
                        coursename: config.coursename || ""
                    })
                })
                .then(function(r) {
                    return r.json();
                })
                .then(function(data) {
                    showAnswer(data.answer || "לא התקבלה תשובה");
                })
                .catch(function(e) {
                    showAnswer("שגיאה: " + e.message);
                })
                .then(function() {
                    done();
                });
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

                    var loader = document.createElement("span");
                    loader.style.display = "inline-flex";
                    loader.style.alignItems = "center";
                    loader.style.marginLeft = "8px";
                    loader.style.visibility = "hidden";

                    for (var i = 0; i < 3; i++) {
                        var dot = document.createElement("span");
                        dot.className = "qb-loading-dot";
                        loader.appendChild(dot);
                    }

                    b.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        send(q, b, loader);
                    };

                    wrapper.appendChild(b);
                    wrapper.appendChild(loader);
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