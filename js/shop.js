/**
 * Elena Giordani - Shop Payment Handler
 * Timer 24h + payment button logic
 */

(function() {
    'use strict';

    var TIMER_KEY = 'eg_shop_first_visit';
    var TIMER_DURATION = 24 * 60 * 60 * 1000; // 24h in ms

    // Pricing config
    var PRICES = {
        earlyBird: {
            full: '1.800',
            rate12: '150',
            rate24: '75',
            originalFull: '3.000',
            originalRate12: '250',
            originalRate24: '125'
        },
        regular: {
            full: '3.000',
            rate12: '250',
            rate24: '125'
        }
    };

    // --- Timer Logic ---

    function getFirstVisitTimestamp() {
        var stored = localStorage.getItem(TIMER_KEY);
        if (stored) return parseInt(stored, 10);

        var now = Date.now();
        localStorage.setItem(TIMER_KEY, now.toString());
        return now;
    }

    function getTimeRemaining() {
        var firstVisit = getFirstVisitTimestamp();
        var deadline = firstVisit + TIMER_DURATION;
        var now = Date.now();
        return Math.max(0, deadline - now);
    }

    function isEarlyBird() {
        return getTimeRemaining() > 0;
    }

    function updateTimerDisplay() {
        var remaining = getTimeRemaining();
        var timerWrapper = document.getElementById('timerWrapper');
        var timerExpired = document.getElementById('timerExpired');

        if (!timerWrapper) return;

        if (remaining <= 0) {
            timerWrapper.style.display = 'none';
            if (timerExpired) timerExpired.classList.add('visible');
            updatePrices(false);
            return;
        }

        var totalSeconds = Math.floor(remaining / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        var elH = document.getElementById('timer-hours');
        var elM = document.getElementById('timer-minutes');
        var elS = document.getElementById('timer-seconds');

        if (elH) elH.textContent = hours.toString().padStart(2, '0');
        if (elM) elM.textContent = minutes.toString().padStart(2, '0');
        if (elS) elS.textContent = seconds.toString().padStart(2, '0');

        updatePrices(true);
    }

    function updatePrices(earlyBird) {
        var priceFull = document.getElementById('price-full');
        var price12 = document.getElementById('price-12');
        var price24 = document.getElementById('price-24');
        var origFull = document.getElementById('price-full-original');
        var orig12 = document.getElementById('price-12-original');
        var orig24 = document.getElementById('price-24-original');

        if (earlyBird) {
            if (priceFull) priceFull.innerHTML = '&euro;' + PRICES.earlyBird.full;
            if (price12) price12.innerHTML = '&euro;' + PRICES.earlyBird.rate12 + '<span>/mese</span>';
            if (price24) price24.innerHTML = '&euro;' + PRICES.earlyBird.rate24 + '<span>/mese</span>';
            if (origFull) { origFull.innerHTML = '&euro;' + PRICES.earlyBird.originalFull; origFull.classList.add('visible'); }
            if (orig12) { orig12.innerHTML = '&euro;' + PRICES.earlyBird.originalRate12 + '/mese'; orig12.classList.add('visible'); }
            if (orig24) { orig24.innerHTML = '&euro;' + PRICES.earlyBird.originalRate24 + '/mese'; orig24.classList.add('visible'); }
        } else {
            if (priceFull) priceFull.innerHTML = '&euro;' + PRICES.regular.full;
            if (price12) price12.innerHTML = '&euro;' + PRICES.regular.rate12 + '<span>/mese</span>';
            if (price24) price24.innerHTML = '&euro;' + PRICES.regular.rate24 + '<span>/mese</span>';
            if (origFull) origFull.classList.remove('visible');
            if (orig12) orig12.classList.remove('visible');
            if (orig24) orig24.classList.remove('visible');
        }
    }

    // --- Payment Logic ---

    function initPaymentButtons() {
        var buttons = document.querySelectorAll('[data-payment]');

        buttons.forEach(function(btn) {
            if (btn.disabled) return;

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                handlePayment(this);
            });
        });
    }

    function handlePayment(btn) {
        var provider = btn.dataset.payment;
        var originalHTML = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = 'CARICAMENTO...';

        var endpoint;
        switch (provider) {
            case 'stripe':
                endpoint = '/api/create-checkout-session';
                break;
            case 'pagodil':
                endpoint = '/api/create-pagodil-session';
                break;
            case 'apppago':
                endpoint = '/api/create-apppago-session';
                break;
            default:
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                return;
        }

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                earlyBird: isEarlyBird()
            })
        })
        .then(function(response) {
            return response.json().then(function(data) {
                return { ok: response.ok, data: data };
            });
        })
        .then(function(result) {
            if (!result.ok) {
                if (result.data.available === false) {
                    alert(result.data.message || 'Questa opzione non e\u0300 ancora disponibile.');
                } else {
                    throw new Error(result.data.error || 'Errore nel pagamento');
                }
                return;
            }

            if (result.data.url) {
                window.location.href = result.data.url;
            }
        })
        .catch(function(err) {
            console.error('Payment error:', err);
            alert('Si e\u0300 verificato un errore. Riprova o contattaci.');
        })
        .finally(function() {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        });
    }

    // --- Init ---

    document.addEventListener('DOMContentLoaded', function() {
        // Only run on pages with timer/payment elements
        if (document.getElementById('timerWrapper')) {
            updateTimerDisplay();
            setInterval(updateTimerDisplay, 1000);
        }

        initPaymentButtons();
    });

})();
