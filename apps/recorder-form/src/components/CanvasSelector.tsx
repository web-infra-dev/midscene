import { useEffect, useRef, useState } from 'react';

interface CanvasElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clicked: boolean;
  label?: string;
}

interface CanvasSelectorProps {
  onChange?: (elements: CanvasElement[]) => void;
  value?: CanvasElement[];
}

const DEFAULT_ELEMENTS: CanvasElement[] = [
  {
    id: '1',
    x: 20,
    y: 20,
    width: 180,
    height: 32,
    clicked: false,
    label: 'Reading',
  },
  {
    id: '2',
    x: 20,
    y: 62,
    width: 180,
    height: 32,
    clicked: false,
    label: 'Music',
  },
  {
    id: '3',
    x: 20,
    y: 104,
    width: 180,
    height: 32,
    clicked: false,
    label: 'Sports',
  },
  {
    id: '4',
    x: 20,
    y: 146,
    width: 180,
    height: 32,
    clicked: false,
    label: 'Photography',
  },
];

const CHECKBOX_SIZE = 20;
const CHECKBOX_MARGIN = 12;

const CanvasSelector: React.FC<CanvasSelectorProps> = ({
  onChange,
  value = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<CanvasElement[]>(
    value.length > 0 ? value : DEFAULT_ELEMENTS,
  );
  const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(
    null,
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 400;
    canvas.height = 300;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    elements.forEach((element) => {
      // 选中高亮边框
      ctx.save();
      ctx.strokeStyle = element === selectedElement ? '#1890ff' : '#d9d9d9';
      ctx.lineWidth = element === selectedElement ? 2 : 1;
      ctx.strokeRect(element.x, element.y, element.width, element.height);
      ctx.restore();

      // 复选框
      const cbX = element.x + CHECKBOX_MARGIN;
      const cbY = element.y + (element.height - CHECKBOX_SIZE) / 2;
      ctx.save();
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.rect(cbX, cbY, CHECKBOX_SIZE, CHECKBOX_SIZE);
      ctx.fill();
      ctx.stroke();
      // 勾选
      if (element.clicked) {
        ctx.strokeStyle = '#1890ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cbX + 4, cbY + CHECKBOX_SIZE / 2);
        ctx.lineTo(cbX + CHECKBOX_SIZE / 2 - 2, cbY + CHECKBOX_SIZE - 5);
        ctx.lineTo(cbX + CHECKBOX_SIZE - 4, cbY + 6);
        ctx.stroke();
      }
      ctx.restore();

      // 文本
      ctx.save();
      ctx.fillStyle = '#333';
      ctx.font = '15px Arial';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        element.label || '',
        cbX + CHECKBOX_SIZE + 10,
        element.y + element.height / 2,
      );
      ctx.restore();
    });
  }, [elements, selectedElement]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 检查是否点击了复选框区域
    const clickedElement = elements.find((element) => {
      const cbX = element.x + CHECKBOX_MARGIN;
      const cbY = element.y + (element.height - CHECKBOX_SIZE) / 2;
      return (
        x >= cbX &&
        x <= cbX + CHECKBOX_SIZE &&
        y >= cbY &&
        y <= cbY + CHECKBOX_SIZE
      );
    });
    if (clickedElement) {
      const newElements = elements.map((el) =>
        el.id === clickedElement.id ? { ...el, clicked: !el.clicked } : el,
      );
      setElements(newElements);
      setSelectedElement(clickedElement);
      onChange?.(newElements);
      return;
    }

    // 检查是否点击了选项区域（高亮）
    const optionElement = elements.find(
      (element) =>
        x >= element.x &&
        x <= element.x + element.width &&
        y >= element.y &&
        y <= element.y + element.height,
    );
    if (optionElement) {
      setSelectedElement(optionElement);
      return;
    }

    // 开始绘制新元素
    setIsDrawing(true);
    setStartPoint({ x, y });
    setSelectedElement(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 检查鼠标是否在选项上
    const isOverOption = elements.some(
      (element) =>
        x >= element.x &&
        x <= element.x + element.width &&
        y >= element.y &&
        y <= element.y + element.height,
    );
    canvas.style.cursor = isOverOption ? 'pointer' : 'crosshair';

    if (!isDrawing || !startPoint) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    elements.forEach((element) => {
      ctx.save();
      ctx.strokeStyle = element === selectedElement ? '#1890ff' : '#d9d9d9';
      ctx.lineWidth = element === selectedElement ? 2 : 1;
      ctx.strokeRect(element.x, element.y, element.width, element.height);
      ctx.restore();
      // 复选框
      const cbX = element.x + CHECKBOX_MARGIN;
      const cbY = element.y + (element.height - CHECKBOX_SIZE) / 2;
      ctx.save();
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.rect(cbX, cbY, CHECKBOX_SIZE, CHECKBOX_SIZE);
      ctx.fill();
      ctx.stroke();
      if (element.clicked) {
        ctx.strokeStyle = '#1890ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cbX + 4, cbY + CHECKBOX_SIZE / 2);
        ctx.lineTo(cbX + CHECKBOX_SIZE / 2 - 2, cbY + CHECKBOX_SIZE - 5);
        ctx.lineTo(cbX + CHECKBOX_SIZE - 4, cbY + 6);
        ctx.stroke();
      }
      ctx.restore();
      // 文本
      ctx.save();
      ctx.fillStyle = '#333';
      ctx.font = '15px Arial';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        element.label || '',
        cbX + CHECKBOX_SIZE + 10,
        element.y + element.height / 2,
      );
      ctx.restore();
    });
    // 绘制新的选择框
    const width = currentX - startPoint.x;
    const height = currentY - startPoint.y;
    ctx.save();
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(startPoint.x, startPoint.y, width, height);
    ctx.restore();
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const width = endX - startPoint.x;
    const height = endY - startPoint.y;
    if (Math.abs(width) > 40 && Math.abs(height) > 24) {
      const newElement: CanvasElement = {
        id: Date.now().toString(),
        x: width > 0 ? startPoint.x : endX,
        y: height > 0 ? startPoint.y : endY,
        width: Math.abs(width),
        height: Math.abs(height),
        clicked: false,
        label: `Option ${elements.length + 1}`,
      };
      const newElements = [...elements, newElement];
      setElements(newElements);
      setSelectedElement(newElement);
      onChange?.(newElements);
    }
    setIsDrawing(false);
    setStartPoint(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          cursor: 'crosshair',
        }}
      />
    </div>
  );
};

export default CanvasSelector;
