import { assetUrls } from '../../assets';
import './StudioPlaygroundEmptyState.css';

export function StudioPlaygroundEmptyState() {
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
        Welcome to <br /> Midscene.js Playground!
      </h2>
      <ul
        className="studio-playground-empty-state-list"
        data-playground-empty-state-content-end=""
      >
        <li>
          This is a panel for experimenting and testing Midscene.js features.
        </li>
        <li>
          You can use natural language instructions to operate the web page,
          such as clicking buttons, filling in forms, querying information, etc.
        </li>
        <li>
          Please enter your instructions in the input box below to start
          experiencing.
        </li>
      </ul>
    </div>
  );
}
