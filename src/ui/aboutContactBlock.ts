import { CONTACT_MAILTO, CV_HREF, LINKEDIN_HREF, MEDIUM_HREF } from '../data/contactLinks';
import { iconSvg } from './icons';
import { t } from './i18n';

export function createAboutContactBlock(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'reading-about__contact';
  section.setAttribute('aria-label', t('chrome.contact'));

  const actions = document.createElement('div');
  actions.className = 'reading-about__contact-actions';

  const cv = document.createElement('a');
  cv.className = 'ui-btn ui-btn--primary reading-about__cv';
  cv.href = CV_HREF;
  cv.target = '_blank';
  cv.rel = 'noopener noreferrer';
  cv.innerHTML = `${iconSvg('download')} <span>${t('chrome.downloadCv')}</span>`;

  const contact = document.createElement('a');
  contact.className = 'ui-btn ui-btn--secondary reading-about__contact-btn';
  contact.href = CONTACT_MAILTO;
  contact.innerHTML = `${iconSvg('mail')} <span>${t('chrome.contact')}</span>`;

  actions.append(cv, contact);

  const links = document.createElement('div');
  links.className = 'reading-about__contact-links';

  const row = (label: string, href: string, external = true) => {
    const a = document.createElement('a');
    a.className = 'reading-about__contact-row';
    a.href = href;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.innerHTML = `<span class="reading-about__contact-label">${label}</span>${iconSvg('arrowNe', 14)}`;
    return a;
  };

  links.append(
    row(t('read.about.email'), CONTACT_MAILTO, false),
    row(t('read.about.linkedin'), LINKEDIN_HREF),
    row(t('read.about.medium'), MEDIUM_HREF),
  );

  section.append(actions, links);
  return section;
}
