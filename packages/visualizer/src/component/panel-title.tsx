import './panel-title.less';

const PanelTitle = (props: {
  title: string;
  subTitle?: string;
}): JSX.Element => {
  const subTitleEl = props.subTitle ? (
    <div className="task-list-sub-name">{props.subTitle}</div>
  ) : null;
  return (
    <div className="panel-title">
      <div className="task-list-name">{props.title}</div>
      {subTitleEl}
    </div>
  );
};

export default PanelTitle;
