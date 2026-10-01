/* Server-side access to the interface dictionary (ADR-0012): each page is pre-rendered in its URL's
   language, so components render their text from the same T that site.js uses for in-place switching. */
import { T } from './ui.js';

export const dict = (lang) => T[lang] ?? T.en;
/* The same page in the other language: '/' <-> '/de/', '/works/x' <-> '/de/works/x'. */
export const prefix = (lang) => (lang === 'de' ? '/de' : '');
export const homePath = (lang) => (lang === 'de' ? '/de/' : '/');
