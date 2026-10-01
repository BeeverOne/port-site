/* Interface copy (buttons, labels, messages) in English and German. The intro copy (statement,
   paragraphs, about label, trigger heading) is content: the owner edits it in Keystatic
   (src/content/intro.yaml), and the page merges it into T at start-up (SitePage.astro, site.js). */
export const T = {
  en: {
    enterWorks: 'Go to my works', works: '[ Works ]',
    contact: 'Contact', contactTitle: 'Contact', close: '[ Close ]', name: 'Name', email: 'Email', message: 'Message', send: 'Send',
    impressum: '[ Impressum ]', privacy: '[ Privacy policy ]', loading: 'Loading', scrollbar: 'Project position', sliderValue: 'Project {a} of {b}', footerToggle: 'Show or hide the footer links',
    mediaFailed: 'This item did not load.', mediaRetry: 'Try again',
    errName: 'Enter your name.', errEmail: 'Enter a valid email address.', errMessage: 'Enter a message.',
    sending: 'Sending…', sent: 'Thank you. Your message is on its way.', errVerify: 'The spam check has not finished. Please wait a moment and try again.', failed: 'The message could not be sent. Your text is still here. Please try again.',
    toDark: 'Switch to dark mode', toLight: 'Switch to light mode', projects: 'Projects'
  },
  de: {
    enterWorks: 'Zu meinen Arbeiten', works: '[ Arbeiten ]',
    contact: 'Kontakt', contactTitle: 'Kontakt', close: '[ Schließen ]', name: 'Name', email: 'E-Mail', message: 'Nachricht', send: 'Senden',
    impressum: '[ Impressum ]', privacy: '[ Datenschutz ]', loading: 'Wird geladen', scrollbar: 'Projektposition', sliderValue: 'Projekt {a} von {b}', footerToggle: 'Fußzeilen-Links ein- oder ausblenden',
    mediaFailed: 'Dieses Element wurde nicht geladen.', mediaRetry: 'Erneut versuchen',
    errName: 'Bitte gib deinen Namen ein.', errEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.', errMessage: 'Bitte gib eine Nachricht ein.',
    sending: 'Wird gesendet…', sent: 'Danke. Deine Nachricht ist unterwegs.', errVerify: 'Die Spam-Prüfung ist noch nicht fertig. Bitte warte einen Moment und versuche es erneut.', failed: 'Die Nachricht konnte nicht gesendet werden. Dein Text ist noch da. Bitte versuche es erneut.',
    toDark: 'Zum dunklen Modus wechseln', toLight: 'Zum hellen Modus wechseln', projects: 'Projekte'
  }
};

