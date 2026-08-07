import React from 'react';

interface Props {
  color?: string;
  colors?: string[];
  className?: string;
  alt?: string;
  gazeX?: number;
  gazeY?: number;
}

const SlimeAvatar: React.FC<Props> = ({ color = '#38bdf8', colors, className = '', alt = 'Slime', gazeX, gazeY }) => {
  const palette = [color, ...(colors || []).filter(layer => layer && layer !== color)].slice(0, 8);
  return <div className={`relative isolate ${className}`} style={{ filter: `drop-shadow(0 0 16px ${color}88)` }}>
    <div className="absolute inset-[12%] rounded-full opacity-80 -z-10" style={{ background: color }} />
    {palette.slice(1).map((layer, index) => (
      <div
        key={`${layer}-${index}`}
        className="absolute rounded-full -z-10 opacity-90"
        style={{
          inset: `${15 + index * 2}% ${8 + index * 2}% ${8 + index * 2}% ${19 + index * 2}%`,
          border: `${Math.max(5, 12 - index)}px solid ${layer}`,
          transform: `translate(${5 + index * 2}%, ${3 + index}%)`,
        }}
      />
    ))}
    <img
      src="/assets/snake-mascot.png"
      alt={alt}
      draggable={false}
      className="w-full h-full object-contain animate-jelly"
      style={{ mixBlendMode: 'luminosity' }}
    />
    {gazeX !== undefined && gazeY !== undefined && (
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {[34.7, 65].map((left, index) => (
          <div
            key={index}
            className="absolute overflow-hidden rounded-[48%] bg-white border-2 border-[#071b58] shadow-[inset_0_-4px_0_rgba(125,211,252,.55)]"
            style={{ left: `${left}%`, top: '52.2%', width: '12.2%', height: '17.5%', transform: 'translate(-50%, -50%)' }}
          >
            <div
              className="absolute left-1/2 top-1/2 w-[52%] h-[66%] rounded-full bg-gradient-to-b from-[#071b58] to-[#0753a5] transition-transform duration-100 ease-linear shadow-[inset_0_-4px_0_#38bdf8]"
              style={{ transform: `translate(calc(-50% + ${gazeX * 30}%), calc(-50% + ${gazeY * 24}%))` }}
            >
              <span className="absolute left-[18%] top-[12%] w-[34%] h-[30%] rounded-full bg-white" />
            </div>
          </div>
        ))}
      </div>
    )}
  </div>;
};

export default SlimeAvatar;
