import './logo.less';

export const LogoUrl =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/Midscene.png';

export const Logo = ({ hideLogo = false }: { hideLogo?: boolean }) => {
  if (hideLogo) {
    return null;
  }

  return (
    <div className="logo">
      <a href="https://midscenejs.com/" target="_blank" rel="noreferrer">
        <img
          alt="Midscene_logo"
          src="https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/Midscene.png"
        />
      </a>
    </div>
  );
};
