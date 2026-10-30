(() => {
  const screen = document.querySelector('#screen-content');
  const photoUrl = new URL('./assets/irene-photo.jpg', document.currentScript.src).href;
  let matchingQuery = false;

  function showLoveAnimation() {
    const row = screen.querySelector('.search-row');
    if (!row || row.querySelector('.irene-love-animation')) return;

    const animation = document.createElement('div');
    animation.className = 'irene-love-animation';
    animation.setAttribute('role', 'status');
    animation.setAttribute('aria-label', 'A little love for Irene');

    const photo = document.createElement('img');
    photo.className = 'irene-love-photo';
    photo.src = photoUrl;
    photo.alt = 'Irene';

    const heart = document.createElement('span');
    heart.className = 'irene-love-heart';
    heart.setAttribute('aria-hidden', 'true');
    heart.textContent = '♥';

    const name = document.createElement('span');
    name.className = 'irene-love-name';
    name.textContent = 'Irene';

    animation.append(photo, heart, name);
    row.append(animation);
    animation.addEventListener('animationend', () => animation.remove(), { once: true });
  }

  document.addEventListener('input', event => {
    if (!(event.target instanceof HTMLInputElement) || event.target.id !== 'search' ||
        screen.dataset.friendsScene !== 'explore') return;

    const matches = event.target.value.trim().toLowerCase() === 'irene';
    if (matches && !matchingQuery) {
      requestAnimationFrame(() => {
        const search = screen.querySelector('#search');
        if (screen.dataset.friendsScene === 'explore' &&
            search?.value.trim().toLowerCase() === 'irene') showLoveAnimation();
      });
    }
    if (!matches) screen.querySelector('.irene-love-animation')?.remove();
    matchingQuery = matches;
  }, true);
})();
