import './logo.less';

export const LogoUrl =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/Midscene.png';

export const Logo = ({
  withGithubStar = false,
  hideLogo = false,
}: { withGithubStar?: boolean; hideLogo?: boolean }) => {
  if (hideLogo) {
    return null;
  }

  if (withGithubStar) {
    return (
      <div className="logo logo-with-star-wrapper">
        <img alt="Midscene_logo" src={LogoUrl} />
        <a
          href="https://github.com/web-infra-dev/midscene"
          target="_blank"
          rel="noreferrer"
        >
          <img
            className="github-star"
            src="https://img.shields.io/github/stars/web-infra-dev/midscene?style=social"
            alt="Github star"
          />
        </a>
      </div>
    );
  }

  return (
    <div className="logo">
      <img
        alt="Midscene_logo"
        src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/Midscene.png"
      />
    </div>
  );
};
