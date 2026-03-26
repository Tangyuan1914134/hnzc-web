if (window.top !== window.self) {
  document.querySelectorAll('.reveal').forEach((element) => {
    element.classList.add('in-view');
  });
}

const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');
const currentPage = document.body.dataset.page;

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    siteNav.classList.toggle('is-open');
  });
}

document.querySelectorAll('.site-nav a').forEach((link) => {
  const href = link.getAttribute('href');
  if (!href) return;
  const normalized = href.replace('.html', '');
  if (
    (currentPage === 'home' && href === 'index.html') ||
    normalized === currentPage
  ) {
    link.classList.add('is-active');
  }
});

if (window.top === window.self) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll('.reveal').forEach((element) => {
    observer.observe(element);
  });
}

const form = document.querySelector('.contact-form');

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const note = form.querySelector('.form-note');
    if (note) {
      note.textContent = '演示表单已接收你的输入，但当前版本不会提交到后台。';
    }
  });
}
