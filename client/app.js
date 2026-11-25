
function drawSingleToken(color, tokenIndex, pos) {
  const baseColor = COLOR_MAP[color];
  const lightColor = COLOR_LIGHT[color];

  const x = pos.x;
  const y = pos.y;

  const scale = 1;
  const h = C * 0.78;
  const baseW = C * 0.72;
  const headR = C * 0.19;

  ctx.save();

  // 1. Ground shadow
  ctx.beginPath();
  ctx.ellipse(
    x + 3,
    y + C * 0.25,
    baseW * 0.65,
    C * 0.16,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 2. Pawn base
  const baseY = y + C * 0.17;

  const baseGrad = ctx.createLinearGradient(
    x - baseW / 2,
    baseY - 5,
    x + baseW / 2,
    baseY + 7
  );

  baseGrad.addColorStop(0, lightColor);
  baseGrad.addColorStop(0.35, baseColor);
  baseGrad.addColorStop(1, "#202020");

  ctx.beginPath();
  ctx.ellipse(x, baseY, baseW / 2, C * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // Base highlight
  ctx.beginPath();
  ctx.ellipse(
    x - 2,
    baseY - 3,
    baseW * 0.36,
    C * 0.075,
    0,
    Math.PI,
    Math.PI * 2
  );
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Pawn body
  const bodyTop = y - h * 0.32;
  const bodyBottom = baseY - 3;

  const bodyGrad = ctx.createLinearGradient(
    x - baseW / 2,
    0,
    x + baseW / 2,
    0
  );

  bodyGrad.addColorStop(0, "#222");
  bodyGrad.addColorStop(0.18, lightColor);
  bodyGrad.addColorStop(0.42, baseColor);
  bodyGrad.addColorStop(0.72, lightColor);
  bodyGrad.addColorStop(1, "#222");

  ctx.beginPath();
  ctx.moveTo(x - C * 0.12, bodyTop);
  ctx.bezierCurveTo(
    x - C * 0.10, y - C * 0.05,
    x - C * 0.34, y + C * 0.02,
    x - C * 0.25, bodyBottom
  );
  ctx.quadraticCurveTo(
    x, bodyBottom + C * 0.12,
    x + C * 0.25, bodyBottom
  );
  ctx.bezierCurveTo(
    x + C * 0.34, y + C * 0.02,
    x + C * 0.10, y - C * 0.05,
    x + C * 0.12, bodyTop
  );
  ctx.closePath();

  ctx.fillStyle = bodyGrad;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // 4. Neck / collar
  ctx.beginPath();
  ctx.ellipse(
    x,
    bodyTop + C * 0.04,
    C * 0.17,
    C * 0.055,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = lightColor;
  ctx.fill();

  // 5. Pawn head
  const headX = x;
  const headY = bodyTop - headR * 0.55;

  const headGrad = ctx.createRadialGradient(
    headX - headR * 0.38,
    headY - headR * 0.45,
    1,
    headX,
    headY,
    headR * 1.3
  );

  headGrad.addColorStop(0, "#ffffff");
  headGrad.addColorStop(0.18, lightColor);
  headGrad.addColorStop(0.58, baseColor);
  headGrad.addColorStop(1, "#181818");

  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.shadowColor = baseColor;
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Head reflection
  ctx.beginPath();
  ctx.ellipse(
    headX - headR * 0.32,
    headY - headR * 0.38,
    headR * 0.25,
    headR * 0.13,
    -0.5,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fill();

  // 6. Token number
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${C * 0.25}px Rajdhani`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 2;
  ctx.fillText(tokenIndex + 1, x, y + C * 0.03);
  ctx.shadowBlur = 0;

  ctx.restore();
}
