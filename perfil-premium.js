document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.stat-card, .achievement, .timeline-item, .rank-step');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('profile-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    cards.forEach((card, index) => {
      card.style.setProperty('--reveal-delay', `${Math.min(index * 45, 360)}ms`);
      observer.observe(card);
    });
  } else {
    cards.forEach((card) => card.classList.add('profile-visible'));
  }
});
