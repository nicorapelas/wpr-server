const keys = require('../../config/keys').keys

module.exports = (token, user) => {
  return `
  <html>
  <head>
    <style type="text/css">
      @import url('https://fonts.googleapis.com/css?family=Roboto:100,400');
      html,
      body,
      div,
      span,
      applet,
      object,
      iframe,
      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
      p,
      blockquote,
      pre,
      a,
      abbr,
      acronym,
      address,
      big,
      cite,
      code,
      del,
      dfn,
      em,
      img,
      ins,
      kbd,
      q,
      s,
      samp,
      small,
      strike,
      strong,
      sub,
      sup,
      tt,
      var,
      b,
      u,
      i,
      center,
      dl,
      dt,
      dd,
      ol,
      ul,
      li,
      fieldset,
      form,
      label,
      legend,
      table,
      caption,
      tbody,
      tfoot,
      thead,
      tr,
      th,
      td,
      article,
      aside,
      canvas,
      details,
      embed,
      figure,
      figcaption,
      footer,
      header,
      hgroup,
      menu,
      nav,
      output,
      ruby,
      section,
      summary,
      time,
      mark,
      audio,
      video {
        margin: 0;
        padding: 0;
        border: 0;
        font-size: 100%;
        font: inherit;
        vertical-align: baseline;
      }
      /* HTML5 display-role reset for older browsers */
      article,
      aside,
      details,
      figcaption,
      figure,
      footer,
      header,
      hgroup,
      menu,
      nav,
      section {
        display: block;
      }
      body {
        line-height: 1;
      }
      ol,
      ul {
        list-style: none;
      }
      blockquote,
      q {
        quotes: none;
      }
      blockquote:before,
      blockquote:after,
      q:before,
      q:after {
        content: '';
        content: none;
      }
      table {
        border-collapse: collapse;
        border-spacing: 0;
      }
      a {
        text-decoration: none;
      }
      body {
        font-family: 'Roboto', sans-serif;
        font-size: 14px;
      }

      span {
        padding: 0.5rem;
      }

      a {
        padding: 0.8rem 1.6rem;
        margin: 1rem;
      }

      footer {
        text-align: center;
      }

      .email-bed {
        color: #ffff;
        background-color: #242a38;
        letter-spacing: 1px;
        width: 100%;
        text-align: center;
      }

      .email-logo-bed {
        text-align: center;
      }

      .email-logo-bed img {
        height: 60px;
        padding: 15px;
      }

      .email-content-bed {
        text-align: center;
        line-height: 1.5rem;
        letter-spacing: 1px;
      }

      .email-msg-contect-bed {
        color: #278ACD;
        font-size: 1.2rem;
      }

      .label-bed {
        color: #f9b321;
        font-weight: 100;
        font-size: 1.1rem;
        letter-spacing: 1px;
      }

      .email-cell-bed {
        padding: 10px 0 10px 0;
        letter-spacing: 1px;
      }

      .email-link-btn-container {
        padding-bottom: 20px;
        letter-spacing: 1px;
      }

      .email-link-btn-container a {
        background: #288E1A;
        color: #ffff;
        border-radius: 5px;
      }
    </style>
  </head>
  <body>
    <div class="email-bed">
      <div class="email-container">
        <div class="email-logo-bed">
          <img
            src="https://drive.google.com/uc?id=1PTe--nCvq9X72nAiWCXnLk8LpdoW7gsv"
            alt="header logo"
          />
        </div>
        <div class="email-content-bed">
          <div class="email-cell-bed">
            <div class="label-bed">CV-Cloud Password Reset</div>
          </div>
          <div class="email-cell-bed">
            <div class="email-msg-contect-bed">
              <div>Hi there,</div>
              <div>We've received a request to reset your CV-Cloud account password</div>
            </div>
          </div>
          <div class="email-cell-bed">
            <div class="email-link-btn-bed">
              <div class="email-link-btn-container">
                <a
                  href="http://localhost:5000/auth/user/reset/${token}"
                  class="ui circular facebook icon button"
                >
                  Reset password
                </a>
              </div>
            </div>
          </div>
          <div class="email-msg-contect-bed">If you did not request this, please ignore this email and your password will remain unchanged</div>
        </div>
        <footer>
          <span>Copyright 2018 - CV Cloud</span>
        </footer>
      </div>
    </div>
  </body>
</html>

    `
}
