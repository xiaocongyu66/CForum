const fs = require('fs');
const redirects = [
  '/profile /profile.html 200',
  '/emoji-plaza /emoji-plaza.html 200',
  '/sections /sections.html 200',
  '/notifications /notifications.html 200',
  '/post /post.html 200',
  '/post/:id /post.html 200',
  '/posts/:id /post.html 200',
  '/posts/* /post.html 200',
  '/settings /settings.html 200',
  '/admin /admin.html 200',
  '/login /login.html 200',
  '/register /register.html 200',
  '/forgot /forgot.html 200',
  '/reset /reset.html 200',
  '/* /index.html 200',
].join('\n');
fs.writeFileSync('public/_redirects', redirects);
console.log('_redirects written');
