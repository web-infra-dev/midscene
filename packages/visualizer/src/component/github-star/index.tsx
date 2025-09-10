import './index.less';

export const GithubStar = () => {
  return (
    <a
      href="https://github.com/web-infra-dev/midscene"
      target="_blank"
      rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center' }}
    >
      <img
        className="github-star"
        src="https://img.shields.io/github/stars/web-infra-dev/midscene?style=social"
        alt="Github star"
        style={{ display: 'block' }}
      />
    </a>
  );
};
