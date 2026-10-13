
// ============ COUNTDOWN TIMER - 5 MINUTI ============

function startCountdown() {
  // Imposta 5 minuti (300 secondi)
  let timeLeft = 5 * 60;
  
  const minutesElement = document.getElementById('minutes');
  const secondsElement = document.getElementById('seconds');
  const timerContainer = document.querySelector('.urgency-timer');
  
  function updateTimer() {
    // Calcola minuti e secondi
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    // Aggiorna il display con zero padding
    minutesElement.textContent = String(minutes).padStart(2, '0');
    secondsElement.textContent = String(seconds).padStart(2, '0');
    
    // Decrementa il tempo
    timeLeft--;
    
    // Quando arriva a zero
    if (timeLeft < 0) {
      clearInterval(timerInterval);
      minutesElement.textContent = '00';
      secondsElement.textContent = '00';
      timerContainer.classList.add('expired');
    }
    
    // Effetto urgenza delicato negli ultimi 60 secondi
    if (timeLeft <= 60 && timeLeft > 0) {
      timerContainer.style.animation = 'gentle-pulse 1s ease-in-out infinite';
    }
  }
  
  // Aggiorna subito
  updateTimer();
  
  // Aggiorna ogni secondo
  const timerInterval = setInterval(updateTimer, 1000);
}

// Avvia il countdown quando la pagina è caricata
document.addEventListener('DOMContentLoaded', startCountdown);
