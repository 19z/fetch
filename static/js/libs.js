"use strict";

/*************兼容***************/
(function () {
    if (!String.prototype.repeat) {
        String.prototype.repeat = function (count) {
            'use strict';
            if (this == null) {
                throw new TypeError('can\'t convert ' + this + ' to object');
            }
            var str = '' + this;
            count = +count;
            if (count !== count) {
                count = 0;
            }
            if (count < 0) {
                throw new RangeError('repeat count must be non-negative');
            }
            if (count === Infinity) {
                throw new RangeError('repeat count must be less than infinity');
            }
            count = Math.floor(count);
            if (str.length === 0 || count === 0) {
                return '';
            }
            // 确保 count 是一个 31 位的整数。这样我们就可以使用如下优化的算法。
            // 当前（2014年8月），绝大多数浏览器都不能支持 1 << 28 长的字符串，所以：
            if (str.length * count >= 1 << 28) {
                throw new RangeError('repeat count must not overflow maximum string size');
            }
            var rpt = '';
            for (; ;) {
                if ((count & 1) === 1) {
                    rpt += str;
                }
                count >>>= 1;
                if (count === 0) {
                    break;
                }
                str += str;
            }
            return rpt;
        }
    }
})();

/********** 加密 ***********/
(function (window) {
    let aesjs = window.aesjs;
    if (!window.aesjs) {
        return;
    }

    let _hex2Array = {};
    let _password = {};

    function hex2ArrayBuffer(a) {
        if (_hex2Array[a]) {
            return _hex2Array[a];
        }
        return _hex2Array[a] = a.hexDecode();
    }

    function getAesOfb(password) {
        let key = hex2ArrayBuffer(password.substr(0, 32));
        let iv = hex2ArrayBuffer(password.substr(32, 32));
        return new aesjs.ModeOfOperation.ofb(key, iv);
    }

    function Encrypt() {
        let that = this;
        if (this instanceof Window) {
            throw new Error("must use new");
        }
        that.events = {};
        this.on = function (event, callback) {
            this.events[event] = this.events[event] || [];
            this.events[event].push(callback);
            return this;
        };
        this.off = function (event) {
            if (this.events[event]) {
                delete this.events[event];
            }
            return this;
        };

        this.trigger = function (name, event) {
            let _event;
            if (!event || !event instanceof Event) {
                _event = new Event(name, {target: this});
                _event.data = event;
                event = _event;
            }
            let i, callback;
            console.log(name, event, this.events[name]);
            if (!this.events[name]) {
                return;
            }
            for (i = 0; i < this.events[name].length; i++) {
                callback = this.events[name][i];
                if (typeof callback === 'function') {
                    if (false === callback.call(that, event)) {
                        break;
                    }
                }
            }
        };
        this.encryptBlob = function (file, password, decrypt) {
            let blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice,
                chunkSize = 2 * 1024 * 1024, // 分片大小 2M
                chunks = Math.ceil(file.size / chunkSize),// 分片数
                promises = [], // Promise 列表
                i, start, end, _f;
            if (file.size > chunkSize) {
                for (i = 0; i < chunks; i++) {
                    start = i * chunkSize;
                    end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
                    _f = blobSlice.call(file, start, end);
                    _f.name = file.name + '.part.' + (i + 1);
                    promises.push(that.encryptBlob(_f, password, decrypt));
                }
                return Promise.all(promises)
            }

            return new Promise((resolve, reject) => {
                let fileReader = new FileReader();
                fileReader.onload = function (e) {
                    let content = e.target.result;
                    try {
                        let aesOfb = getAesOfb(password);
                        if (decrypt) {
                            that.trigger('encrypt.part', file);
                            console.log("正在解密 " + file.name + '(' + file.size + ')');
                            resolve(aesOfb.decrypt(new Uint8Array(content)));
                        } else {
                            that.trigger('decrypt.part', file);
                            console.log("正在加密 " + file.name + '(' + file.size + ')');
                            resolve(aesOfb.encrypt(new Uint8Array(content)));
                        }
                    } catch (e) {
                        reject(e);
                    }
                };
                fileReader.readAsArrayBuffer(file);
            });
        };

        this.encrypt = async function (file, password) {
            if (!password) {
                console.log('未加密');
                return file;
            }
            if (!getAesOfb(password)) {
                throw new Error(password);
            }
            that.trigger('encrypt.start', file);
            let content = await that.encryptBlob(file, password);
            let result = new Blob(content instanceof Uint8Array ? [content] : content, {type: file.type});
            result.name = file.name;
            that.trigger('encrypt.finish', file);
            return result;
        };
        this.decrypt = async function (file, password) {
            if (!password) {
                console.log('未加密');
                return file;
            }
            if (!getAesOfb(password)) {
                throw new Error(password);
            }
            that.trigger('decrypt.start', file);
            let content = await this.encryptBlob(file, password, true);
            let result = new Blob(content instanceof Uint8Array ? [content] : content, {type: file.type});
            result.name = file.name;
            that.trigger('decrypt.finish', file);
            return result;
        };
        this.upload = function (file, room) {
            return new Promise(function (resolve, reject) {
                let x = new XMLHttpRequest();
                let url = "token?filename=" + encodeURIComponent(file.name) + '&size=' + encodeURIComponent(file.size) + '&id=' + encodeURIComponent(room);
                x.open('GET', url);
                x.onreadystatechange = function (e) {
                    if (x.readyState !== 4) {
                        return false;
                    }
                    let data = JSON.parse(x.responseText);
                    //console.log(x.status, x.readyState);
                    //console.log(data);
                    if (data.error) {
                        reject(data.error);
                    }
                    let formData = new FormData();
                    let xhr = new XMLHttpRequest();
                    xhr.open('POST', data.host);
                    xhr.onreadystatechange = function () {
                        //console.log(xhr.status, xhr.readyState);
                        if (xhr.readyState === 4) {
                            that.trigger('upload.finish', xhr);
                            resolve(data.message);
                        }
                    };
                    xhr.upload.onprogress = function (e) {
                        if (e.lengthComputable) {
                            e.percent = (e.loaded / e.total * 100).toFixed(2) + ' %';
                        }
                        that.trigger('upload.progress', e);
                    };
                    formData.append('OSSAccessKeyId', data.accessKeyId);
                    formData.append('policy', data.policy);
                    formData.append('Signature', data.signature);
                    formData.append('key', data.key);
                    formData.append('success_action_status', '201');
                    formData.append('file', file);
                    xhr.send(formData);
                };
                x.send();
            })
        };

        this.download = async function (url, password) {
            return new Promise((resolve, reject) => {
                let xhr = new XMLHttpRequest();
                xhr.open('GET', url);
                xhr.responseType = "blob";
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status.toString().substr(0, 1) === '2') {
                            that.decrypt(xhr.response, password).then(function (data) {
                                resolve(data);
                            });
                        } else {
                            reject("下载失败");
                        }
                    }
                };
                xhr.onprogress = function (e) {
                    if (e.lengthComputable) {
                        e.percent = (e.loaded / e.total * 100).toFixed(2) + ' %';
                    }
                    that.trigger('download.progress', e);
                };
                xhr.send();
            })
        };
    }

    window.Encrypt = Encrypt;

    /**
     * @param password {string}
     * @returns {Uint8Array}
     */
    Uint8Array.prototype.encrypt = function (password) {
        return getAesOfb(password).encrypt(this);
    };
    /**
     * @param password {string}
     * @returns {Uint8Array}
     */
    Uint8Array.prototype.decrypt = function (password) {
        return getAesOfb(password).decrypt(this);
    };

    /**
     * @param password
     * @param encode
     * @returns {string|Uint8Array|undefined}
     */
    String.prototype.encrypt = function (password, encode) {
        if (!/^[0-9a-f]{64,}$/.test(password)) {
            return undefined;
        }
        switch (encode) {
            case 'bin':
                return this.encode().encrypt(password);
            case 'hex':
                return this.encode().encrypt(password).hexEncode();
            default:
                return this.encode().encrypt(password).base64Encode();
        }
    };
    String.prototype.decrypt = function (password, encode) {
        if (!/^[0-9a-f]{64,}$/.test(password)) {
            return undefined;
        }
        switch (encode) {
            case 'hex':
                return this.hexDecode().decrypt(password).decode();
            default:
                return this.base64Decode().decrypt(password).decode();
        }
    };
    String.prototype.toImage = function () {
        let p = document.createElement('p');
        p.style.visibility = 'hidden';
        p.style.whiteSpace = 'nowrap';
        p.style.position = 'fixed';
        p.style.top = '0';
        p.style.left = '0';
        p.style.zIndex = '-100';
        p.innerText = this;
        document.body.appendChild(p);
        let width = p.offsetWidth;
        let height = p.offsetHeight;
        let style = getComputedStyle(p);
        let font = style.fontSize + ' ' + style.fontFamily;
        let fontsize = parseInt(style.fontSize);
        let canvas = document.createElement('canvas'), context;
        canvas.width = width;
        canvas.height = height;
        context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#000';
        context.font = font;
        context.fillText(this, 0, height / 2 + fontsize / 2);
        let url = canvas.toDataURL();
        p.remove();
        return url;
    };
})(window);

/******* 工具******/
(function (window) {
    function add(a, b) {
        if (a.indexOf('-') >= 0 && b.indexOf('-') < 0) {
            return minus(b, a);
        } else if (a.indexOf('-') < 0 && b.indexOf('-') >= 0) {
            return minus(a, b);
        }
        var sign = "";
        if (a.indexOf('-') >= 0 && b.indexOf('-') >= 0) { /*两个负数相加，指定符号*/
            sign = "-";
            a = a.substr(1);
            b = b.substr(1);
        }
        var aArr = a.replace(/^0+/, '').split('').reverse();
        var bArr = b.replace(/^0+/, '').split('').reverse(); /*利用倒序数组存储*/
        var carry = 0; /*进位值*/
        var sumArr = [];
        var len = Math.max(aArr.length, bArr.length); /*取得位数较大的一个数的位数*/
        for (var i = 0; i <= len - 1; i++) {
            var digA = parseInt(aArr[i]) ? parseInt(aArr[i]) : 0;
            var digB = parseInt(bArr[i]) ? parseInt(bArr[i]) : 0;
            var digTotal = digA + digB + carry;
            if (i === len - 1) {/*排除'012' + '012'这样的情况*/
                if (digTotal > 0) {
                    sumArr.unshift(digTotal);
                }
                break;
            }
            carry = Number(digTotal >= 10);
            digTotal = digTotal % 10;
            sumArr.unshift(digTotal);
        }
        return sign + sumArr.join('');
    }

    function checkCal(str) {
        if (!str) {
            return false;
        }
        let li = str.match(/^(-?\d+)\+(\d+)=(\d+)$/);
        if (!li) {
            return false;
        }
        return add(li[1], li[2]) === li[3];
    }

    function randomCal() {
        let a = randomBig(), b = randomBig(), c = add(a, b);
        return a + '+' + b + '=' + c;
    }

    function rand(start, end) {
        return Math.floor(Math.random() * (end - start) + start);
    }

    function randomBig() {
        var r = '', i = 32 / 4;
        for (i; i > 0; i--) {
            r += rand(100000, 1000000 - 1).toString(10)
        }
        return r;
    }

    function randomPassword() {
        var r = '', i = 32 / 4;
        for (i; i > 0; i--) {
            r += rand(0x1000, 0xffff).toString(16)
        }
        return r;
    }

    function fileSizeSI(a, b, c, d, e) {
        return (b = Math, c = b.log, d = 1e3, e = c(a) / c(d) | 0, a / b.pow(d, e)).toFixed(2)
            + ' ' + (e ? 'kMGTPEZY'[--e] + 'B' : 'Bytes')
    }

    /*** string ***/
    const _base64abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    const base64abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=";
    const abc2base64 = function (base64abc) {
        var res = {};
        base64abc.split('').forEach(function (i, s) {
            res[i] = s;
        });
        return res;
    }(base64abc);

    Math.defaultIv = '0'.repeat(32);

    /**
     * @param input {string}
     * @returns {Uint8Array}
     */
    function base64toBytes(input) {
        var pads = 0,
            i,
            b10,
            imax = input.length,
            x = [],
            y = [], _getbyte64 = function (s, i) {
                return abc2base64[s[i]];
            };

        if (imax === 0) {
            return new Uint8Array([]);
        }
        while (imax % 4 !== 0) {
            input += '=';
            imax = input.length;
        }
        if (input.charAt(imax - 1) === '=') {
            pads = 1;
            if (input.charAt(imax - 2) === '=') {
                pads = 2;
            }
            // either way, we want to ignore this last block
            imax -= 4;
        }

        for (i = 0; i < imax; i += 4) {
            var ch1 = _getbyte64(input, i);
            var ch2 = _getbyte64(input, i + 1);
            var ch3 = _getbyte64(input, i + 2);
            var ch4 = _getbyte64(input, i + 3);

            b10 = (_getbyte64(input, i) << 18) | (_getbyte64(input, i + 1) << 12) | (_getbyte64(input, i + 2) << 6) | _getbyte64(input, i + 3);
            y.push(b10 >> 16);
            y.push((b10 >> 8) & 0xff);
            y.push(b10 & 0xff);
            //_decode_chars(y, x);
        }
        switch (pads) {
            case 1:
                b10 = (_getbyte64(input, i) << 18) | (_getbyte64(input, i + 1) << 12) | (_getbyte64(input, i + 2) << 6);
                y.push(b10 >> 16);
                y.push((b10 >> 8) & 0xff);
                break;

            case 2:
                b10 = (_getbyte64(input, i) << 18) | (_getbyte64(input, i + 1) << 12);
                y.push(b10 >> 16);
                break;
        }
        //_decode_chars(y, x);
        return new Uint8Array(y);
    }

    /**
     * @param bytes {Uint8Array}
     * @returns {string}
     */
    function bytesToBase64(bytes) {
        let result = '', i, l = bytes.length;
        for (i = 2; i < l; i += 3) {
            result += base64abc[bytes[i - 2] >> 2];
            result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
            result += base64abc[((bytes[i - 1] & 0x0F) << 2) | (bytes[i] >> 6)];
            result += base64abc[bytes[i] & 0x3F];
        }
        if (i === l + 1) { // 1 octet missing
            result += base64abc[bytes[i - 2] >> 2];
            result += base64abc[(bytes[i - 2] & 0x03) << 4];
            // result += "==";
        }
        if (i === l) { // 2 octets missing
            result += base64abc[bytes[i - 2] >> 2];
            result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
            result += base64abc[(bytes[i - 1] & 0x0F) << 2];
            // result += "=";
        }
        return result;
    }

    function range(start, end, sp) {
        if (end === undefined) {
            end = start;
            start = 0;
        }
        sp = sp || 1;
        if (start > end) {
            sp = -sp;
        }
        let res = [];
        for (let i = start; sp > 0 ? i < end : i > end; i += sp) {
            res.push(i);
        }
        return res;
    }

    Object.assign(Math, {
        add: add,
        checkCal: checkCal,
        randomCal: randomCal,
        rand: rand,
        fileSizeSI: fileSizeSI,
        range: range,
        randomPassword: randomPassword
    });

    /**
     * @returns {Uint8Array}
     */
    String.prototype.base64Decode = function () {
        return base64toBytes(this);
    };
    /**
     * @returns {Uint8Array}
     */
    String.prototype.encode = function () {
        return new Uint8Array(new TextEncoder().encode(this));
    };
    /**
     * @returns {Uint8Array}
     */
    String.prototype.hexDecode = function () {
        let length = this.length / 2;
        let buff = new Array(length);
        for (let i = 0; i < length; i++) {
            buff[i] = parseInt(this.slice(i * 2, i * 2 + 2) || '0', 16);
            if (isNaN(buff[i])) {
                buff[i] = 0;
            }
        }
        return new Uint8Array(buff);
    };
    /**
     * @returns {string}
     */
    Uint8Array.prototype.base64Encode = function () {
        return bytesToBase64(this);
    };
    /**
     * @returns {string}
     */
    Uint8Array.prototype.decode = function () {
        return new TextDecoder().decode(this);
    };
    /**
     * @returns {string}
     */
    Uint8Array.prototype.hexEncode = function () {
        let i, str = '', len = this.byteLength;
        for (i = 0; i < len; i++) {
            str += this[i].toString(16);
        }
        return str;
    };

})(window);

/******* Date ******/
(function (window) {
    Date.initRealTime = function (t) {
        let real = new Date(Math.log10(t) < 10 ? t * 1000 : t);
        let now = new Date();
        Date._realTimeFix = +real - now;
    };
    Date.real = function () {
        return new Date(Date.now() + Date._realTimeFix);
    };
})(window);

window.jQuery && (function ($) {
    $.getCsrfToken = function () {
        return $("meta[name=csrf-token]").attr("content");
    };
    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
        //console.log(options);
        //console.log(originalOptions);
        !options.crossDomain && $.getCsrfToken() && jqXHR.setRequestHeader("X-CSRF-Token", $.getCsrfToken())
    });
})(jQuery);