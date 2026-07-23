const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('[data-scroll]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.querySelector(button.dataset.scroll);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const form = document.getElementById('waitlistForm');
const status = document.getElementById('formStatus');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const leads = JSON.parse(localStorage.getItem('byrclub_waitlist') || '[]');
  leads.push({ ...data, fecha: new Date().toISOString() });
  localStorage.setItem('byrclub_waitlist', JSON.stringify(leads));
  status.textContent = `¡Listo, ${data.nombre}! Ya reservaste tu lugar como fundador.`;
  form.reset();
});

const cards = document.querySelectorAll('.feature-card');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      entry.target.animate([
        { opacity: 0, transform: 'translateY(32px) rotate(1deg)' },
        { opacity: 1, transform: 'translateY(0) rotate(0)' }
      ], { duration: 550, delay: index * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      observer.unobserve(entry.target);
    }
  });
}, { threshold: .18 });

cards.forEach(card => observer.observe(card));
