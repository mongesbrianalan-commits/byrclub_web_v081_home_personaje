const rewardTabs = document.querySelectorAll('.reward-tab');
const rewardPanels = document.querySelectorAll('.reward-panel');

function activateRewardTab(name) {
  rewardTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  rewardPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
}

rewardTabs.forEach(tab => tab.addEventListener('click', () => activateRewardTab(tab.dataset.tab)));
document.querySelectorAll('[data-tab-target]').forEach(button => button.addEventListener('click', () => {
  activateRewardTab(button.dataset.tabTarget);
  document.querySelector('.rewards-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

const benefitItems = document.querySelectorAll('.reveal-benefit');
const benefitObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.animate([
      { opacity: 0, transform: 'translateY(28px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    benefitObserver.unobserve(entry.target);
  });
}, { threshold: .12 });
benefitItems.forEach(item => benefitObserver.observe(item));

document.querySelectorAll('.redeem-action').forEach(button => button.addEventListener('click', () => {
  const original = button.textContent;
  button.textContent = '✓ Canje simulado';
  button.classList.add('redeemed');
  setTimeout(() => { button.textContent = original; button.classList.remove('redeemed'); }, 1800);
}));
