// Renders a downloaded sprite SVG as an <image> inside the hero's SVG scene,
// centered on its local origin so the animation/positioning groups can place and
// flip it cleanly. `facing = -1` mirrors horizontally around the center.

export default function Sprite({
  name,
  size,
  facing = 1,
  opacity = 1,
}: {
  name: string;
  size: number;
  facing?: number;
  opacity?: number;
}) {
  return (
    <g transform={facing === -1 ? "scale(-1,1)" : undefined}>
      <image
        href={`/sprites/${name}.svg`}
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        opacity={opacity}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}
