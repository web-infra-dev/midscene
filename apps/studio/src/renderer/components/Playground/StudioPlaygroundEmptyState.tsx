import { assetUrls } from '../../assets';
import { useT } from '../../i18n';
import './StudioPlaygroundEmptyState.css';

export function StudioPlaygroundEmptyState() {
  const t = useT();
  return (
    <div className="studio-playground-empty-state">
      <img
        alt=""
        aria-hidden="true"
        className="studio-playground-empty-state-logo"
        data-playground-empty-state-content-start=""
        src={assetUrls.playground.midsceneIcon}
      />
      <h2 className="studio-playground-empty-state-title">
        {t('playground.welcome.titleLine1')}
        <br />
        {t('playground.welcome.titleLine2')}
      </h2>
      <ul
        className="studio-playground-empty-state-list"
        data-playground-empty-state-content-end=""
      >
        <li>{t('playground.welcome.intro')}</li>
        <li>{t('playground.welcome.usage')}</li>
        <li>{t('playground.welcome.start')}</li>
      </ul>
    </div>
  );
}
