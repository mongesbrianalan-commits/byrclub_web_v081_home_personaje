document.addEventListener('DOMContentLoaded', () => {
  const revealItems = document.querySelectorAll('.match-card, .how-card, .ranking-row, .history-row');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('prode-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealItems.forEach((item, index) => {
      item.style.setProperty('--reveal-delay', `${Math.min(index * 40, 320)}ms`);
      item.classList.add('reveal-pending');
      observer.observe(item);
    });
  }

  document.querySelectorAll('.predict-action:not(.locked)').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.match-card');
      const inputs = card.querySelectorAll('.match-score-inputs input');
      const hasScore = Array.from(inputs).every(input => input.value !== '');

      if (!hasScore) {
        button.textContent = 'Cargá ambos resultados';
        window.setTimeout(() => {
          button.textContent = 'Confirmar pronóstico';
        }, 1600);
        return;
      }

      const originalText = button.textContent;
      button.textContent = '✓ Pronóstico guardado';
      button.classList.add('confirmed');

      window.setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('confirmed');
      }, 1800);
    });
  });
});
