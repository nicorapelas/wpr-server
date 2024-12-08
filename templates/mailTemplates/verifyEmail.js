module.exports = newUser => {
  return `
  <html>
  <head>
    <title></title>
  </head>
  <body>
  <div data-role="module-unsubscribe" class="module" role="module" data-type="unsubscribe" style="color:#444444; font-size:12px; line-height:20px; padding:16px 16px 16px 16px; text-align:Center;" data-muid="4e838cf3-9892-4a6d-94d6-170e474d21e5">
  <div>
    <img style="width:200px; margin-bottom: 15px;" src="http://cdn.mcauto-images-production.sendgrid.net/7c24a358626a9096/b0b25cd2-4cbe-47b0-8390-a2f6411919b8/179x31.png" alt="cvCloud-ogo" />
  </div>
      <div style="font-size:1rem; font-weight: 900;">Good day, you are almost ready to start enjoying CV Cloud</div>
      <div style="font-size:1rem; font-weight: 900; padding-bottom:20px;">Simply click on the link bellow to verify your email address</div>
      <a
      href="http://localhost:3000/email-verified/${newUser.id}" 
      class="ui circular facebook icon button"
    >
      Verify Email
    </a>
  </div>
  </body>
</html>
    `
}
