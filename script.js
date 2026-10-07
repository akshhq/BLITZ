/* Standalone, dependency-free behavior for the static BLITZ site. */

const team = [
  ['TBD — Core Member 01', 'President', 'core'], ['TBD — Core Member 02', 'Secretary', 'core'], ['TBD — Core Member 03', 'Treasurer', 'core'],
  ['TBD — Senior Executive 01', 'Senior Executive', 'senior'], ['TBD — Senior Executive 02', 'Senior Executive', 'senior'], ['TBD — Senior Executive 03', 'Senior Executive', 'senior'], ['TBD — Senior Executive 04', 'Senior Executive', 'senior'], ['TBD — Senior Executive 05', 'Senior Executive', 'senior'],
  ['TBD — Junior Member 01', 'Junior Member', 'junior'], ['TBD — Junior Member 02', 'Junior Member', 'junior'], ['TBD — Junior Member 03', 'Junior Member', 'junior'],
  ['TBD — Volunteer 01', 'Volunteer', 'volunteer'], ['TBD — Volunteer 02', 'Volunteer', 'volunteer'], ['TBD — Volunteer 03', 'Volunteer', 'volunteer'], ['TBD — Volunteer 04', 'Volunteer', 'volunteer'], ['TBD — Volunteer 05', 'Volunteer', 'volunteer'],
].map(([name, position, tier]) => ({ name, position, tier, image: 'assets/images/team/placeholder.jpg' }));

const events = [
  { id: 'blitzkrieg', title: 'Blitzkrieg', description: 'A flagship celebration of code, creativity and the people who make BLITZ move.', date: '15 Mar 2025', location: 'Keshav Mahavidyalaya', additionalInfo: 'Annual technical festival' },
  { id: 'hackathon-2025', title: 'CodeVerse', description: 'A focused build sprint where teams turn sharp ideas into working prototypes.', date: '20 Apr 2025', location: 'Computer Science Lab', additionalInfo: 'Collaborative hackathon' },
  { id: 'workshop-2025', title: 'TechNova', description: 'An exploratory workshop for learning new tools, patterns and ways of thinking.', date: '10 May 2025', location: 'Seminar Hall', additionalInfo: 'Hands-on workshop' },
];

const gallery = [
  ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80', 'Demo Event 01'],
  ['https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80', 'Demo Event 02'],
  ['https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80', 'Demo Event 03'],
  ['https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=1400&q=80', 'Demo Event 04'],
  ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80', 'Demo Event 05'],
].map(([image, title]) => ({ image, title }));

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const number = (value, length) => String(value).padStart(length, '0');

function makeLogo() {
  document.querySelector('.blitz-logo-extrusion').innerHTML = Array.from({ length: 12 }, (_, index) => `<span class="blitz-logo-depth" style="--depth-step:${(index + 1) * 2}px">BLITZ</span>`).join('');
  document.querySelectorAll('.marquee-group').forEach((group) => {
    group.innerHTML = Array.from({ length: 4 }, () => '<span class="marquee-text">COMPUTER SCIENCE DEPARTMENT</span>').join('');
  });
}

function renderTeam() {
  const tiers = [
    ['core', 'Leadership', 'leadership-grid grid-cols-2 md-grid-cols-3 gap-8'],
    ['senior', 'Senior Executives', 'grid-cols-2 md-grid-cols-5 gap-6'],
    ['junior', 'Junior Members', 'grid-cols-2 md-grid-cols-3 gap-6'],
    ['volunteer', 'Volunteers', 'grid-cols-2 md-grid-cols-5 gap-6'],
  ];
  document.querySelector('#team-content').innerHTML = tiers.map(([tier, label, gridClass]) => {
    const cards = team.filter((member) => member.tier === tier).map((member) => `
      <div class="team-card">
        <div class="team-card-image"><img src="${member.image}" alt="${escapeHtml(member.name)}" /></div>
        <h3 class="team-card-name">${escapeHtml(member.name)}</h3>
        <p class="team-card-position">${escapeHtml(member.position)}</p>
      </div>`).join('');
    return `<section class="team-tier reveal-tier"><div class="team-tier-heading"><h3>${label}</h3></div><div class="team-tier-grid ${gridClass}">${cards}</div></section>`;
  }).join('');
}

function renderEvents() {
  document.querySelector('#events-stack').innerHTML = events.map((event, index) => `
    <article class="events-panel" style="--event-index:${index};--event-stack-offset:${index * 52}px">
      <div class="events-panel-inner">
        <p class="events-panel-number">N°${number(index + 1, 3)}</p>
        <div class="events-panel-content">
          <h3>${escapeHtml(event.title)}</h3>
          <p class="events-panel-description">${escapeHtml(event.description)}</p>
          <dl class="events-panel-details"><div><dt>Date</dt><dd>${event.date}</dd></div><div><dt>Location</dt><dd>${event.location}</dd></div></dl>
          <p class="events-panel-info">${escapeHtml(event.additionalInfo)}</p>
        </div>
      </div>
    </article>`).join('');
}

function renderHighlights() {
  document.querySelector('#highlights-track').innerHTML = events.map((event, index) => `
    <button class="highlights-card" type="button" aria-expanded="false" aria-label="${escapeHtml(event.title)} details">
      <span class="highlights-card-surface">
        <span class="highlights-card-header"><span class="highlights-card-number">${number(index + 1, 2)}</span></span>
        <span class="highlights-card-main"><span class="highlights-card-title">${escapeHtml(event.title)}</span><span class="highlights-card-meta-wrap"><span class="highlights-card-meta">${event.date}</span><span class="highlights-card-meta">${event.location}</span></span></span>
        <span class="highlights-card-details"><span><span class="highlights-card-description">${escapeHtml(event.description)}</span><span class="highlights-card-list"><span><span class="highlights-detail-label">Date</span><span>${event.date}</span></span><span><span class="highlights-detail-label">Location</span><span>${event.location}</span></span><span><span class="highlights-detail-label">Type</span><span>${event.additionalInfo}</span></span></span></span></span>
      </span>
    </button>`).join('');
}

function renderGallery() {
  document.querySelector('#gallery-track').innerHTML = gallery.map((item, index) => `
    <figure class="gallery-item"><div class="gallery-image" role="img" aria-label="${escapeHtml(item.title)}" style="background-image:url('${item.image}')"></div><figcaption><span>${number(index + 1, 2)}</span>${escapeHtml(item.title)}</figcaption></figure>`).join('');
}

function setUpMenu() {
  const toggle = document.querySelector('#menu-toggle');
  const links = document.querySelector('#primary-navigation-links');
  const setOpen = (open) => {
    toggle.classList.toggle('is-open', open);
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  };
  toggle.addEventListener('click', () => setOpen(!toggle.classList.contains('is-open')));
  links.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
}

function setUpHeroLogo() {
  const logo = document.querySelector('#transition-logo');
  const hero = document.querySelector('.introduction');
  let frame = null;
  const update = () => {
    frame = null;
    const initialTop = window.innerHeight * 0.414;
    const progress = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / hero.offsetHeight));
    const y = -(initialTop - 37) * progress;
    const scale = 1 - 0.82 * progress;
    logo.style.transform = `translate(-50%, calc(-50% + ${y}px)) scale(${scale})`;
  };
  const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  update();
}

function setUpHorizontalRail(selector) {
  const scroller = document.querySelector(selector);
  let target = scroller.scrollLeft;
  let frame = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const animate = () => {
    const distance = target - scroller.scrollLeft;
    if (Math.abs(distance) < 0.5) { scroller.scrollLeft = target; frame = null; return; }
    scroller.scrollLeft += distance * 0.14;
    frame = requestAnimationFrame(animate);
  };
  scroller.addEventListener('wheel', (event) => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 0 || !event.deltaY) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    target = clamp(target + event.deltaY * multiplier, 0, max);
    if (!frame) frame = requestAnimationFrame(animate);
  }, { passive: false });
  scroller.addEventListener('scroll', () => { if (!frame) target = scroller.scrollLeft; }, { passive: true });
}

function setUpHighlightCards() {
  const cards = [...document.querySelectorAll('.highlights-card')];
  const setExpanded = (card, expanded) => {
    card.classList.toggle('is-expanded', expanded);
    card.setAttribute('aria-expanded', String(expanded));
  };
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => setExpanded(card, true));
    card.addEventListener('mouseleave', () => setExpanded(card, false));
    card.addEventListener('focus', () => setExpanded(card, true));
    card.addEventListener('blur', () => setExpanded(card, false));
    card.addEventListener('click', () => setExpanded(card, !card.classList.contains('is-expanded')));
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.highlights-card')) cards.forEach((card) => setExpanded(card, false));
  });
}

function setUpReveals() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealItems = [...document.querySelectorAll('[data-reveal], .reveal-tier')];
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-revealed'));
    return;
  }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); observer.unobserve(entry.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  revealItems.forEach((item) => observer.observe(item));
}

makeLogo();
renderTeam();
renderEvents();
renderHighlights();
renderGallery();
setUpMenu();
setUpHeroLogo();
setUpHorizontalRail('#highlights-scroller');
setUpHorizontalRail('#gallery-scroller');
setUpHighlightCards();
setUpReveals();
