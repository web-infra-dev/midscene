import './panel-title.less';

const PanelTitle = (props: { title: string }): JSX.Element => {
  return (
    <div>
      <div className="task-list-name">{props.title}</div>
    </div>
  );
};

export default PanelTitle;
