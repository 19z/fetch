$(function () {
    var $main = $('#main');
    var $messageBox = $main.find('.messageBox');
    var $input = $main.find('textarea');
    var roomid = (location.pathname.match(/\w{20}/) || [null])[0];
    var OFFSET = 0;
    var PASSWORD, ws;
    var expiresTime = $input.data('expires') || 600;
    Date.initRealTime($input.data('now'));

    function FetchMessage() {

    }

    FetchMessage.send = function () {
        var message = $input.val(), iv = Math.randomPassword();
        if (message) {
            $input.val('');
            $.post('', {type: 'text', iv: iv, message: message.encrypt(PASSWORD + iv)}).done(function (e) {
                if (e.ok) {
                    OFFSET = Math.max(parseInt(e.ok), OFFSET || 0);
                    ws.send('1');
                }
            });
            FetchMessage.show(message, null, true);
        }
    };
    FetchMessage.sendFile = function (fileSource, type) {
        var $dom = type === 'image' ? FetchMessage.displayImage(fileSource) : FetchMessage.displayFile(fileSource);
        var iv = Math.randomPassword(), en = new Encrypt();
        var $file = $dom.find('.file');
        console.log(fileSource);
        en.on('upload.progress', function (e) {
            $file.text(fileSource.name + '(' + e.percent + '/' + Math.fileSizeSI(fileSource.size) + ')');
        });

        $file.text(fileSource.name + '(加密中/' + Math.fileSizeSI(fileSource.size) + ')');
        en.encrypt(fileSource, PASSWORD + iv).then(function (file) {
            $file.text(fileSource.name + '(0%/' + Math.fileSizeSI(fileSource.size) + ')');
            return en.upload(file, roomid)
        }).then(function (url) {
            return $.post('', {type: type, iv: iv, message: url});
        }).then(function (e) {
            $file.text(fileSource.name + '(' + Math.fileSizeSI(fileSource.size) + ')');
            if (e.ok) {
                OFFSET = Math.max(parseInt(e.ok), OFFSET || 0);
                ws.send('1');
            }
        })
    };

    FetchMessage.encode = function (text) {
        if (text.length === 0) return "";
        return text.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/ /g, "&nbsp;").replace(/\'/g, "&#39;")
            .replace(/\"/g, "&quot;").replace(/\n/g, "<br>");
    };
    FetchMessage.decode = function (html) {
        var temp = document.createElement("div");
        temp.innerHTML = html;
        return temp.innerText || temp.textContent;
    };
    FetchMessage.scrollTop = function () {
        setTimeout(function () {
            $messageBox.scrollTop($messageBox.get(0).scrollHeight)
        }, 50);
    };
    FetchMessage.getTemplate = function (send) {
        var _float = send ? 'right' : 'left';
        return '<div class="message ' + _float + '"><img class="avatar" src="/static/img/user_normal.png" alt=""><p>{{html}}</p></div>';
    };
    FetchMessage.show = function (message, type, send, expires) {
        // console.log(message);
        var html = FetchMessage.getTemplate(send), $dom;
        type = type || 'text';
        if (type === 'text') {
            $dom = $(html.replace('{{html}}', FetchMessage.encode(message))).appendTo($messageBox);
        } else if (type === 'image') {
            $dom = $(html.replace('{{html}}', '<img src="' + message + '"/>')).appendTo($messageBox);
        } else if (type === 'file') {
            $dom = $(html.replace('{{html}}', '<a download="' + message.name + '" href="' + message.url + '" class="file">' + message.name + '(' + message.size + ')' + '</a>')).appendTo($messageBox);
        } else if (type === 'raw') {
            $dom = $('<div class="message raw">' + message + '</div>').appendTo($messageBox);
        }
        $dom.attr('data-expires', expires || ~~(+Date.real() / 1000) + expiresTime).addClass('box-' + type);
        FetchMessage.scrollTop();
        return $dom;
    };
    FetchMessage.showPreFile = function (url, filename, size, iv, expires) {
        filename = decodeURIComponent(filename);
        var html = FetchMessage.getTemplate().replace('{{html}}', '<a class="pre-file file" href="javascript:;">' + filename + '(' + Math.fileSizeSI(size) + ')' + '</a>'),
            $html = $(html), $a = $html.find('a');
        $html.appendTo($messageBox).attr('data-expires', expires || ~~(+Date.real() / 1000) + expiresTime).addClass('box-file');
        $a.on('click', function () {
            var en = new Encrypt();
            $a.off('click');
            en.on('download.progress', function (e) {
                console.log('download.progress', e);
                $a.text(filename + '(' + e.percent + '/' + Math.fileSizeSI(size) + ')');
            });
            en.download(url, PASSWORD + iv).then(function (file) {
                var url = URL.createObjectURL(file);
                $a.attr('href', url)
                    .attr('download', filename).removeClass('pre-file')
                    .text(filename + '(点击保存)');
                setTimeout(function () {
                    $a.click();
                });
            }).catch(function (err) {
                $html.addClass('deleted');
            })
        });
        FetchMessage.scrollTop();
    };
    FetchMessage.displayImage = function (file, send) {
        return FetchMessage.show(URL.createObjectURL(file), 'image', send === undefined ? true : send);
    };
    FetchMessage.displayFile = function (file, send) {
        return FetchMessage.show({
            url: URL.createObjectURL(file),
            name: file.name,
            size: Math.fileSizeSI(file.size)
        }, 'file', send === undefined ? true : send);
    };
    FetchMessage.error = function (msg) {
        alert(msg);
        location.href = 'error';
    };
    FetchMessage.sendFiles = function (files) {
        var i, file;
        for (i = 0; i < files.length && i < 10; i++) {
            file = files[i];
            if (file.size > 20 * 1024 * 1024) {
                FetchMessage.show('文件 ' + file.name + ' 太大了，最大允许上传20M，登录以上传更大文件。', 'raw');
                continue;
            }
            if (file.type.indexOf('image/') === 0) {
                FetchMessage.sendFile(file, 'image');
            } else {
                FetchMessage.sendFile(file, 'file');
            }
        }
        if (files.length > 10) {
            FetchMessage.show('最多选择10个文件，单个文件不得超过 20M', 'raw');
        }
    };
    FetchMessage.addEvent = function () {
        var $file;
        $main.on('keypress', $input, function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                FetchMessage.send();
                return false;
            }
        }).on('click', 'button.send', function (e) {
            FetchMessage.send();
            return false;
        }).on('click', 'button.file', function (e) {
            if (!$file) {
                $file = $('<input type="file"/>').hide().appendTo('body').on('change', function (e) {
                    FetchMessage.sendFiles(this.files);
                })
            }
            $file.click();
        });
        $main.on({
            dragleave: function (e) {	//拖离
                e.preventDefault();
                $main.removeClass('drag');
                console.log('dragleave', e);
            },
            drop: function (e) {  //拖后放
                console.log('drop', e);
                var files = e.originalEvent.dataTransfer.files;
                FetchMessage.sendFiles(files);
                e.preventDefault();
            },
            dragenter: function (e) {	//拖进
                e.preventDefault();
                $main.addClass('drag');
                console.log('dragenter', e);
            },
            dragover: function (e) {	//拖来拖去
                e.preventDefault();
            },
            click: function (e) {
                $main.removeClass('drag');
            }
        });
    };
    FetchMessage.flush = function () {
        $.post('', {type: 'fetch', last: OFFSET}).done(function (data) {
            $.each(data, function (i, row) {
                var type = row.type;
                var iv = row.iv;
                var expires = row.expires_time;
                var en, sp_message, $img;
                var message = type === 'text' ? row.message.decrypt(PASSWORD + iv) : row.message;
                if (message) {
                    if (type === 'text') {
                        FetchMessage.show(message, 'text', false, expires)
                    } else if (type === 'image') {
                        en = new Encrypt();
                        sp_message = message.split('/');
                        $img = FetchMessage.show('/static/img/loading.gif', 'image', false, expires);
                        en.download('download?id=' + roomid + '&file=' + sp_message[0], PASSWORD + iv).then(function (file) {
                            console.log(file, 'image');
                            file.name = sp_message[2];
                            $img.find('p img').attr('src', URL.createObjectURL(file));
                            FetchMessage.scrollTop();
                        }).catch(function (x) {
                            $img.find('p img').attr('src', '图片已过期'.toImage());
                            FetchMessage.scrollTop();
                        })
                    } else if (type === 'file') {
                        sp_message = message.split('/');
                        FetchMessage.showPreFile('download?id=' + roomid + '&file=' + sp_message[0], sp_message[2], sp_message[1], iv, expires);
                    } else if (type === 'raw') {
                        FetchMessage.show(message, 'raw', false, expires);
                    }
                    OFFSET = Math.max(parseInt(row.id), OFFSET || 0);
                }
            });
        });
    };
    FetchMessage.getLocalStorage = function (room, password) {
        try {
            let all = JSON.parse(localStorage['fetch'] || '{}');
            if (typeof all !== 'object') {
                localStorage.removeItem('fetch');
                all = {};
                console.log(all, JSON.stringify(all));
                localStorage['fetch'] = JSON.stringify(all);
            }
            if (room && password) {
                all[room] = password;
                localStorage['fetch'] = JSON.stringify(all);
            } else if (room) {
                if (all[room] && !/^[0-9a-f]{32}$/.test(all[room])) {
                    localStorage.removeItem('fetch');
                    return undefined;
                }
                return all[room];
            } else {
                return all;
            }
        } catch (e) {
            localStorage.removeItem('fetch');
        }
    };
    FetchMessage.start = function () {
        location.hash = '#' + PASSWORD;
        setTimeout(function () {
            $('<div class="qrcode"></div>').qrcode(location.href).appendTo($messageBox);
            FetchMessage.scrollTop();
        }, 300);
        FetchMessage.getLocalStorage(roomid, PASSWORD);
        FetchMessage.flush();
        FetchMessage.addEvent();
        ws = new WebSocket('wss://room.jininij.com/' + roomid);
        ws.onopen = function () {
            ws.send('1');
        };
        ws.onmessage = function () {
            FetchMessage.flush();
        };

        function deleteBox() {
            $messageBox.find('.message[data-expires]').not('.deleted').each(function () {
                var $this = $(this), expires = $this.data('expires'),
                    n = ~~(+expires - Date.real() / 1000), time = ~~(n / 60) + ':' + ('0' + n % 60).substr(-2);
                $this.attr('expires', time);
                if (n < 0) {
                    $this.addClass('deleted');
                    $this.find('.pre-file').off('click');
                    $this.removeAttr('data-expires');
                }
            });
            setTimeout(function () {
                deleteBox();
            }, 1000);
        }
        deleteBox();
    };

    FetchMessage.init = function () {
        var check = $input.data('check'), pwd = FetchMessage.getLocalStorage(roomid) || location.hash.replace('#', '');

        if (check && !/^[0-9a-f]{32}$/.test(pwd) || check && !Math.checkCal(check.decrypt(pwd + Math.defaultIv))) {
            FetchMessage.error('你无权访问此页面1');
            return;
        } else if (!check) {
            pwd = Math.randomPassword();
            check = Math.randomCal().encrypt(pwd + Math.defaultIv);
            PASSWORD = pwd;

            $.post('', {type: 'check', check: check}).done(function () {
                location.hash = '#' + pwd;
                $('.qrcode').qrcode(location.href);
                FetchMessage.start();
            }).fail(function (e) {
                console.log(e)
            });
            return;
        }
        if (!pwd) {
            FetchMessage.error('你无权访问此页面2');
            return;
        }
        PASSWORD = pwd;
        FetchMessage.start();
    };
    FetchMessage.init();
});