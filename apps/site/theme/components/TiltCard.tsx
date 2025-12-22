import { useRef, useState, type MouseEvent } from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  href?: string;
}

export const TiltCard = ({ children, className, href }: TiltCardProps) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!ref.current) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();

    // Calculate position relative to center
    const x = (e.clientX - left - width / 2);
    const y = (e.clientY - top - height / 2);

    // Rotation intensity
    const xRot = y / 60; // Rotate around X axis based on Y position
    const yRot = -x / 60; // Rotate around Y axis based on X position

    setStyle({
      transform: `perspective(1000px) rotateX(${xRot}deg) rotateY(${yRot}deg) scale3d(1.02, 1.02, 1.02)`,
      transition: 'transform 0.1s ease-out',
      willChange: 'transform',
    });
  };

  const handleMouseLeave = () => {
    setStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.5s ease-out',
      willChange: 'transform',
    });
  };

  const Component = href ? 'a' : 'div';

  return (
    // @ts-ignore
    <Component
      ref={ref}
      href={href}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
    >
      {children}
    </Component>
  );
};
