/* Interface copy. EN from portfolio-intro-copy.md; DE is a DRAFT translation for review.
   Statement parts carry the highlighter timing; \u00AD is a soft hyphen for the DE wrap.
   Lifted verbatim from docs/v2/portfolio-prototype-v2.html. */
export const T = {
  en: {
    statement: [
      { t: 'I’m ' }, { name: 'Oluwafemi Bamigboye' }, { t: ', a ' },
      { hl: 'software', delay: 200, dur: 650 }, { t: ' ' },
      { hl: 'developer', delay: 520, dur: 900 },               // starts later and ends last
      { t: ' with a background that spans medicine, civil engineering and art.' }
    ],
    p2: 'I take a user-centric approach to building solutions, which is why I focus on the experience design of the systems I create. These include websites and web apps, full-stack software, interactive systems and unified systems that combine hardware and software.',
    p3: 'The rapid development of AI over the past couple of years has made writing code more accessible, but it doesn’t replace the need for sound, well-designed architecture. Over the past year, I’ve been refining workflows built on software development standards and best practices, giving AI tools a grounded framework for integration and execution.',
    p4: 'Another theme is the steadily improving cybersecurity capabilities of these models, and the resulting need to harden both current systems and the new ones we build.',
    about: '[ about ]', trigger: 'Here are some of my work', enterWorks: 'Go to my works', works: '[ Works ]',
    contact: 'Contact', contactTitle: 'Contact', close: '[ Close ]', name: 'Name', email: 'Email', message: 'Message', send: 'Send',
    impressum: '[ Impressum ]', privacy: '[ Privacy policy ]', loading: 'Loading', scrollbar: 'Project position', footerToggle: 'Show or hide the footer links',
    blockText: '[Text block: project description from the CMS]', blockImage: '[Image block]', blockVideo: '[Video block]',
    blockDemo: '[Interactive component preview]', demoLabel: 'Circle size', turnstile: '[Cloudflare Turnstile check goes here]',
    errName: 'Enter your name.', errEmail: 'Enter a valid email address.', errMessage: 'Enter a message.',
    sending: 'Sending…', sent: 'Thank you. Your message is on its way.', failed: 'The message could not be sent. Your text is still here. Please try again.',
    toDark: 'Switch to dark mode', toLight: 'Switch to light mode', projects: 'Projects'
  },
  de: {
    statement: [
      { t: 'Ich bin ' }, { name: 'Oluwafemi Bamigboye' }, { t: ', ' },
      { hl: 'Software\u00ADentwickler', delay: 200, dur: 1100 },
      { t: ' mit einem Hintergrund in Medizin, Bauingenieurwesen und Kunst.' }
    ],
    p2: 'Ich entwickle Lösungen nutzerzentriert. Deshalb liegt mein Fokus auf dem Experience Design der Systeme, die ich baue: Websites und Web-Apps, Full-Stack-Software, interaktive Systeme und integrierte Systeme aus Hardware und Software.',
    p3: 'Die rasante Entwicklung von KI in den letzten Jahren hat das Programmieren zugänglicher gemacht, ersetzt aber keine solide, gut durchdachte Architektur. Im letzten Jahr habe ich Workflows verfeinert, die auf Standards und Best Practices der Softwareentwicklung aufbauen und KI-Werkzeugen einen verlässlichen Rahmen für Integration und Umsetzung geben.',
    p4: 'Ein weiteres Thema sind die stetig wachsenden Cybersecurity-Fähigkeiten dieser Modelle und die daraus folgende Notwendigkeit, bestehende und neue Systeme abzusichern.',
    about: '[ über mich ]', trigger: 'Hier sind einige meiner Arbeiten', enterWorks: 'Zu meinen Arbeiten', works: '[ Arbeiten ]',
    contact: 'Kontakt', contactTitle: 'Kontakt', close: '[ Schließen ]', name: 'Name', email: 'E-Mail', message: 'Nachricht', send: 'Senden',
    impressum: '[ Impressum ]', privacy: '[ Datenschutz ]', loading: 'Wird geladen', scrollbar: 'Projektposition', footerToggle: 'Fußzeilen-Links ein- oder ausblenden',
    blockText: '[Textblock: Projektbeschreibung aus dem CMS]', blockImage: '[Bildblock]', blockVideo: '[Videoblock]',
    blockDemo: '[Interaktive Komponentenvorschau]', demoLabel: 'Kreisgröße', turnstile: '[Hier kommt die Cloudflare-Turnstile-Prüfung]',
    errName: 'Bitte gib deinen Namen ein.', errEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.', errMessage: 'Bitte gib eine Nachricht ein.',
    sending: 'Wird gesendet…', sent: 'Danke. Deine Nachricht ist unterwegs.', failed: 'Die Nachricht konnte nicht gesendet werden. Dein Text ist noch da. Bitte versuche es erneut.',
    toDark: 'Zum dunklen Modus wechseln', toLight: 'Zum hellen Modus wechseln', projects: 'Projekte'
  }
};

