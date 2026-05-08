(function() {
    var ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','msclkid'];
    try {
        var params = new URLSearchParams(window.location.search);
        var stored = JSON.parse(sessionStorage.getItem('attribution') || '{}');
        var updated = false;
        ATTR_KEYS.forEach(function(k) {
            var v = params.get(k);
            if (v && !stored[k]) { stored[k] = v; updated = true; }
        });
        if (!stored.landing_url) { stored.landing_url = window.location.href; updated = true; }
        if (!stored.referrer && document.referrer) { stored.referrer = document.referrer; updated = true; }
        if (updated) sessionStorage.setItem('attribution', JSON.stringify(stored));
    } catch (e) {}

    window.getAttribution = function() {
        try { return JSON.parse(sessionStorage.getItem('attribution') || '{}'); } catch (e) { return {}; }
    };
})();
